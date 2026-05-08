import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomInt, randomBytes } from "node:crypto";
import nodemailer from "nodemailer";
import { PrismaService } from "../../prisma/prisma.service.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Quita comillas envoltorio que a veces vienen en `.env` / Dokploy. */
function stripEnvQuotes(s: string | undefined): string | undefined {
  if (s == null) return undefined;
  let t = s.trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1);
    }
  }
  return t;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpByEmail = new Map<string, { code: string; expiresAt: number }>();
  private readonly lastOtpRequestAt = new Map<string, number>();
  private transporter: nodemailer.Transporter | null | undefined;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private smtpConfig():
    | { host: string; port: number; secure: boolean; user: string; pass: string }
    | null {
    const host = stripEnvQuotes(this.config.get<string>("SMTP_HOST"));
    if (!host) return null;
    const port = Number(stripEnvQuotes(this.config.get<string>("SMTP_PORT")) ?? "587") || 587;
    const secure = this.config.get<string>("SMTP_SECURE") === "1";
    const user = stripEnvQuotes(this.config.get<string>("SMTP_USER")) ?? "";
    const pass = stripEnvQuotes(this.config.get<string>("SMTP_PASS")) ?? "";
    if (!user || !pass) return null;
    return { host, port, secure, user, pass };
  }

  private smtpTransport(): nodemailer.Transporter | null {
    if (this.transporter === undefined) {
      const cfg = this.smtpConfig();
      if (!cfg) {
        this.transporter = null;
        return null;
      }
      this.transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass },
      });
    }
    return this.transporter;
  }

  /** Cabecera From: si SMTP_FROM no incluye @, se usa SMTP_USER como dirección. */
  private mailFromHeader(): string {
    const cfg = this.smtpConfig();
    const user = cfg?.user ?? stripEnvQuotes(this.config.get<string>("SMTP_USER")) ?? "";
    const raw = stripEnvQuotes(this.config.get<string>("SMTP_FROM"));
    const display = raw?.trim() ?? "";
    if (!display) {
      return user ? `The Forge <${user}>` : "The Forge <noreply@localhost>";
    }
    if (display.includes("@")) return display;
    if (user) return `"${display.replace(/"/g, "")}" <${user}>`;
    return display;
  }

  /** Host público de la web (Safari) para @domain #code y magic link. Lee WEB_DOMAIN del env. */
  private resolveWebAppHostname(): string | null {
    const raw = stripEnvQuotes(this.config.get<string>("WEB_DOMAIN"))?.trim();
    if (!raw) return null;
    let host = raw.toLowerCase();
    host = host.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^\./, '');
    if (!host || host.length > 253 || !/^[\w.-]+$/.test(host)) return null;
    if (host.includes('..')) return null;
    return host;
  }

  /**
   * Solicitud de OTP. El email viene del request; solo se envía si existe un usuario registrado con ese email.
   * Si no existe, devuelve ok igualmente (anti-enumeración).
   */
  async requestOtp(rawEmail: string): Promise<{ ok: true }> {
    const email = normalizeEmail(rawEmail);
    if (!email) {
      throw new BadRequestException("email requerido");
    }

    // Anti-enumeración: si el usuario no existe, devolvemos ok sin enviar nada.
    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) {
      this.logger.warn(`OTP solicitado para email no registrado: ${email}`);
      return { ok: true };
    }

    const now = Date.now();
    const last = this.lastOtpRequestAt.get(email) ?? 0;
    if (now - last < OTP_RESEND_MS) {
      return { ok: true };
    }

    if (isProduction() && !this.smtpConfig()) {
      this.logger.error(
        "SMTP_HOST, SMTP_USER y SMTP_PASS deben estar definidos en producción para OTP",
      );
      throw new ServiceUnavailableException("Envío de correo no disponible");
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    this.otpByEmail.set(email, { code, expiresAt: now + OTP_TTL_MS });
    this.lastOtpRequestAt.set(email, now);

    const transport = this.smtpTransport();
    if (!transport) {
      this.logger.warn(`OTP para ${email} (solo dev, sin SMTP): ${code}`);
      return { ok: true };
    }

    const from = this.mailFromHeader();

    // iOS domain-bound + magic link
    const appHost = this.resolveWebAppHostname();
    const domainLine = appHost ? `@${appHost} #${code}` : null;
    const magicLink = appHost
      ? `https://${appHost}/auth/magic-link?otp=${code}&email=${encodeURIComponent(email)}`
      : null;

    // Texto plano con formato iOS
    const textLines = [
      code,
      '',
      `Use ${code} as your The Forge verification code.`,
      '',
      `Your verification code is: ${code}`,
      '',
      `Tu código: ${code}. Vence en 10 minutos. Si no lo pediste, ignora.`,
    ];
    if (domainLine) textLines.push('', domainLine);
    if (magicLink) textLines.push('', `O toca este enlace: ${magicLink}`);
    const textBody = textLines.join('\n');

    const htmlMagicLink = magicLink
      ? `<a href="${magicLink}" style="display:inline-block;margin:16px 0;padding:14px 28px;background:#059669;color:#fff;border-radius:12px;font-size:16px;font-weight:700;text-decoration:none;text-align:center;">👉 Acceder al instante</a>
         <p style="margin:0 0 16px;font-size:13px;color:#64748b;">O ingresa el código manualmente.</p>`
      : '';
    const htmlDomainLine = domainLine
      ? `<p style="margin:12px 0 0;font-size:12px;color:#64748b;word-break:break-all;font-family:ui-monospace,monospace;">${domainLine}</p>`
      : '';

    try {
      await transport.sendMail({
        from,
        to: email,
        subject: `The Forge verification code ${code}`,
        text: textBody,
        html: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;padding:20px;color:#1e293b;max-width:480px;">
            <p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#059669;">The Forge</p>
            <p style="margin:0 0 8px;">Tu código de acceso:</p>
            <p style="margin:0 0 8px;font-size:28px;font-weight:800;color:#0f172a;">${code}</p>
            <p style="margin:0 0 8px;font-size:15px;color:#475569;">Use <strong>${code}</strong> as your verification code.</p>
            <p style="margin:0 0 16px;font-size:14px;color:#64748b;">Vence en 10 minutos.</p>
            ${htmlMagicLink}
            ${htmlDomainLine}
          </div>
        `,
      });
      this.logger.log(`OTP enviado por SMTP a ${email}`);
    } catch (err) {
      this.otpByEmail.delete(email);
      this.lastOtpRequestAt.delete(email);
      this.logger.error(`Fallo SMTP al enviar OTP: ${err instanceof Error ? err.message : err}`);
      throw new ServiceUnavailableException("No se pudo enviar el código por correo");
    }

    return { ok: true };
  }

  async verifyOtp(rawEmail: string, rawCode: string): Promise<{
    accessToken: string;
    user: { id: string; email: string; role: string };
  }> {
    const email = normalizeEmail(rawEmail);
    if (!email) {
      throw new BadRequestException("email requerido");
    }
    const code = rawCode.trim();

    const entry = this.otpByEmail.get(email);
    if (!entry || Date.now() > entry.expiresAt || entry.code !== code) {
      throw new UnauthorizedException("Código o correo inválido");
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Código o correo inválido");
    }

    this.otpByEmail.delete(email);

    // Generar mcpSecret automático si no existe (primera vez) — NO ROMPER
    if (!user.mcpSecret) {
      const mcpSecret = randomBytes(32).toString("hex");
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mcpSecret },
      });
      this.logger.log(`MCP secret generado automáticamente para ${email}`);
    }

    // Usar el role real del usuario desde la DB
    const userRole = user.role ?? "developer";

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: userRole,
      name: user.name ?? undefined,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: userRole },
    };
  }

  /**
   * MCP M2M login: intercambia un secreto de usuario por un JWT con el userId real.
   * Cada usuario tiene su propio mcpSecret en la tabla User, que puede ver y rotar desde la UI.
   */
  async mcpLogin(secret: string): Promise<{ accessToken: string; user: { id: string; email: string; role: string } }> {
    const user = await this.prisma.user.findUnique({
      where: { mcpSecret: secret },
    });
    if (!user) {
      throw new UnauthorizedException("Secreto MCP inválido");
    }
    const userRole = user.role ?? "developer";
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: userRole,
      name: user.name ?? undefined,
    });
    return {
      accessToken,
      user: { id: user.id, email: user.email, role: userRole },
    };
  }

  async getMcpSecret(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mcpSecret: true, email: true },
    });
    if (!user) throw new UnauthorizedException("Usuario no encontrado");
    // Si no tiene secret, generarlo automáticamente
    if (!user.mcpSecret) {
      const { mcpSecret } = await this.regenerateMcpSecret(userId);
      return {
        message: "Se generó un nuevo secret para tu cuenta. Guárdalo de inmediato.",
        mcpSecret,
        email: user.email,
      };
    }
    return { mcpSecret: user.mcpSecret, email: user.email };
  }

  async regenerateMcpSecret(userId: string) {
    const mcpSecret = randomBytes(32).toString("hex");

    await this.prisma.user.update({
      where: { id: userId },
      data: { mcpSecret },
    });

    this.logger.log(`MCP secret regenerado para usuario ${userId}`);
    return { mcpSecret };
  }

  // ─── SSO ───

  /**
   * Login via SSO externo.
   * Valida el token contra SSO_URL/verify, crea/actualiza usuario local y emite JWT.
   */
  async ssoLogin(ssoToken: string): Promise<{
    accessToken: string;
    user: { id: string; email: string; role: string; name: string | null };
    ssoUrl?: string;
  }> {
    const ssoUrl = stripEnvQuotes(this.config.get<string>("SSO_URL"));
    if (!ssoUrl) {
      throw new BadRequestException("SSO no configurado (SSO_URL)");
    }

    const verifyUrl = `${ssoUrl.replace(/\/$/, "")}/verify`;
    const ssoRes = await fetch(verifyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: ssoToken }),
    });

    if (!ssoRes.ok) {
      throw new UnauthorizedException("Token SSO inválido");
    }

    const ssoData = (await ssoRes.json()) as {
      email?: string;
      role?: string;
      name?: string;
    };

    if (!ssoData?.email) {
      throw new BadRequestException("SSO no devolvió email");
    }

    const email = ssoData.email.trim().toLowerCase();
    const role = ssoData.role === "admin" ? "admin" : "developer";
    const name = ssoData.name?.trim() || null;

    // Crear o actualizar usuario local
    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email, name, role },
      update: { name, role },
    });

    // Asegurar mcpSecret (NO ROMPER)
    if (!user.mcpSecret) {
      const mcpSecret = randomBytes(32).toString("hex");
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mcpSecret },
      });
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name ?? undefined,
    });

    return {
      accessToken,
      user: { id: user.id, email: user.email, role: user.role, name: user.name },
      ssoUrl,
    };
  }

  // ─── Users CRUD ───

  /** Obtener perfil del usuario autenticado. */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, role: true, name: true, mcpSecret: true, createdAt: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      hasMcpSecret: !!user.mcpSecret,
      createdAt: user.createdAt,
    };
  }

  /** Listar todos los usuarios (admin-only). */
  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, role: true, name: true, mcpSecret: true, createdAt: true },
    });
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      name: u.name,
      hasMcpSecret: !!u.mcpSecret,
      createdAt: u.createdAt,
    }));
  }

  /** Obtener mcpSecret de cualquier usuario (admin-only). Genera uno si falta. */
  async getUserMcpSecretAdmin(userId: string): Promise<{ mcpSecret: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { mcpSecret: true, email: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    if (!user.mcpSecret) {
      const mcpSecret = this.generateMcpSecret();
      await this.prisma.user.update({ where: { id: userId }, data: { mcpSecret } });
      this.logger.log(`MCP secret generado por admin para usuario ${userId}`);
      return { mcpSecret, email: user.email };
    }
    return { mcpSecret: user.mcpSecret, email: user.email };
  }

  /** Regenerar mcpSecret de cualquier usuario (admin-only). */
  async regenerateUserMcpSecretAdmin(userId: string): Promise<{ mcpSecret: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException("Usuario no encontrado");
    const mcpSecret = this.generateMcpSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mcpSecret } });
    this.logger.log(`MCP secret regenerado por admin para usuario ${userId}`);
    return { mcpSecret, email: user.email };
  }

  /** Cambiar rol de un usuario (admin-only). No permite degradarse a sí mismo (developer). */
  async updateUserRole(targetUserId: string, role: string, actorUserId: string) {
    if (role !== "admin" && role !== "developer") {
      throw new BadRequestException("Rol inválido. Use 'admin' o 'developer'.");
    }
    if (targetUserId === actorUserId && role === "developer") {
      throw new ForbiddenException("No puedes degradar tu propio rol de administrador");
    }
    const user = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!user) throw new NotFoundException("Usuario no encontrado");

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { role },
    });

    return { id: targetUserId, email: user.email, role };
  }

  /** GET /auth/has-users — verifica si hay usuarios registrados. */
  async hasUsers(): Promise<{ hasUsers: boolean }> {
    const count = await this.prisma.user.count();
    return { hasUsers: count > 0 };
  }

  /** POST /auth/register-first-admin — crea el primer admin. */
  async registerFirstAdmin(
    email: string,
    name?: string,
  ): Promise<{ created: boolean; message: string; user?: { id: string; email: string; role: string } }> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.count();
    if (existing > 0) {
      return { created: false, message: "Ya existen usuarios registrados" };
    }
    try {
      const user = await this.prisma.user.create({
        data: {
          email: normalized,
          name: name?.trim() || null,
          role: "admin",
          mcpSecret: this.generateMcpSecret(),
        },
      });
      return {
        created: true,
        message: "Administrador creado exitosamente",
        user: { id: user.id, email: user.email, role: user.role },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      return { created: false, message: msg };
    }
  }

  private generateMcpSecret(): string {
    return randomBytes(32).toString("hex");
  }

  /** POST /users — crear usuario manualmente (admin). */
  async createUser(
    email: string,
    name?: string,
    role?: string,
  ): Promise<{ id: string; email: string; role: string }> {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) {
      throw new BadRequestException("El email ya está registrado");
    }
    const user = await this.prisma.user.create({
      data: {
        email: normalized,
        name: name?.trim() || null,
        role: role === "admin" ? "admin" : "developer",
        mcpSecret: this.generateMcpSecret(),
      },
    });
    return { id: user.id, email: user.email, role: user.role };
  }

  /** DELETE /users/:id — eliminar usuario (admin). No permite borrar la propia cuenta. */
  async deleteUser(targetUserId: string, actorUserId: string): Promise<{ deleted: boolean }> {
    if (targetUserId === actorUserId) {
      throw new ForbiddenException("No puedes eliminar tu propia cuenta");
    }
    try {
      await this.prisma.user.delete({ where: { id: targetUserId } });
      return { deleted: true };
    } catch {
      throw new NotFoundException("Usuario no encontrado");
    }
  }
}

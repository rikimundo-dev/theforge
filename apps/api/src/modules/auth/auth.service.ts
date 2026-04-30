import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { randomInt } from "node:crypto";
import nodemailer from "nodemailer";
import { PrismaService } from "../../prisma/prisma.service.js";
import { ADMIN_ROLE, DEFAULT_ALLOWED_OTP_EMAIL } from "./auth.constants.js";

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

  /** Único destinatario OTP: `EMAIL_OTP` (prod/Docker), si no `AUTH_ALLOWED_OTP_EMAIL`, si no default de desarrollo. */
  private allowedEmail(): string {
    const emailOtp = stripEnvQuotes(this.config.get<string>("EMAIL_OTP"));
    const legacy = stripEnvQuotes(this.config.get<string>("AUTH_ALLOWED_OTP_EMAIL"));
    const raw = emailOtp?.trim() || legacy?.trim();
    return raw ? normalizeEmail(raw) : DEFAULT_ALLOWED_OTP_EMAIL;
  }

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

  /**
   * Solicitud de OTP: el código solo se envía a `EMAIL_OTP` / `AUTH_ALLOWED_OTP_EMAIL` (dev: default en constantes).
   */
  async requestOtp(): Promise<{ ok: true }> {
    const email = this.allowedEmail();
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
    try {
      await transport.sendMail({
        from,
        to: email,
        subject: "Código de acceso — The Forge",
        text: `Tu código: ${code}\nVence en 10 minutos.`,
        html: `<p>Tu código: <strong>${code}</strong></p><p>Vence en 10 minutos.</p>`,
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

  async verifyOtp(rawCode: string): Promise<{
    accessToken: string;
    user: { email: string; role: string };
  }> {
    const email = this.allowedEmail();
    const code = rawCode.trim();

    const entry = this.otpByEmail.get(email);
    if (!entry || Date.now() > entry.expiresAt || entry.code !== code) {
      throw new UnauthorizedException("Código o correo inválido");
    }

    this.otpByEmail.delete(email);

    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email },
      update: {},
    });

    // Generar mcpSecret automático si no existe (primera vez)
    if (!user.mcpSecret) {
      const { randomBytes } = await import("node:crypto");
      const mcpSecret = randomBytes(32).toString("hex");
      await this.prisma.user.update({
        where: { id: user.id },
        data: { mcpSecret },
      });
      this.logger.log(`MCP secret generado automáticamente para ${email}`);
    }

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: ADMIN_ROLE,
    });

    return {
      accessToken,
      user: { email: user.email, role: ADMIN_ROLE },
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
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: ADMIN_ROLE,
    });
    return {
      accessToken,
      user: { id: user.id, email: user.email, role: ADMIN_ROLE },
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
    // Generar secret criptográfico de 32 bytes (hex = 64 chars)
    const { randomBytes } = await import("node:crypto");
    const mcpSecret = randomBytes(32).toString("hex");

    await this.prisma.user.update({
      where: { id: userId },
      data: { mcpSecret },
    });

    this.logger.log(`MCP secret regenerado para usuario ${userId}`);
    return { mcpSecret };
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { Public } from "../../common/decorators/public.decorator.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard.js";
import { getRequestUserId, getRequestUserRole } from "../../common/request-user.store.js";
import { ForbiddenException } from "@nestjs/common";

const requestOtpSchema = z.object({
  email: z.string().email().optional(),
}).strict();

const verifyOtpSchema = z.object({
  code: z.string().min(6).max(8),
  email: z.string().email().optional(),
}).strict();

const mcpLoginSchema = z.object({
  secret: z.string().min(1),
}).strict();

const ssoLoginSchema = z.object({
  token: z.string().min(1),
}).strict();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new BadRequestException(r.error.flatten());
  }
  return r.data;
}

@Controller("auth")
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  @Public()
  @HttpCode(200)
  requestOtp(@Body() body: unknown) {
    const raw = body != null && typeof body === "object" ? body : {};
    parseBody(requestOtpSchema, raw);
    return this.auth.requestOtp();
  }

  @Post("otp/verify")
  @Public()
  @HttpCode(200)
  verify(@Body() body: unknown) {
    const parsed = parseBody(verifyOtpSchema, body);
    return this.auth.verifyOtp(parsed.code);
  }

  @Post("mcp-login")
  @Public()
  @HttpCode(200)
  mcpLogin(@Body() body: unknown) {
    const parsed = parseBody(mcpLoginSchema, body);
    return this.auth.mcpLogin(parsed.secret);
  }

  /**
   * POST /auth/sso/login
   * Login mediante SSO externo. Solo disponible si SSO_URL está configurada.
   */
  @Post("sso/login")
  @Public()
  @HttpCode(200)
  ssoLogin(@Body() body: unknown) {
    const parsed = parseBody(ssoLoginSchema, body);
    return this.auth.ssoLogin(parsed.token);
  }

  // Protected endpoints (no @Public() → requires JWT via JwtAuthGuard at class level)

  /** GET /auth/me — Perfil del usuario autenticado. */
  @Get("me")
  getMe() {
    const userId = getRequestUserId();
    return this.auth.getMe(userId);
  }

  @Get("mcp-secret")
  getMcpSecret() {
    const userId = getRequestUserId();
    return this.auth.getMcpSecret(userId);
  }

  @Post("mcp-secret/regenerate")
  @HttpCode(200)
  regenerateMcpSecret() {
    const userId = getRequestUserId();
    return this.auth.regenerateMcpSecret(userId);
  }
}

/**
 * Controlador de usuarios (admin-only).
 * Rutas bajo /users para gestionar usuarios y roles.
 */
@Controller("users")
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  private requireAdmin() {
    const role = getRequestUserRole();
    if (role !== "admin") {
      throw new ForbiddenException("Se requiere rol admin");
    }
  }

  @Get()
  listUsers() {
    this.requireAdmin();
    return this.auth.listUsers();
  }

  @Patch(":id/role")
  updateRole(@Param("id") id: string, @Body() body: { role?: string }) {
    this.requireAdmin();
    if (!body?.role) throw new BadRequestException("role requerido");
    return this.auth.updateUserRole(id, body.role);
  }
}

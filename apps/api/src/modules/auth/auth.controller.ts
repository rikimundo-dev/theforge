import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { Public } from "../../common/decorators/public.decorator.js";
import { AuthService } from "./auth.service.js";

/** Cuerpo opcional; si llega `email` se ignora (el envío va siempre a EMAIL_OTP / allowed). */
const requestOtpSchema = z
  .object({
    email: z.string().email().optional(),
  })
  .strict();

const verifyOtpSchema = z
  .object({
    code: z.string().min(6).max(8),
    email: z.string().email().optional(),
  })
  .strict();

const mcpLoginSchema = z
  .object({
    secret: z.string().min(1),
  })
  .strict();

function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    throw new BadRequestException(r.error.flatten());
  }
  return r.data;
}

@Public()
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("otp/request")
  @HttpCode(200)
  requestOtp(@Body() body: unknown) {
    const raw = body != null && typeof body === "object" ? body : {};
    parseBody(requestOtpSchema, raw);
    return this.auth.requestOtp();
  }

  @Post("otp/verify")
  @HttpCode(200)
  verify(@Body() body: unknown) {
    const parsed = parseBody(verifyOtpSchema, body);
    return this.auth.verifyOtp(parsed.code);
  }

  @Post("mcp-login")
  @HttpCode(200)
  mcpLogin(@Body() body: unknown) {
    const parsed = parseBody(mcpLoginSchema, body);
    return this.auth.mcpLogin(parsed.secret);
  }
}

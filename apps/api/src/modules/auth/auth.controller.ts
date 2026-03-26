import { BadRequestException, Body, Controller, HttpCode, Post } from "@nestjs/common";
import { z } from "zod";
import { Public } from "../../common/decorators/public.decorator.js";
import { AuthService } from "./auth.service.js";

const requestOtpSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().min(6).max(8),
});

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
    const parsed = parseBody(requestOtpSchema, body);
    return this.auth.requestOtp(parsed.email);
  }

  @Post("otp/verify")
  @HttpCode(200)
  verify(@Body() body: unknown) {
    const parsed = parseBody(verifyOtpSchema, body);
    return this.auth.verifyOtp(parsed.email, parsed.code);
  }
}

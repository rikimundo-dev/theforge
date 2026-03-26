import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";

export interface JwtValidatedUser {
  userId: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>("JWT_SECRET");
    if (!secret && process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET is required in production");
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret ?? "dev-only-insecure-jwt-secret",
    });
  }

  validate(payload: { sub: string; email: string; role: string }): JwtValidatedUser {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}

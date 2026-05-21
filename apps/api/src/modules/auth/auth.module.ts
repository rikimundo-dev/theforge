import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import type { SignOptions } from "jsonwebtoken";
import { AuthController, UsersController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { BootstrapAdminService } from "./bootstrap-admin.service.js";
import { JwtStrategy } from "./jwt.strategy.js";
import { UserProvidersModule } from "../user-providers/user-providers.module.js";

@Module({
  imports: [
    UserProvidersModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const expiresIn = (config.get<string>("JWT_EXPIRES_IN") ?? "7d") as SignOptions["expiresIn"];
        const secret = config.get<string>("JWT_SECRET");
        if (!secret) {
          if (process.env.NODE_ENV === "production") {
            throw new Error("JWT_SECRET is required in production");
          }
          return {
            secret: "dev-only-insecure-jwt-secret",
            signOptions: { expiresIn },
          };
        }
        return {
          secret,
          signOptions: { expiresIn },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [AuthService, JwtStrategy, BootstrapAdminService],
  exports: [AuthService],
})
export class AuthModule {}

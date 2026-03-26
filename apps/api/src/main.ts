import { config } from "dotenv";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

// Cargar .env de la raíz del repo (turbo ejecuta con cwd = apps/api) y luego local
config({ path: resolve(process.cwd(), "../../.env") });
config();

// Evitar MaxListenersExceededWarning cuando streams/LLM añaden múltiples abort listeners
import { EventEmitter } from "node:events";
import { json, urlencoded } from "express";

EventEmitter.defaultMaxListeners = 20;
if (typeof process.setMaxListeners === "function") process.setMaxListeners(20);

function corsOriginsFromEnv(): string[] {
  const raw = process.env.CORS_ORIGINS?.trim();
  const list = raw
    ? raw
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : [];
  if (list.length > 0) return list;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "CORS_ORIGINS is required in production (lista separada por comas, ej. https://app.tudominio.com)",
    );
  }
  return ["http://localhost:5173", "http://127.0.0.1:5173"];
}

function stripEnvQuotes(s: string | undefined): string | undefined {
  if (s == null) return undefined;
  let t = s.trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      t = t.slice(1, -1).trim();
    }
  }
  return t || undefined;
}

/** En producción solo ese correo recibe OTP; debe venir del entorno (Docker/Dokploy). */
function assertOtpRecipientEmailInProduction(): void {
  if (process.env.NODE_ENV !== "production") return;
  const email = stripEnvQuotes(process.env.EMAIL_OTP) ?? stripEnvQuotes(process.env.AUTH_ALLOWED_OTP_EMAIL);
  if (!email?.includes("@")) {
    throw new Error(
      "EMAIL_OTP (recomendado) o AUTH_ALLOWED_OTP_EMAIL es obligatorio en producción: único correo autorizado para OTP (ej. EMAIL_OTP=tu@dominio.com)",
    );
  }
}

async function bootstrap() {
  assertOtpRecipientEmailInProduction();
  const app = await NestFactory.create(AppModule);
  const origins = corsOriginsFromEnv();
  app.enableCors({ origin: origins, credentials: true });

  // Increase body size limit for MDD content
  app.use(json({ limit: "50mb" }));
  app.use(urlencoded({ extended: true, limit: "50mb" }));

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();

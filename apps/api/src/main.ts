/**
 * @fileoverview Punto de entrada de **@theforge/api** (NestJS). Carga variables de entorno desde la raíz del
 * monorepo y locales, ajusta límites de `EventEmitter`, valida correo OTP en producción, aplica CORS estricto,
 * body JSON/urlencoded (hasta 50mb para contenido MDD) y escucha en `PORT` (default 3000).
 *
 * @copyright 2026 Jorge Correa
 * @license Apache-2.0
 * @author Jorge Correa <jcorrea@e-personal.net>
 */
import { config } from "dotenv";
import * as dns from "node:dns";
import { resolve } from "node:path";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

// SMTP (p. ej. Gmail): priorizar IPv4 evita timeouts cuando IPv6 no llega al servidor de correo.
if (typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

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

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const origins = corsOriginsFromEnv();
  app.enableCors({ origin: origins, credentials: true });

  // Increase body size limit for MDD content
  app.use(json({ limit: "50mb" }));
  app.use(urlencoded({ extended: true, limit: "50mb" }));

  // Timeout largo para pipelines de generación MDD (hasta 10 min)
  const httpServer = app.getHttpServer();
  httpServer.timeout = parseInt(process.env.HTTP_SERVER_TIMEOUT_MS ?? "600000", 10);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
}

bootstrap();

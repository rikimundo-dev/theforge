/**
 * @fileoverview Módulo raíz **AppModule** de The Forge API: configuración global, Prisma, auth JWT, módulos de
 * dominio (proyectos, sesiones, AI, engine con semáforo MDD y costes), orquestador, análisis, flujo legacy y
 * guard/interceptor globales (`JwtAuthGuard`, `UserContextInterceptor`).
 *
 * @copyright 2026 Jorge Correa
 * @license Apache-2.0
 */
import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { UserContextInterceptor } from "./common/interceptors/user-context.interceptor.js";
import { JwtAuthGuard } from "./common/guards/jwt-auth.guard.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { HealthController } from "./health.controller.js";
import { AuthModule } from "./modules/auth/auth.module.js";
import { AiModule } from "./modules/ai/ai.module.js";
import { EngineModule } from "./modules/engine/engine.module.js";
import { ProjectsModule } from "./modules/projects/projects.module.js";
import { SessionsModule } from "./modules/sessions/sessions.module.js";
import { AiOrchestratorModule } from "./modules/ai-orchestrator/ai-orchestrator.module.js";
import { AiAnalysisModule } from "./modules/ai-analysis/ai-analysis.module.js";
import { TheForgeModule } from "./modules/theforge/theforge.module.js";
import { LegacyFlowModule } from "./modules/legacy-flow/legacy-flow.module.js";
import { AudioModule } from "./modules/audio/audio.module.js";
import { AdminModule } from "./modules/admin/admin.module.js";
import { ChangeLogModule } from "./modules/change-log/change-log.module.js";
import { CryptoModule } from "./modules/crypto/crypto.module.js";
import { UserProvidersModule } from "./modules/user-providers/user-providers.module.js";

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CryptoModule,
    AuthModule,
    PrismaModule,
    UserProvidersModule,
    AiModule,
    EngineModule,
    ProjectsModule,
    SessionsModule,
    AiOrchestratorModule,
    AiAnalysisModule,
    TheForgeModule,
    LegacyFlowModule,
    AudioModule,
    AdminModule,
    ChangeLogModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: UserContextInterceptor },
  ],
})
export class AppModule { }

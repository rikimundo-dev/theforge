/**
 * Design Reference Module — TheForge
 * Catálogo de 54 design systems reales para inspirar la Guía UX/UI.
 * + Scanner de URLs para extraer tokens de diseño de cualquier página.
 * + Matching automático por dominio del MDD.
 */
import { Module } from "@nestjs/common";
import { DesignRefController } from "./design-ref.controller.js";
import { DesignRefService } from "./design-ref.service.js";

@Module({
  controllers: [DesignRefController],
  providers: [DesignRefService],
  exports: [DesignRefService],
})
export class DesignRefModule {}
/**
 * DesignReferenceController
 *
 * Endpoints:
 *   GET /api/design-refs — lista todas
 *   GET /api/design-refs/:slug — detalle completo
 *   POST /api/design-refs/auto-match — matching automático por contexto MDD
 *   POST /api/design-refs/scan-url — escanea URL para extraer tokens (pendiente implementación)
 */
import { Controller, Get, Post, Param, Body } from "@nestjs/common";
import { DesignRefService } from "./design-ref.service.js";

@Controller("design-refs")
export class DesignRefController {
  constructor(private readonly service: DesignRefService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get(":slug")
  getBySlug(@Param("slug") slug: string) {
    const ref = this.service.getBySlug(slug);
    if (!ref) {
      return { error: `Design reference "${slug}" not found` };
    }
    return ref;
  }

  @Post("auto-match")
  autoMatch(@Body("mddContext") mddContext: string) {
    if (!mddContext?.trim()) {
      return { error: "mddContext is required" };
    }
    return this.service.autoMatch(mddContext);
  }

  @Post("scan-url")
  async scanUrl(@Body("url") url: string) {
    if (!url?.trim()) {
      return { error: "URL is required" };
    }
    // Por ahora: stub que devuelve lo que se puede extraer
    // En futura iteración: Puppeteer/curl + parsear CSS vars + Google Fonts
    return {
      url,
      status: "stub",
      message:
        "El scanner de URLs extraerá colores, tipografías y CSS variables de la página. Pendiente de implementación con Puppeteer/Playwright.",
    };
  }
}
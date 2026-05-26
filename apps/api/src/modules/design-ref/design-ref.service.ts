/**
 * DesignReferenceService
 *
 * Gestiona el catálogo de design references, scanning de URLs y matching automático.
 */
import { Injectable } from "@nestjs/common";
import { getDesignBySlug, getDesignReferenceList, matchDesignByDomain, formatDesignReferencePrompt } from "./data/design-references.js";

@Injectable()
export class DesignRefService {
  /**
   * Lista todas las design references (metadata básica para el selector).
   */
  list() {
    return getDesignReferenceList();
  }

  /**
   * Obtiene una design reference completa por slug.
   */
  getBySlug(slug: string) {
    const ref = getDesignBySlug(slug);
    if (!ref) return null;
    return ref;
  }

  /**
   * Matching automático: dado el contexto del MDD, devuelve las 3 mejores sugerencias.
   */
  autoMatch(mddContext: string) {
    const matches = matchDesignByDomain(mddContext);
    return matches;
  }

  /**
   * Genera el bloque de contexto para inyectar en el prompt de la Guía UX/UI.
   */
  getPromptBlock(slug: string): string | null {
    const ref = getDesignBySlug(slug);
    if (!ref) return null;
    return formatDesignReferencePrompt(ref);
  }
}
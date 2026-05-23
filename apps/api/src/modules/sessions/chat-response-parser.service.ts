import { Injectable } from "@nestjs/common";
import {
  normalizeDashes,
  stripChatLabel as stripChatLabelUtil,
  cleanDocumentContent as cleanDocumentContentUtil,
} from "./document-content.util.js";

/**
 * Responsabilidad única: parsear respuestas del chat que contienen documentos
 * delimitados (---FIN_MDD---, ---FIN_UX_UI---, etc.) y fusionar secciones de MDD.
 * Usado por SessionsService para separar documento vs mensaje y limpiar contenido.
 */
@Injectable()
export class ChatResponseParserService {
  /** Separa documento del mensaje de chat por delimitador ---FIN_TAG---. */
  splitDocAndChat(response: string, tag: string): { docPart: string; chatPart: string } | null {
    const trimmed = response.trim();
    const normalized = normalizeDashes(trimmed);
    const regex = new RegExp(`-{1,}FIN_${tag}-{1,}`, "i");
    const match = normalized.match(regex);
    if (match) {
      const idx = normalized.indexOf(match[0]);
      const docPart = trimmed.slice(0, idx).trim();
      const chatPart = trimmed.slice(idx + match[0].length).trim();
      if (docPart.length > 0) return { docPart, chatPart };
    }
    const lineDelimiter = normalized.match(new RegExp(`\\n(\\s*-{0,}\\s*FIN_${tag}\\s*-{0,}\\s*)\\n`, "i"));
    if (lineDelimiter) {
      const idx = normalized.indexOf(lineDelimiter[0]);
      const docPart = trimmed.slice(0, idx).trim();
      const chatPart = trimmed.slice(idx + lineDelimiter[0].length).trim();
      if (docPart.length > 0) return { docPart, chatPart };
    }
    return null;
  }

  splitMddAndChat(response: string): { mddPart: string; chatPart: string } | null {
    const res = this.splitDocAndChat(response, "MDD");
    if (res) return { mddPart: res.docPart, chatPart: res.chatPart };
    return null;
  }

  splitDbgaAndChat(response: string): { docPart: string; chatPart: string } | null {
    return this.splitDocAndChat(response, "DBGA");
  }

  splitPhase0AndChat(response: string): { docPart: string; chatPart: string } | null {
    return this.splitDocAndChat(response, "PHASE0");
  }

  /** Full-replacement merge for Phase0 (documento completo, sin secciones numeradas). */
  mergePhase0OrUseFull(currentPhase0: string | undefined, newPart: string): string {
    const cleaned = newPart.trim();
    if (!cleaned) return (currentPhase0 ?? "").trim();
    const current = (currentPhase0 ?? "").trim();
    const looksLikeFullDoc = cleaned.length >= 500;
    if (looksLikeFullDoc) return cleaned;
    return current || cleaned;
  }

  /**
   * DBGA (Paso 0): el modelo suele mandar solo el fragmento nuevo + ---FIN_DBGA---.
   * Sin merge, eso reemplaza todo el benchmark y “borra” el documento.
   */
  mergeDbgaOrUseFull(currentDbga: string | undefined, newPart: string): string {
    const cleaned = newPart.trim();
    if (!cleaned) return (currentDbga ?? "").trim();
    const current = (currentDbga ?? "").trim();
    if (!current) return cleaned;

    const hasBenchmarkTitle = /#\s*Domain\s+Benchmark|#\s*Benchmark\s*&\s*Gap/i.test(
      cleaned,
    );
    const looksLikeFullDbga =
      hasBenchmarkTitle &&
      cleaned.length >= Math.min(current.length * 0.5, 2000);

    if (looksLikeFullDbga && cleaned.length >= current.length * 0.45) {
      return cleaned;
    }

    const wouldWipe = current.length > 1200 && cleaned.length < current.length * 0.4;
    if (wouldWipe) {
      if (/^#+\s*(?:dos\s+objetivos|objetivos\s+centrales)/im.test(cleaned)) {
        return `${cleaned}\n\n${current}`;
      }
      return `${current}\n\n---\n\n${cleaned}`;
    }

    if (cleaned.length >= current.length * 0.85) return cleaned;
    if (/\n##\s+/i.test(cleaned) && cleaned.length < current.length * 0.85) {
      return this.mergeDocSectionOrUseFull(current, cleaned);
    }
    return `${current}\n\n---\n\n${cleaned}`;
  }

  splitUxUiGuideAndChat(response: string): { docPart: string; chatPart: string } | null {
    return this.splitDocAndChat(response, "UX_UI");
  }

  /**
   * Si newPart parece MDD completo, lo devuelve. Si es una sección (ej. ## 5. Lógica),
   * reemplaza esa sección en currentMdd. Si es mensaje conversacional, no sobrescribe.
   */
  mergeMddSectionOrUseFull(currentMdd: string | undefined, newPart: string): string {
    const cleaned = newPart.trim();
    if (!cleaned) return (currentMdd ?? "").trim();

    const current = (currentMdd ?? "").trim();
    const hasSectionHeader = /\n##\s*\d+\.\s+/i.test(cleaned) || /^#+\s*\d+\.\s+/m.test(cleaned);
    if (!hasSectionHeader && cleaned.length < 600) return current;

    const looksLikeFullMdd = /##\s*1\.\s+/i.test(cleaned) && (/##\s*2\.\s+/i.test(cleaned) || /##\s*3\.\s+/i.test(cleaned));
    if (looksLikeFullMdd) return cleaned;

    const singleSectionMatch = cleaned.match(/^#+\s*(\d+)\.\s+/m);
    const sectionNum = singleSectionMatch ? parseInt(singleSectionMatch[1], 10) : null;
    if (sectionNum == null || !current) return cleaned;

    const sectionStart = current.match(new RegExp(`(?:^|\\n)(##\\s*${sectionNum}\\.\\s+)`, "i"));
    if (!sectionStart?.index) return cleaned;
    const from = sectionStart.index + (sectionStart[0].startsWith("\n") ? 1 : 0);
    const nextSection = current.slice(from + 1).match(/\n##\s*\d+\.\s+/);
    const to = nextSection?.index != null ? from + 1 + nextSection.index : current.length;
    const before = current.slice(0, from).trimEnd();
    const after = current.slice(to).trimStart();
    return [before, cleaned, after].filter(Boolean).join("\n\n");
  }

  /**
   * Generic merge for documents with numbered sections (## N. or ### N.).
   * If newPart is a full document (≥2 sections), returns as-is.
   * If it's a single section, merges it into currentDoc.
   * If it's too short or no section header, returns currentDoc unchanged.
   * Handles both ## and ### heading levels.
   */
  mergeDocSectionOrUseFull(currentDoc: string | undefined, newPart: string): string {
    const cleaned = newPart.trim();
    if (!cleaned) return (currentDoc ?? "").trim();
    const current = (currentDoc ?? "").trim();

    // Detect heading level (## or ###)
    const headingMatch = cleaned.match(/^#{2,3}\s*(\d+)\.\s+/m);
    if (!headingMatch) {
      // No numbered section header — not a Blueprint section, preserve existing
      return current;
    }

    const headingPrefix = headingMatch[0].match(/^#{2,3}/)?.[0] ?? "##";
    const sectionNum = parseInt(headingMatch[1], 10);

    // Check if it looks like a FULL document (has multiple sections)
    const nextSectionRe = new RegExp(`\\n${headingPrefix}\\s*\\d+\\.\\s+`, "i");
    const hasMultipleSections = (cleaned.match(nextSectionRe)?.length ?? 0) >= 2;
    if (hasMultipleSections) return cleaned;

    // Single section — merge into existing document
    if (!current) return cleaned;
    const escNum = sectionNum;
    const escPrefix = headingPrefix.replace("#", "\\#");
    const sectionStart = current.match(
      new RegExp(`(?:^|\\n)(${escPrefix}\\s*${escNum}\\.\\s+)`, "i"),
    );
    if (!sectionStart?.index) {
      // Section number not found — append cleaned to document
      return `${current}\n\n${cleaned}`;
    }
    const from = sectionStart.index + (sectionStart[0].startsWith("\n") ? 1 : 0);
    const nextSection = current.slice(from + 1).match(
      new RegExp(`\\n${escPrefix}\\s*\\d+\\.\\s+`),
    );
    const to =
      nextSection?.index != null ? from + 1 + nextSection.index : current.length;
    const before = current.slice(0, from).trimEnd();
    const after = current.slice(to).trimStart();
    return [before, cleaned, after].filter(Boolean).join("\n\n");
  }

  /**
   * Safe merge for UX/UI guide (free-form document, no numbered sections).
   * If newPart looks like a complete guide (starts with # heading, ≥300 chars),
   * returns it. Otherwise keeps the current document.
   */
  mergeUxUiGuideSectionOrUseFull(currentUx: string | undefined, newPart: string): string {
    const cleaned = newPart.trim();
    if (!cleaned) return (currentUx ?? "").trim();
    const current = (currentUx ?? "").trim();

    // Looks like a complete guide: starts with # heading and is long enough
    const hasHeading = /^#\s/.test(cleaned) || /^#\w/.test(cleaned);
    const isLongEnough = cleaned.length >= 300;
    const isMuchShorter = current.length > 0 && cleaned.length < current.length * 0.3;

    if (hasHeading && isLongEnough) return cleaned;
    if (isLongEnough && !isMuchShorter) return cleaned;
    // Fragment — preserve existing
    return current;
  }

  /**
   * Split document and chat with a flexible delimiter regex.
   * Unlike splitDocAndChat (requires -{1,}FIN_TAG-{1,}), this also handles
   * edge cases where the delimiter has no leading newline or has extra spaces.
   */
  splitDocWithFlexibleDelimiter(response: string, tag: string): { docPart: string; chatPart: string } | null {
    const trimmed = response.trim();
    const normalized = normalizeDashes(trimmed);
    // Match FIN_TAG with flexible dashes (at least 1), possibly preceded by \n or space
    const regex = new RegExp(`\\n?-{1,}\\s*FIN_${tag}\\s*-{1,}`, "i");
    const match = normalized.match(regex);
    if (!match) return null;

    const idx = normalized.indexOf(match[0]);
    // If the match started with \n, adjust index by 1
    const adjIdx = match[0].startsWith("\n") ? idx + 1 : idx;
    const docPart = trimmed.slice(0, adjIdx).trim();
    const chatPart = trimmed.slice(adjIdx + match[0].length).trim();
    if (docPart.length > 0) return { docPart, chatPart };

    return null;
  }

  cleanDocumentContent(text: string): string {
    return cleanDocumentContentUtil(text);
  }

  /**
   * Fallback: detecta documento por patrón de encabezado cuando el LLM omite ---FIN_TAG---.
   * Aplica para tabs: architecture, use-cases, user-stories, spec, blueprint,
   * api-contracts, logic-flows, tasks, infra.
   */
  detectDocFallback(response: string, activeTab: string): { docPart: string; chatPart: string } | null {
    const trimmed = response?.trim();
    if (!trimmed || trimmed.length < 200) return null;

    const HEADING_PATTERNS: Record<string, RegExp> = {
      architecture: /^#\s*(?:Arquitectura|Architecture)\b/im,
      "use-cases": /^#\s*(?:Casos de Uso|Use Cases)\b/im,
      "user-stories": /^#\s*(?:Historias de Usuario|User Stories)\b/im,
      spec: /^#\s*Spec\b/i,
      blueprint: /^#\s*Blueprint\b/i,
      "api-contracts": /^#\s*(?:Contratos de API|API Contracts)\b/im,
      "logic-flows": /^#\s*(?:Flujos de L.gica|Logic Flows)\b/im,
      tasks: /^#\s*(?:Tareas|Tasks)\b/i,
      infra: /^#\s*(?:Infraestructura|Infrastructure|Infra(?![a-z]))(?:\s|$)/im,
      benchmark: /^#\s*(?:Benchmark|Domain Benchmark|Análisis)\b/im,
      brd: /^#\s*(?:BRD|Business Requirements Document)\b/im,
      phase0: /^#\s*(?:Fase 0|Phase 0|Especificador)/im,
    };

    const pattern = HEADING_PATTERNS[activeTab];
    if (!pattern) return null;
    const match = trimmed.match(pattern);
    if (!match?.index) return null;

    const docStartIdx = match.index;
    const docSection = docStartIdx > 0 ? trimmed.slice(docStartIdx) : trimmed;
    const hrMatch = docSection.match(/\n\s*[-*_]{3,}\s*\n/);
    const docPart = (hrMatch && hrMatch.index != null
      ? docSection.slice(0, hrMatch.index)
      : docSection
    ).trim();

    const afterHr = hrMatch && hrMatch.index != null
      ? docSection.slice(hrMatch.index + hrMatch[0].length).trim()
      : "";
    const beforeDoc = docStartIdx > 0 ? trimmed.slice(0, docStartIdx).trim() : "";
    const label = activeTab.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const chatPart = afterHr || beforeDoc
      ? [beforeDoc, afterHr].filter(Boolean).join("\n\n")
      : `${label} actualizado. Revisa el panel del documento.`;

    return { docPart, chatPart };
  }

  stripChatLabel(text: string): string {
    return stripChatLabelUtil(text);
  }
}

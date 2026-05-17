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

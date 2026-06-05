/** Cleanup after an in-document Design System print (clone on body). */
interface DesignSystemPrintSession {
  clone: HTMLElement;
}

const DESIGN_SYSTEM_PRINT_BODY_CLASS = "printing-design-system";
const DESIGN_SYSTEM_PRINT_HTML_CLASS = "printing-design-system";
const MARKDOWN_PRINT_BODY_CLASS = "printing-md-content";
const MARKDOWN_PRINT_HTML_CLASS = "printing-md-content";

/**
 * CSS autocontenido para impresión markdown.
 * No importar hoja de estilos de la app: trae overflow:hidden / 100dvh y rompe paginación.
 */
export const MARKDOWN_PRINT_STYLES = `
@page {
  margin: 1.8cm;
  size: auto;
}

html, body {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
  position: static !important;
  width: 100% !important;
  margin: 0;
  padding: 0;
  background: #fff !important;
  color: #111 !important;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

.markdown-preview {
  display: block !important;
  position: static !important;
  inset: auto !important;
  width: 100% !important;
  max-width: 900px;
  margin: 0 auto !important;
  padding: 0 !important;
  overflow: visible !important;
  height: auto !important;
  max-height: none !important;
  background: #fff !important;
  color: #111 !important;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 11pt;
  line-height: 1.55;
}

.markdown-preview * {
  overflow: visible !important;
  max-height: none !important;
  color: inherit;
}

.markdown-preview h1 {
  font-size: 1.65rem;
  font-weight: 700;
  margin: 0 0 1rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid #ccc;
  break-after: avoid;
  page-break-after: avoid;
}

.markdown-preview h2 {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 1.35rem 0 0.65rem;
  break-after: avoid;
  page-break-after: avoid;
}

.markdown-preview h3 {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 1rem 0 0.45rem;
  break-after: avoid;
  page-break-after: avoid;
}

.markdown-preview h4, .markdown-preview h5, .markdown-preview h6 {
  font-weight: 600;
  margin: 0.85rem 0 0.35rem;
  break-after: avoid;
  page-break-after: avoid;
}

.markdown-preview p {
  margin: 0 0 0.65rem;
  orphans: 3;
  widows: 3;
}

.markdown-preview ul, .markdown-preview ol {
  margin: 0 0 0.75rem;
  padding-left: 1.35rem;
}

.markdown-preview li {
  margin: 0.2rem 0;
}

.markdown-preview li > p {
  margin: 0;
}

.markdown-preview table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.75rem 0 1rem;
  font-size: 10pt;
  break-inside: auto;
  page-break-inside: auto;
}

.markdown-preview thead {
  display: table-header-group;
}

.markdown-preview tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

.markdown-preview th, .markdown-preview td {
  border: 1px solid #bbb;
  padding: 6px 8px;
  text-align: left;
  vertical-align: top;
}

.markdown-preview th {
  background: #f3f3f3 !important;
  font-weight: 600;
}

.markdown-preview pre {
  white-space: pre-wrap;
  word-break: break-word;
  border: 1px solid #ddd;
  padding: 10px 12px;
  margin: 0.75rem 0;
  background: #f7f7f7 !important;
  font-size: 9pt;
  break-inside: avoid;
  page-break-inside: avoid;
}

.markdown-preview code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.92em;
  background: #f2f2f2 !important;
  padding: 1px 4px;
  border-radius: 3px;
}

.markdown-preview pre code {
  background: transparent !important;
  padding: 0;
}

.markdown-preview blockquote {
  margin: 0.75rem 0;
  padding-left: 0.85rem;
  border-left: 3px solid #ccc;
  color: #444;
}

.markdown-preview hr {
  border: none;
  border-top: 1px solid #ccc;
  margin: 1.25rem 0;
}

.markdown-preview img, .markdown-preview svg {
  max-width: 100% !important;
  height: auto !important;
}

.markdown-preview a {
  color: #111;
  text-decoration: underline;
}
`;

function buildMarkdownPrintHtml(contentHtml: string, title = "Imprimir documento"): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title.replace(/[<>&"]/g, "")}</title>
  <style>${MARKDOWN_PRINT_STYLES}</style>
</head>
<body>
  ${contentHtml}
</body>
</html>`;
}

function buildMarkdownPrintClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  if (!clone.classList.contains("markdown-preview")) {
    clone.classList.add("markdown-preview");
  }
  clone.setAttribute("data-md-print-clone", "true");
  clone.querySelectorAll("[style]").forEach((el) => {
    (el as HTMLElement).style.removeProperty("max-height");
    (el as HTMLElement).style.removeProperty("overflow");
  });
  return clone;
}

function printMarkdownInDocument(clone: HTMLElement): void {
  document.body.appendChild(clone);
  document.body.classList.add(MARKDOWN_PRINT_BODY_CLASS);
  document.documentElement.classList.add(MARKDOWN_PRINT_HTML_CLASS);

  const cleanup = () => {
    document.body.classList.remove(MARKDOWN_PRINT_BODY_CLASS);
    document.documentElement.classList.remove(MARKDOWN_PRINT_HTML_CLASS);
    clone.remove();
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}

/**
 * Imprime un preview markdown con paginación correcta (sin position:fixed ni overflow:hidden de la app).
 */
export function printMarkdownDocument(
  source: HTMLElement,
  options?: { title?: string },
): boolean {
  if (!(source.textContent ?? "").trim()) {
    console.warn("[print] Markdown preview is empty");
    return false;
  }

  const clone = buildMarkdownPrintClone(source);
  const contentHtml = clone.outerHTML;
  const title = options?.title ?? "Imprimir documento";

  const printWin = window.open("", "_blank", "noopener,noreferrer");
  if (!printWin) {
    printMarkdownInDocument(clone);
    return true;
  }

  try {
    printWin.document.open();
    printWin.document.write(buildMarkdownPrintHtml(contentHtml, title));
    printWin.document.close();

    const triggerPrint = () => {
      printWin.focus();
      printWin.print();
    };

    printWin.addEventListener("load", triggerPrint, { once: true });
    setTimeout(triggerPrint, 350);
    return true;
  } catch (err) {
    console.warn("[print] Markdown popup print failed, falling back in-document", err);
    try {
      printWin.close();
    } catch {
      /* ignore */
    }
    printMarkdownInDocument(clone);
    return true;
  }
}

function hasPrintableDesignSystemContent(root: HTMLElement): boolean {
  const sections = root.querySelectorAll(".design-system-print-section");
  if (sections.length > 0) {
    return Array.from(sections).some((s) => (s.textContent ?? "").trim().length > 0);
  }
  return (root.textContent ?? "").trim().length > 0;
}

function buildDesignSystemPrintClone(source: HTMLElement): HTMLElement {
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".design-system-print-hide").forEach((el) => el.remove());
  clone.setAttribute("data-design-system-print-clone", "true");
  clone.style.background = "#fff";
  clone.style.color = "#111";
  return clone;
}

/**
 * Print Design System tokens in the current document.
 * Appends a DOM clone to `body` so print CSS can show it without breaking React's tree.
 */
export function printDesignSystemDocument(source: HTMLElement): boolean {
  if (!hasPrintableDesignSystemContent(source)) {
    console.warn("[print] Design system preview has no printable content");
    return false;
  }

  let session: DesignSystemPrintSession | null = null;

  const cleanup = () => {
    document.body.classList.remove(DESIGN_SYSTEM_PRINT_BODY_CLASS);
    document.documentElement.classList.remove(DESIGN_SYSTEM_PRINT_HTML_CLASS);
    session?.clone.remove();
    session = null;
  };

  try {
    const clone = buildDesignSystemPrintClone(source);
    if (!clone.innerHTML.trim()) {
      console.warn("[print] Design system print clone is empty");
      return false;
    }

    session = { clone };
    document.body.appendChild(clone);
    document.body.classList.add(DESIGN_SYSTEM_PRINT_BODY_CLASS);
    document.documentElement.classList.add(DESIGN_SYSTEM_PRINT_HTML_CLASS);
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    return true;
  } catch (err) {
    console.warn("[print] Design system print failed", err);
    cleanup();
    return false;
  }
}

/** @deprecated Usar {@link printMarkdownDocument} con CSS dedicado. */
export function collectDocumentStylesForPrint(): string {
  return MARKDOWN_PRINT_STYLES;
}

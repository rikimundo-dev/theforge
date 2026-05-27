/** Cleanup after an in-document Design System print (clone on body). */
interface DesignSystemPrintSession {
  clone: HTMLElement;
}

const DESIGN_SYSTEM_PRINT_BODY_CLASS = "printing-design-system";
const DESIGN_SYSTEM_PRINT_HTML_CLASS = "printing-design-system";

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

/** Collect same-origin stylesheet rules for markdown popup print. */
export function collectDocumentStylesForPrint(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules ?? [])
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .join("\n");
}

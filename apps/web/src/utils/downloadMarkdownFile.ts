/**
 * Triggers a browser download of a single markdown document.
 */
export function downloadMarkdownFile(filename: string, content: string): void {
  const trimmed = content.trim();
  if (!trimmed) return;

  const safeName = filename.replace(/[^\w\u00C0-\u024F.\-]/gi, "-");
  const blob = new Blob([trimmed], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = safeName.endsWith(".md") ? safeName : `${safeName}.md`;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

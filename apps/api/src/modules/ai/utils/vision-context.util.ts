import {
  VISION_CONTEXT_HEADER,
  contentIncludesVisionBlock,
} from "@theforge/shared-types";

export { VISION_CONTEXT_HEADER, contentIncludesVisionBlock };

export function formatVisionContextBlock(summary: string): string {
  const s = summary.trim();
  if (!s) return "";
  return `${VISION_CONTEXT_HEADER}\n${s}`;
}

export function mergeUserTextWithVisionBlock(userText: string, visionBlock: string): string {
  const block = visionBlock.trim();
  if (!block) return userText.trim();
  const head = userText.trim() || "(Imagen adjunta)";
  return `${head}\n\n${block}`;
}

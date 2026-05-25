/**
 * Convierte secciones "Flujo de …" en diagramas Mermaid (flowchart).
 */

const FLOW_HEADING = /^#{2,4}\s+Flujo de\s+/i;

/** Etiquetas seguras para flowchart (sin {}, /, comillas rotas). */
export function escapeMermaidLabel(s: string): string {
  return s
    .replace(/["[\]{}()#;|<>]/g, " ")
    .replace(/\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
}

function slugId(i: number): string {
  return `s${i}`;
}

/** "Evento en origen: texto" → etiqueta corta para nodo */
function stepLabel(line: string): string {
  const t = line.replace(/^[-*]\s+/, "").trim();
  const colon = t.match(/^([^:]+):\s*(.+)$/);
  if (colon) return `${colon[1]!.trim()} — ${colon[2]!.trim().slice(0, 32)}`;
  return t.slice(0, 48);
}

export function stepsToFlowchartMermaid(steps: string[]): string {
  if (steps.length === 0) return "";
  const lines = ["```mermaid", "flowchart TD"];
  for (let i = 0; i < steps.length; i++) {
    const id = slugId(i);
    const label = escapeMermaidLabel(stepLabel(steps[i]!));
    lines.push(`  ${id}("${label}")`);
    if (i > 0) lines.push(`  ${slugId(i - 1)} --> ${id}`);
  }
  lines.push("```");
  return `${lines.join("\n")}\n`;
}

/** Flujo Odoo con rama Si existe / Si no existe */
export function odooCostFlowToMermaid(lines: string[]): string {
  const pre: string[] = [];
  const existsBranch: string[] = [];
  const notExistsBranch: string[] = [];
  let phase: "pre" | "exists" | "notexists" = "pre";

  for (const raw of lines) {
    const t = raw.replace(/^[-*]\s+/, "").trim();
    if (!t) continue;
    if (/^Si existe:/i.test(t)) {
      phase = "exists";
      continue;
    }
    if (/^Si no existe:/i.test(t)) {
      phase = "notexists";
      continue;
    }
    if (phase === "pre") pre.push(t);
    else if (phase === "exists") existsBranch.push(t);
    else notExistsBranch.push(t);
  }

  const out = ["```mermaid", "flowchart TD"];
  let last = "start";
  out.push(`  start("Inicio")`);
  pre.forEach((step, i) => {
    const id = `p${i}`;
    out.push(`  ${id}("${escapeMermaidLabel(stepLabel(step))}")`);
    out.push(`  ${last} --> ${id}`);
    last = id;
  });
  out.push(`  dec{"Registro existe?"}`);
  out.push(`  ${last} --> dec`);
  existsBranch.forEach((step, i) => {
    const id = `e${i}`;
    out.push(`  ${id}("${escapeMermaidLabel(stepLabel(step))}")`);
    out.push(i === 0 ? `  dec -->|Si| ${id}` : `  e${i - 1} --> ${id}`);
  });
  const lastE = existsBranch.length ? `e${existsBranch.length - 1}` : "dec";
  notExistsBranch.forEach((step, i) => {
    const id = `n${i}`;
    out.push(`  ${id}("${escapeMermaidLabel(stepLabel(step))}")`);
    out.push(i === 0 ? `  dec -->|No| ${id}` : `  n${i - 1} --> ${id}`);
  });
  const endFrom = notExistsBranch.length
    ? `n${notExistsBranch.length - 1}`
    : existsBranch.length
      ? lastE
      : "dec";
  out.push(`  finish("Respuesta API")`);
  out.push(`  ${endFrom} --> finish`);
  out.push("```");
  return `${out.join("\n")}\n`;
}

export function repairFlowSectionsToMermaid(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;
    const t = line.trim();
    if (FLOW_HEADING.test(t)) {
      out.push(line);
      i++;
      const body: string[] = [];
      while (i < lines.length) {
        const lt = lines[i]!.trim();
        if (/^#{1,4}\s/.test(lt) && !FLOW_HEADING.test(lt)) break;
        if (/^```mermaid/i.test(lt)) {
          while (i < lines.length && !/^```\s*$/.test(lines[i]!.trim())) i++;
          if (i < lines.length) i++;
          break;
        }
        body.push(lines[i]!);
        i++;
      }
      const steps = body
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("```") && !/^#{1,6}\s/.test(l));
      const isOdoo = /procesamiento/i.test(t) && steps.some((s) => /Si existe:/i.test(s));
      const bullets = steps
        .filter((s) => !/^Si (no )?existe:/i.test(s))
        .map((s) => (s.startsWith("- ") ? s : `- ${s.replace(/^[-*]\s+/, "")}`));
      const mermaid = isOdoo ? odooCostFlowToMermaid(steps) : stepsToFlowchartMermaid(steps);
      if (mermaid) {
        out.push("");
        out.push(mermaid.trimEnd());
        out.push("");
        if (bullets.length > 0) {
          out.push(...bullets);
          out.push("");
        }
      } else {
        out.push(...body);
      }
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join("\n");
}

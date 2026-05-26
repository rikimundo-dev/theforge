/**
 * Serializa un Phase0Document a markdown legible para inyectar como dbgaContent
 * en el pipeline MDD existente.
 */

import type { Phase0Document } from "./phase0.types.js";

export function phase0ToMarkdown(doc: Phase0Document): string {
  const lines: string[] = [];
  lines.push("# Fase 0 — Especificación Inicial");
  lines.push("");

  // 1. Propósito
  lines.push("## 1. Propósito y Alcance");
  lines.push("");
  lines.push(`**Problema:** ${doc.proposito.problema || "No definido"}`);
  lines.push("");
  if (doc.proposito.usuarios.length > 0) {
    lines.push("**Usuarios objetivo:**");
    doc.proposito.usuarios.forEach((u) => lines.push(`- ${u}`));
    lines.push("");
  }
  if (doc.proposito.outOfScope.length > 0) {
    lines.push("**Fuera de alcance:**");
    doc.proposito.outOfScope.forEach((o) => lines.push(`- ${o}`));
    lines.push("");
  }

  // 2. Entidades
  lines.push("## 2. Entidades del Dominio");
  lines.push("");
  if (doc.entidades.length === 0) {
    lines.push("*(No definidas)*");
  } else {
    doc.entidades.forEach((e) => {
      lines.push(`### ${e.nombre}`);
      lines.push(`**Descripción:** ${e.descripcion}`);
      if (e.atributosClave.length > 0) {
        lines.push(`**Atributos clave:** ${e.atributosClave.join(", ")}`);
      }
      lines.push("");
    });
  }

  // 3. Reglas de Negocio
  lines.push("## 3. Reglas de Negocio");
  lines.push("");
  if (doc.reglasNegocio.length === 0) {
    lines.push("*(No definidas)*");
  } else {
    doc.reglasNegocio.forEach((r) => lines.push(`- ${r}`));
  }
  lines.push("");

  // 4. Flujos
  lines.push("## 4. Flujos Principales");
  lines.push("");
  if (doc.flujos.length === 0) {
    lines.push("*(No definidos)*");
  } else {
    doc.flujos.forEach((f) => {
      lines.push(`### ${f.nombre}`);
      f.pasos.forEach((p, i) => lines.push(`${i + 1}. ${p}`));
      lines.push("");
    });
  }

  // 5. Roles
  lines.push("## 5. Roles y Permisos");
  lines.push("");
  if (doc.roles.length === 0) {
    lines.push("*(No definidos)*");
  } else {
    doc.roles.forEach((r) => {
      lines.push(`- **${r.rol}:** ${r.permisos.join(", ")}`);
    });
  }
  lines.push("");

  // 6. Integraciones
  lines.push("## 6. Integraciones Externas");
  lines.push("");
  if (doc.integraciones.length === 0) {
    lines.push("*(No definidas)*");
  } else {
    doc.integraciones.forEach((i) => lines.push(`- ${i}`));
  }
  lines.push("");

  // 7. Edge Cases
  lines.push("## 7. Edge Cases y Supuestos");
  lines.push("");
  if (doc.edgeCases.length === 0) {
    lines.push("*(No definidos)*");
  } else {
    doc.edgeCases.forEach((ec) => lines.push(`- ${ec}`));
  }
  lines.push("");

  // 8. Pendientes
  if (doc.preguntasPendientes.length > 0) {
    lines.push("## 8. Preguntas Pendientes");
    lines.push("");
    doc.preguntasPendientes.forEach((p) => lines.push(`- ${p}`));
    lines.push("");
  }

  return lines.join("\n");
}

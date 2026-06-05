#!/usr/bin/env node
/**
 * Valida un MDD en disco aplicando el pipeline determinista de entrega.
 * Uso: node scripts/validate-mdd-file.mjs <ruta-al-mdd.txt> [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  applyDeterministicCrossConsistencyFixes,
  detectCrossConsistencyIssues,
  detectDuplicateOutboxTables,
  finalizeMddDeliverable,
  validateMddStructure,
} from "../src/modules/ai-analysis/utils/mdd-sanitize.ts";
import { reconcileUiUxDesignIntent } from "../src/modules/ai-analysis/utils/mdd-enrich-uiux-intent.ts";

const inputPath = process.argv[2];
const shouldWrite = process.argv.includes("--write");

if (!inputPath) {
  console.error("Uso: node --import tsx scripts/validate-mdd-file.mjs <mdd.txt> [--write]");
  process.exit(1);
}

const abs = resolve(inputPath);
const raw = readFileSync(abs, "utf8");
const beforeIssues = detectCrossConsistencyIssues(raw);
const fixed = reconcileUiUxDesignIntent(finalizeMddDeliverable(raw));
const afterIssues = detectCrossConsistencyIssues(fixed);
const structure = validateMddStructure(fixed);

const count = (re, text) => (text.match(re) ?? []).length;

console.log("=== Validación MDD ===");
console.log("Archivo:", abs);
console.log("Líneas antes:", raw.split("\n").length);
console.log("Líneas después:", fixed.split("\n").length);
console.log("");
console.log("--- Métricas de coherencia ---");
console.log("Rutas /api/ sin v1 (§4):", count(/\|\s*(?:GET|POST)[^|\n]*\/api\/(?!v1\/)/gi, fixed));
console.log("approve-first:", count(/approve-first/gi, fixed));
console.log("approve-second:", count(/approve-second/gi, fixed));
console.log("/export/approve genérico:", count(/\/export\/approve(?!-first|-second)/gi, fixed));
console.log("api_prefix manifest:", fixed.match(/"api_prefix"\s*:\s*"([^"]+)"/)?.[1] ?? "—");
console.log("hashing_algorithm:", fixed.match(/"hashing_algorithm"\s*:\s*"([^"]+)"/)?.[1] ?? "—");
console.log("auth_provider:", fixed.match(/"auth_provider"\s*:\s*"([^"]+)"/)?.[1] ?? "—");
console.log("Columnas UI genéricas (id, name, status):", count(/\bid,\s*name,\s*status\b/g, fixed));
const duplicateOutbox = detectDuplicateOutboxTables(fixed);
const section6Present = !structure.missingSections.includes("6. Seguridad");
console.log("outbox duplicado:", duplicateOutbox ? "sí" : "no");
console.log("§6 presente:", section6Present ? "sí" : "no");
console.log("");
console.log("--- Issues antes (" + beforeIssues.length + ") ---");
for (const i of beforeIssues) console.log("  •", i);
console.log("");
console.log("--- Issues después (" + afterIssues.length + ") ---");
for (const i of afterIssues) console.log("  •", i);
console.log("");
console.log("--- Estructura ---");
console.log("Secciones faltantes:", structure.missingSections.join(", ") || "ninguna");
console.log("Orden secciones OK:", structure.sectionOrderCorrect);
console.log("TechnicalMetadata:", structure.hasTechnicalMetadata);
if (structure.issues.length) {
  for (const i of structure.issues) console.log("  •", i);
}

if (shouldWrite) {
  const outPath = abs.replace(/(\.[^.]+)?$/, "-validated$1");
  writeFileSync(outPath, fixed, "utf8");
  console.log("");
  console.log("Escrito:", outPath);
}

const missingCriticalSection = structure.missingSections.length > 0;
const exitFail =
  afterIssues.length > 0 || missingCriticalSection || duplicateOutbox;
process.exit(exitFail ? 1 : 0);

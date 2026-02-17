import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { lintSql, extractSqlBlocks, extractJsonBlocks } from "../utils/linters.js";

/**
 * Tool para validar sintaxis SQL en el MDD (Sección 3).
 * Extrae bloques ```sql y los valida con node-sql-parser.
 */
export function createValidateSqlTool() {
    return tool(
        async ({ mdd_draft }: { mdd_draft: string }) => {
            const blocks = extractSqlBlocks(mdd_draft);
            if (blocks.length === 0) {
                return JSON.stringify({
                    valid: false,
                    issue: "No se encontraron bloques ```sql en el documento.",
                    suggestions: "Añade el esquema de base de datos en bloques ```sql en la Sección 3.",
                });
            }

            const results = blocks.map((sql) => lintSql(sql));
            const allErrors = results.flatMap((r) => r.errors);

            return JSON.stringify({
                valid: allErrors.length === 0,
                blocks_checked: blocks.length,
                errors: allErrors,
                suggestion: allErrors.length > 0 ? "Corrige los errores de sintaxis SQL reportados." : "Sintaxis SQL válida.",
            }, null, 2);
        },
        {
            name: "validate_sql_syntax",
            description: "Valida la sintaxis SQL de todos los bloques ```sql en el MDD usando un parser de PostgreSQL. Útil para asegurar que el modelo de datos (Sección 3) no tenga errores técnicos.",
            schema: z.object({
                mdd_draft: z.string().describe("Borrador completo del MDD o fragmento que contiene el SQL."),
            }),
        }
    );
}

/**
 * Tool para validar payloads JSON en los contratos de API (Sección 4).
 * Extrae bloques ```json y verifica que sean JSON válidos.
 */
export function createValidateJsonPayloadsTool() {
    return tool(
        async ({ mdd_draft }: { mdd_draft: string }) => {
            const blocks = extractJsonBlocks(mdd_draft);
            if (blocks.length === 0) {
                return JSON.stringify({
                    valid: false,
                    issue: "No se encontraron bloques ```json en el documento.",
                    suggestions: "Añade ejemplos de Request/Response en bloques ```json en la Sección 4.",
                });
            }

            const errors: { block_index: number; error: string; snippet: string }[] = [];
            blocks.forEach((json, index) => {
                try {
                    JSON.parse(json);
                } catch (err: any) {
                    errors.push({
                        block_index: index,
                        error: err.message,
                        snippet: json.slice(0, 100) + (json.length > 100 ? "..." : ""),
                    });
                }
            });

            return JSON.stringify({
                valid: errors.length === 0,
                blocks_checked: blocks.length,
                errors: errors,
                suggestion: errors.length > 0 ? "Corrige el formato JSON de los bloques reportados." : "Todos los payloads JSON son válidos.",
            }, null, 2);
        },
        {
            name: "validate_json_payloads",
            description: "Valida que todos los bloques ```json en el MDD (especialmente en la Sección 4) sean JSON válidos. Ayuda a evitar errores de sintaxis en los contratos de API.",
            schema: z.object({
                mdd_draft: z.string().describe("Borrador completo del MDD o fragmento que contiene los JSON."),
            }),
        }
    );
}

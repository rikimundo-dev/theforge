import { z } from "zod";
export declare const mddJsonSchema: z.ZodObject<{
    db_entities: z.ZodDefault<z.ZodArray<z.ZodUnknown, "many">>;
    business_core: z.ZodOptional<z.ZodNullable<z.ZodUnknown>>;
    edge_cases: z.ZodOptional<z.ZodUnknown>;
    field_types: z.ZodOptional<z.ZodUnknown>;
}, "strip", z.ZodTypeAny, {
    db_entities: unknown[];
    business_core?: unknown;
    edge_cases?: unknown;
    field_types?: unknown;
}, {
    db_entities?: unknown[] | undefined;
    business_core?: unknown;
    edge_cases?: unknown;
    field_types?: unknown;
}>;
export type MddJson = z.infer<typeof mddJsonSchema>;

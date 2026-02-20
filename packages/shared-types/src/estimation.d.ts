import { z } from "zod";
export declare const teamStructureSchema: z.ZodObject<{
    architect: z.ZodOptional<z.ZodNumber>;
    back: z.ZodOptional<z.ZodNumber>;
    front: z.ZodOptional<z.ZodNumber>;
    ux: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    architect?: number | undefined;
    back?: number | undefined;
    front?: number | undefined;
    ux?: number | undefined;
}, {
    architect?: number | undefined;
    back?: number | undefined;
    front?: number | undefined;
    ux?: number | undefined;
}>;
export declare const estimationResponseSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    totalHours: z.ZodNumber;
    totalMxn: z.ZodNumber;
    teamStructure: z.ZodObject<{
        architect: z.ZodOptional<z.ZodNumber>;
        back: z.ZodOptional<z.ZodNumber>;
        front: z.ZodOptional<z.ZodNumber>;
        ux: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        architect?: number | undefined;
        back?: number | undefined;
        front?: number | undefined;
        ux?: number | undefined;
    }, {
        architect?: number | undefined;
        back?: number | undefined;
        front?: number | undefined;
        ux?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    id: string;
    projectId: string;
    totalHours: number;
    totalMxn: number;
    teamStructure: {
        architect?: number | undefined;
        back?: number | undefined;
        front?: number | undefined;
        ux?: number | undefined;
    };
}, {
    id: string;
    projectId: string;
    totalHours: number;
    totalMxn: number;
    teamStructure: {
        architect?: number | undefined;
        back?: number | undefined;
        front?: number | undefined;
        ux?: number | undefined;
    };
}>;
export type TeamStructure = z.infer<typeof teamStructureSchema>;
export type EstimationResponse = z.infer<typeof estimationResponseSchema>;

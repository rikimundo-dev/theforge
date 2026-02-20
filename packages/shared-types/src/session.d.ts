import { z } from "zod";
declare const chatMessageSchema: z.ZodObject<{
    role: z.ZodEnum<["user", "assistant"]>;
    content: z.ZodString;
    tab: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: "user" | "assistant";
    content: string;
    tab?: string | undefined;
}, {
    role: "user" | "assistant";
    content: string;
    tab?: string | undefined;
}>;
export declare const contextStepEnum: readonly ["CONTEXT", "DATA", "LOGIC", "SECURITY"];
export type ContextStep = (typeof contextStepEnum)[number];
export declare const createSessionSchema: z.ZodObject<{
    projectId: z.ZodString;
    contextStep: z.ZodDefault<z.ZodEnum<["CONTEXT", "DATA", "LOGIC", "SECURITY"]>>;
    chatLog: z.ZodDefault<z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["user", "assistant"]>;
        content: z.ZodString;
        tab: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }, {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    projectId: string;
    chatLog: {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }[];
    contextStep: "CONTEXT" | "DATA" | "LOGIC" | "SECURITY";
}, {
    projectId: string;
    chatLog?: {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }[] | undefined;
    contextStep?: "CONTEXT" | "DATA" | "LOGIC" | "SECURITY" | undefined;
}>;
export declare const appendChatSchema: z.ZodObject<{
    role: z.ZodEnum<["user", "assistant"]>;
    content: z.ZodString;
    tab: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    role: "user" | "assistant";
    content: string;
    tab?: string | undefined;
}, {
    role: "user" | "assistant";
    content: string;
    tab?: string | undefined;
}>;
export declare const sessionResponseSchema: z.ZodObject<{
    id: z.ZodString;
    projectId: z.ZodString;
    contextStep: z.ZodEnum<["CONTEXT", "DATA", "LOGIC", "SECURITY"]>;
    chatLog: z.ZodArray<z.ZodObject<{
        role: z.ZodEnum<["user", "assistant"]>;
        content: z.ZodString;
        tab: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }, {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }>, "many">;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    projectId: string;
    chatLog: {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }[];
    contextStep: "CONTEXT" | "DATA" | "LOGIC" | "SECURITY";
    updatedAt: string;
}, {
    id: string;
    projectId: string;
    chatLog: {
        role: "user" | "assistant";
        content: string;
        tab?: string | undefined;
    }[];
    contextStep: "CONTEXT" | "DATA" | "LOGIC" | "SECURITY";
    updatedAt: string;
}>;
export type CreateSessionDto = z.infer<typeof createSessionSchema>;
export type AppendChatDto = z.infer<typeof appendChatSchema>;
export type SessionResponse = z.infer<typeof sessionResponseSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export declare function getMessageTab(m: ChatMessage): string;
export declare function filterChatByTab(log: ChatMessage[], tab: string): ChatMessage[];
export {};

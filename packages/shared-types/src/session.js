"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionResponseSchema = exports.appendChatSchema = exports.createSessionSchema = exports.contextStepEnum = void 0;
exports.getMessageTab = getMessageTab;
exports.filterChatByTab = filterChatByTab;
const zod_1 = require("zod");
const chatMessageSchema = zod_1.z.object({
    role: zod_1.z.enum(["user", "assistant"]),
    content: zod_1.z.string(),
    tab: zod_1.z.string().optional(),
});
exports.contextStepEnum = ["CONTEXT", "DATA", "LOGIC", "SECURITY"];
exports.createSessionSchema = zod_1.z.object({
    projectId: zod_1.z.string().uuid(),
    contextStep: zod_1.z.enum(exports.contextStepEnum).default("CONTEXT"),
    chatLog: zod_1.z.array(chatMessageSchema).default([]),
});
exports.appendChatSchema = zod_1.z.object({
    role: zod_1.z.enum(["user", "assistant"]),
    content: zod_1.z.string(),
    tab: zod_1.z.string().optional(),
});
exports.sessionResponseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    contextStep: zod_1.z.enum(exports.contextStepEnum),
    chatLog: zod_1.z.array(chatMessageSchema),
    updatedAt: zod_1.z.string().datetime(),
});
function getMessageTab(m) {
    return m.tab ?? "mdd";
}
function filterChatByTab(log, tab) {
    return log.filter((m) => getMessageTab(m) === tab);
}
//# sourceMappingURL=session.js.map
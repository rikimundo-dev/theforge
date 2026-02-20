"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectResponseSchema = exports.phase0DeepResearchBodySchema = exports.updateProjectSchema = exports.createProjectSchema = void 0;
const zod_1 = require("zod");
const status_js_1 = require("./status.js");
exports.createProjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(1),
    hasUxTeam: zod_1.z.boolean().default(false),
});
exports.updateProjectSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    hasUxTeam: zod_1.z.boolean().optional(),
    dbgaContent: zod_1.z.string().optional().nullable(),
    specContent: zod_1.z.string().optional().nullable(),
    architectureContent: zod_1.z.string().optional().nullable(),
    useCasesContent: zod_1.z.string().optional().nullable(),
    userStoriesContent: zod_1.z.string().optional().nullable(),
    mddContent: zod_1.z.string().optional().nullable(),
    blueprintContent: zod_1.z.string().optional().nullable(),
    tasksContent: zod_1.z.string().optional().nullable(),
    apiContractsContent: zod_1.z.string().optional().nullable(),
    logicFlowsContent: zod_1.z.string().optional().nullable(),
    infraContent: zod_1.z.string().optional().nullable(),
    uxUiGuideContent: zod_1.z.string().optional().nullable(),
    phase0SummaryContent: zod_1.z.string().optional().nullable(),
    figmaMapping: zod_1.z.record(zod_1.z.unknown()).optional().nullable(),
});
exports.phase0DeepResearchBodySchema = zod_1.z.object({
    userIdea: zod_1.z.string().optional(),
    urls: zod_1.z.array(zod_1.z.string()).optional(),
    includeBenchmark: zod_1.z.boolean().optional().default(false),
});
exports.projectResponseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    name: zod_1.z.string(),
    hasUxTeam: zod_1.z.boolean(),
    status: zod_1.z.enum(status_js_1.StatusEnum),
    precisionScore: zod_1.z.number(),
    dbgaContent: zod_1.z.string().nullable(),
    specContent: zod_1.z.string().nullable(),
    architectureContent: zod_1.z.string().nullable(),
    useCasesContent: zod_1.z.string().nullable(),
    userStoriesContent: zod_1.z.string().nullable(),
    mddContent: zod_1.z.string().nullable(),
    blueprintContent: zod_1.z.string().nullable(),
    tasksContent: zod_1.z.string().nullable(),
    apiContractsContent: zod_1.z.string().nullable(),
    logicFlowsContent: zod_1.z.string().nullable(),
    infraContent: zod_1.z.string().nullable(),
    uxUiGuideContent: zod_1.z.string().nullable(),
    phase0SummaryContent: zod_1.z.string().nullable(),
    figmaMapping: zod_1.z.record(zod_1.z.unknown()).nullable(),
    createdAt: zod_1.z.string().datetime(),
});
//# sourceMappingURL=project.js.map
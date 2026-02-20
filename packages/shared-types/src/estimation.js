"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimationResponseSchema = exports.teamStructureSchema = void 0;
const zod_1 = require("zod");
exports.teamStructureSchema = zod_1.z.object({
    architect: zod_1.z.number().int().min(0).optional(),
    back: zod_1.z.number().int().min(0).optional(),
    front: zod_1.z.number().int().min(0).optional(),
    ux: zod_1.z.number().int().min(0).optional(),
});
exports.estimationResponseSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    projectId: zod_1.z.string().uuid(),
    totalHours: zod_1.z.number(),
    totalMxn: zod_1.z.number(),
    teamStructure: exports.teamStructureSchema,
});
//# sourceMappingURL=estimation.js.map
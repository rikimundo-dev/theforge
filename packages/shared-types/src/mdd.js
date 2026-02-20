"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mddJsonSchema = void 0;
const zod_1 = require("zod");
exports.mddJsonSchema = zod_1.z.object({
    db_entities: zod_1.z.array(zod_1.z.unknown()).default([]),
    business_core: zod_1.z.unknown().nullable().optional(),
    edge_cases: zod_1.z.unknown().optional(),
    field_types: zod_1.z.unknown().optional(),
});
//# sourceMappingURL=mdd.js.map
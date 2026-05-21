import test from "node:test";
import assert from "node:assert/strict";
import { AuthService } from "./auth.service.js";

test("updateUserRole — admin puede asignar super_admin", async () => {
  const updates: { id: string; data: { role: string } }[] = [];
  const service = new AuthService(
    {} as never,
    {} as never,
    {
      user: {
        findUnique: async () => ({ id: "target-1", email: "u@test.com", role: "developer" }),
        update: async (args: { where: { id: string }; data: { role: string } }) => {
          updates.push({ id: args.where.id, data: args.data });
          return { id: args.where.id, email: "u@test.com", role: args.data.role };
        },
      },
    } as never,
    {} as never,
  );

  const result = await service.updateUserRole("target-1", "super_admin", "admin-actor");

  assert.equal(result.role, "super_admin");
  assert.deepEqual(updates, [{ id: "target-1", data: { role: "super_admin" } }]);
});

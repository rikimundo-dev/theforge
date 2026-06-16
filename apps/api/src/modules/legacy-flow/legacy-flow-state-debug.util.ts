/**
 * Parches parciales a `legacyFlowState.lastDeliverablesDebug` tras regeneración individual legacy.
 */

import type { PrismaService } from "../../prisma/prisma.service.js";
import type {
  LegacyDeliverablesDebugReport,
  LegacyFlowState,
} from "./legacy-coordinator.service.js";

export async function patchLegacyDeliverablesDebugReport(
  prisma: PrismaService,
  projectId: string,
  patch: Partial<LegacyDeliverablesDebugReport>,
): Promise<void> {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { legacyFlowState: true },
  });
  const state = (row?.legacyFlowState as LegacyFlowState | null | undefined) ?? {};
  const prev = state.lastDeliverablesDebug ?? ({} as LegacyDeliverablesDebugReport);
  const nextState: LegacyFlowState = {
    ...state,
    lastDeliverablesDebug: {
      ...prev,
      ...patch,
    },
  };
  await prisma.project.update({
    where: { id: projectId },
    data: { legacyFlowState: nextState as object },
  });
}

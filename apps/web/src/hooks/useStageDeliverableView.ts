import { useEffect, useState } from "react";
import type { ProjectDeliverableSource, StageDeliverablesResponse } from "@theforge/shared-types";
import { apiFetch, API_BASE } from "@/utils/apiClient";

export function useStageDeliverableView(projectId: string | null, stageId: string | null) {
  const [view, setView] = useState<StageDeliverablesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!projectId || !stageId) {
      setView(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const r = await apiFetch(
          `${API_BASE}/projects/${projectId}/stages/${stageId}/deliverables`,
        );
        if (!r.ok) throw new Error("deliverables fetch failed");
        const data = (await r.json()) as StageDeliverablesResponse;
        if (!cancelled) setView(data);
      } catch {
        if (!cancelled) setView(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, stageId]);

  return { view, loading };
}

export function resolveWorkshopDeliverableContent(
  field: keyof ProjectDeliverableSource,
  liveContent: string | null | undefined,
  view: StageDeliverablesResponse | null,
): string | null {
  if (view?.source === "snapshot" && view.readOnly) {
    const fromStage = view.deliverables[field];
    return typeof fromStage === "string" ? fromStage : fromStage ?? null;
  }
  return liveContent ?? null;
}

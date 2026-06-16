import { apiFetch, API_BASE } from "./apiClient";
import {
  contentFieldForGenerateUrl,
  extractProjectIdFromGenerateUrl,
  isFireAndForgetQueueResponse,
  isProjectGenerationComplete,
} from "./queueAndPollHelpers";

async function pollProjectUntilComplete<T extends object>(
  projectId: string,
  field: string,
  baseline: string | null,
  signal?: AbortSignal,
): Promise<T> {
  const pollUrl = `${API_BASE}/projects/${projectId}`;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (signal?.aborted) throw new Error("Cancelado por el usuario");
    await new Promise((r) => setTimeout(r, 2_000));
    const pr = await apiFetch(pollUrl);
    if (!pr.ok) {
      console.warn(`[agent-gov] pollProject attempt=${attempt + 1} fetch failed status=${pr.status}`);
      continue;
    }
    const project = (await pr.json()) as T;
    const value = (project as Record<string, unknown>)[field];
    const currentLen = typeof value === "string" ? value.length : 0;
    const complete = isProjectGenerationComplete(project as Record<string, unknown>, field, baseline);
    console.warn(
      `[agent-gov] pollProject attempt=${attempt + 1} field=${field} len=${currentLen} baselineLen=${baseline?.length ?? 0} complete=${complete}`,
    );
    if (complete) {
      console.warn(`[agent-gov] pollProject complete projectId=${projectId} attempts=${attempt + 1}`);
      return project;
    }
  }
  console.warn(`[agent-gov] pollProject timeout projectId=${projectId} field=${field}`);
  throw new Error("Tiempo de espera agotado (5 min)");
}

async function pollJobUntilComplete<T>(
  jobId: string,
  signal?: AbortSignal,
): Promise<T> {
  const pollUrl = `${API_BASE}/projects/jobs/${jobId}`;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (signal?.aborted) throw new Error("Cancelado por el usuario");
    await new Promise((r) => setTimeout(r, 2_000));
    const pr = await apiFetch(pollUrl);
    if (!pr.ok) {
      if (pr.status === 404) throw new Error("Job no encontrado");
      continue;
    }
    const status = (await pr.json()) as {
      status: string;
      result?: unknown;
      error?: string;
    };
    if (status.status === "completed") return status.result as T;
    if (status.status === "failed") throw new Error(status.error ?? "Error en la generación");
  }
  throw new Error("Tiempo de espera agotado (5 min)");
}

/**
 * POST a un generate-* endpoint con ?queue=true y hace polling hasta completar.
 * Si el backend no tiene cola (respuesta síncrona directa), retorna el dato directamente.
 * Sin Redis pero con ?queue=true, el API usa fire-and-forget (jobId bg-*) y hay que
 * sondear el proyecto hasta que el campo del entregable cambie.
 */
export async function queueAndPoll<T extends object>(
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  const projectId = extractProjectIdFromGenerateUrl(url);
  const contentField = contentFieldForGenerateUrl(url);
  const forceRegenerate = body.force === true;
  let baseline: string | null = null;

  if (projectId && contentField && !forceRegenerate) {
    const baselineRes = await apiFetch(`${API_BASE}/projects/${projectId}`);
    if (baselineRes.ok) {
      const baselineProject = (await baselineRes.json()) as Record<string, unknown>;
      const value = baselineProject[contentField];
      baseline = typeof value === "string" ? value : null;
      console.warn(
        `[agent-gov] queueAndPoll baseline captured field=${contentField} len=${baseline?.length ?? 0}`,
      );
    }
  } else if (forceRegenerate && contentField) {
    console.warn(`[agent-gov] queueAndPoll baseline skipped force=true field=${contentField}`);
  }

  const r = await apiFetch(`${url}?queue=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Error");
  }
  const data = (await r.json()) as Record<string, unknown>;

  console.warn(
    `[agent-gov] queueAndPoll response queued=${Boolean(data.queued)} jobId=${String(data.jobId ?? "n/a")} statusPath=${String(data.statusPath ?? "n/a")}`,
  );

  if (!data.queued) {
    console.warn("[agent-gov] queueAndPoll branch sync (no queue)");
    return data as unknown as T;
  }

  if (isFireAndForgetQueueResponse(data)) {
    console.warn("[agent-gov] queueAndPoll branch fire-and-forget bg-*");
    if (!projectId || !contentField) {
      throw new Error("Cola no disponible: no se puede sondear el proyecto");
    }
    return pollProjectUntilComplete<T>(projectId, contentField, baseline, signal);
  }

  const jobId = data.jobId as string;
  console.warn(`[agent-gov] queueAndPoll branch bullmq jobId=${jobId}`);
  return pollJobUntilComplete<T>(jobId, signal);
}

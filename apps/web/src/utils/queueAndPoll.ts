import { apiFetch, API_BASE } from "./apiClient";
import {
  contentFieldForGenerateUrl,
  extractProjectIdFromGenerateUrl,
  isFireAndForgetQueueResponse,
  isProjectGenerationComplete,
} from "./queueAndPollHelpers";

async function pollProjectUntilComplete<T extends Record<string, unknown>>(
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
    if (!pr.ok) continue;
    const project = (await pr.json()) as T;
    if (isProjectGenerationComplete(project, field, baseline)) return project;
  }
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
export async function queueAndPoll<T extends Record<string, unknown>>(
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
    }
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

  if (!data.queued) return data as unknown as T;

  if (isFireAndForgetQueueResponse(data)) {
    if (!projectId || !contentField) {
      throw new Error("Cola no disponible: no se puede sondear el proyecto");
    }
    return pollProjectUntilComplete<T>(projectId, contentField, baseline, signal);
  }

  const jobId = data.jobId as string;
  return pollJobUntilComplete<T>(jobId, signal);
}

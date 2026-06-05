import {
  RateLimitError,
  InternalServerError,
  APIConnectionError,
} from "openai/error";
import { isChatFallbackOn429Enabled } from "./llm-config.js";
import { llmDebug, llmWarn } from "./llm-debug.util.js";

/** Máximo de reintentos transitorios por modelo (429, 5xx, red). */
export const DEFAULT_RETRIES_PER_MODEL = 3;
/** Backoff base en ms — 2s, 4s, 8s. */
const BASE_DELAY_MS = 2_000;

function errorStatus(err: unknown): number | undefined {
  if (err == null || typeof err !== "object") return undefined;
  const o = err as { status?: number; statusCode?: number };
  if (typeof o.status === "number") return o.status;
  if (typeof o.statusCode === "number") return o.statusCode;
  return undefined;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    const nested =
      err != null &&
      typeof err === "object" &&
      "error" in err &&
      (err as { error?: { message?: string } }).error?.message;
    if (typeof nested === "string" && nested.trim()) {
      return `${err.message} ${nested}`.toLowerCase();
    }
    return err.message.toLowerCase();
  }
  return String(err).toLowerCase();
}

function rawErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const nested =
      err != null &&
      typeof err === "object" &&
      "error" in err &&
      (err as { error?: { message?: string } }).error?.message;
    if (typeof nested === "string" && nested.trim()) {
      return `${err.message} — ${nested}`;
    }
    return err.message;
  }
  return String(err);
}

export const MODELS_UNAVAILABLE_CODE = "MODELS_UNAVAILABLE" as const;

export const MODELS_UNAVAILABLE_MESSAGE =
  "No hay un modelo disponible configurado. Revisa el modelo principal y los respaldos en Ajustes → Gestionar instancias.";

export interface ModelsUnavailableDetails {
  modelsChain: string[];
  failedModel: string;
  cause: string;
  statusCode?: number;
  label?: string;
}

export function formatModelsUnavailableMessage(details: ModelsUnavailableDetails): string {
  const chain =
    details.modelsChain.length > 0 ? details.modelsChain.join(" → ") : details.failedModel;
  const status = details.statusCode != null ? ` (HTTP ${details.statusCode})` : "";
  return (
    `No hay modelo LLM disponible. Falló «${details.failedModel}»${status}: ${details.cause}. ` +
    `Cadena probada: [${chain}]. Revisa el modelo principal y los respaldos en Ajustes → Gestionar instancias.`
  );
}

/** Todos los modelos de la cadena fallaron (inválidos, agotados o no encontrados). */
export class ModelsUnavailableError extends Error {
  readonly code = MODELS_UNAVAILABLE_CODE;
  readonly details?: ModelsUnavailableDetails;

  constructor(details?: ModelsUnavailableDetails, message?: string) {
    super(message ?? (details ? formatModelsUnavailableMessage(details) : MODELS_UNAVAILABLE_MESSAGE));
    this.name = "ModelsUnavailableError";
    this.details = details;
  }
}

function buildModelsUnavailableError(
  models: string[],
  failedModel: string,
  err: unknown,
  label: string,
): ModelsUnavailableError {
  const details: ModelsUnavailableDetails = {
    modelsChain: models,
    failedModel,
    cause: rawErrorMessage(err),
    statusCode: errorStatus(err),
    label,
  };
  llmWarn("ModelFallback", "cadena agotada", details);
  return new ModelsUnavailableError(details);
}

/**
 * Errores que justifican pasar al siguiente modelo en la cadena (tras reintentos del modelo actual).
 * No incluye 5xx genéricos ni fallos de red.
 */
export function isModelExhaustionError(
  err: unknown,
  options?: { allow429?: boolean },
): boolean {
  const allow429 = options?.allow429 ?? isChatFallbackOn429Enabled();
  const status = errorStatus(err);
  const msg = errorMessage(err);

  if (status === 402) return true;
  if (allow429 && (status === 429 || err instanceof RateLimitError)) return true;

  if (
    msg.includes("insufficient_quota") ||
    msg.includes("insufficient quota") ||
    msg.includes("credit") ||
    msg.includes("billing") ||
    msg.includes("quota") ||
    msg.includes("exceeded your current quota") ||
    msg.includes("payment required") ||
    msg.includes("free-models-per-day") ||
    msg.includes("free model requests")
  ) {
    return true;
  }

  if (
    msg.includes("model_not_found") ||
    msg.includes("model not found") ||
    msg.includes("does not exist") ||
    msg.includes("not available") ||
    msg.includes("model unavailable") ||
    msg.includes("no longer available") ||
    msg.includes("not a valid model") ||
    msg.includes("invalid model id") ||
    msg.includes("invalid model") ||
    msg.includes("unknown model") ||
    msg.includes("no endpoints found") ||
    msg.includes("no endpoint found")
  ) {
    return true;
  }

  if (status === 400 && (msg.includes("model") || msg.includes("invalid"))) {
    return true;
  }
  if (status === 404 && (msg.includes("model") || msg.includes("endpoint"))) {
    return true;
  }

  if (allow429) {
    if (
      msg.includes("429") ||
      msg.includes("rate limit") ||
      msg.includes("rate_limit") ||
      msg.includes("resource exhausted") ||
      msg.includes("resource_exhausted") ||
      msg.includes("too many requests")
    ) {
      return true;
    }
  }

  return false;
}

function isTransientRetryableError(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  if (err instanceof InternalServerError) return true;
  if (err instanceof APIConnectionError) return true;
  const msg = errorMessage(err);
  if (
    msg.includes("ehostunreach") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("429") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503")
  ) {
    return true;
  }
  return false;
}

function retryAfterSeconds(err: unknown): number | undefined {
  if (err instanceof RateLimitError && typeof (err as { headers?: { get?: (k: string) => string | null } }).headers?.get === "function") {
    const raw = (err as unknown as { headers: { get: (k: string) => string | null } }).headers.get(
      "retry-after",
    );
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n) && n > 0) return Math.min(n, 30);
    }
  }
  return undefined;
}

function backoffDelay(attempt: number, retryAfter?: number): number {
  if (retryAfter != null) return retryAfter * 1000;
  const base = BASE_DELAY_MS * Math.pow(2, attempt);
  const jitter = 0.5 + Math.random();
  return Math.round(base * jitter);
}

async function withTransientRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxRetries: number,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      // Agotamiento (quota, créditos, 429 diario, modelo inválido): no backoff — siguiente modelo.
      if (
        isModelExhaustionError(err) ||
        !isTransientRetryableError(err) ||
        attempt === maxRetries
      ) {
        throw err;
      }
      const after = retryAfterSeconds(err);
      const delayMs = backoffDelay(attempt, after);
      llmWarn(label, `reintento transitorio ${attempt + 1}/${maxRetries}`, {
        delayMs,
        error: rawErrorMessage(err),
        statusCode: errorStatus(err),
      });
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export interface RunWithModelFallbackOptions<T> {
  models: string[];
  run: (model: string) => Promise<T>;
  retriesPerModel?: number;
  label?: string;
}

/**
 * Un solo modelo: reintentos transitorios (comportamiento histórico del adapter).
 * Varios modelos: reintentos por modelo; agotamiento → siguiente modelo.
 */
export async function runWithModelFallback<T>({
  models,
  run,
  retriesPerModel = DEFAULT_RETRIES_PER_MODEL,
  label = "OpenRouterAdapter",
}: RunWithModelFallbackOptions<T>): Promise<T> {
  llmDebug("ModelFallback", "inicio cadena", { label, models, retriesPerModel });

  if (models.length === 0) {
    throw new Error(`${label}: models chain is empty`);
  }
  if (models.length === 1) {
    const model = models[0]!;
    llmDebug("ModelFallback", "probando único modelo", { label, model });
    try {
      return await withTransientRetry(() => run(model), label, retriesPerModel);
    } catch (err) {
      llmWarn("ModelFallback", "único modelo falló", {
        label,
        model,
        statusCode: errorStatus(err),
        error: rawErrorMessage(err),
        exhaustion: isModelExhaustionError(err),
      });
      if (isModelExhaustionError(err)) {
        throw buildModelsUnavailableError(models, model, err, label);
      }
      throw err;
    }
  }

  let lastErr: unknown;
  for (let i = 0; i < models.length; i++) {
    const model = models[i]!;
    const modelLabel = `${label}[${model}]`;
    llmDebug("ModelFallback", "probando modelo", {
      label,
      model,
      index: i + 1,
      total: models.length,
    });
    try {
      return await withTransientRetry(() => run(model), modelLabel, retriesPerModel);
    } catch (err) {
      lastErr = err;
      const hasNext = i < models.length - 1;
      llmWarn("ModelFallback", hasNext ? "modelo falló, siguiente en cadena" : "último modelo falló", {
        label,
        model,
        statusCode: errorStatus(err),
        error: rawErrorMessage(err),
        exhaustion: isModelExhaustionError(err),
        nextModel: hasNext ? models[i + 1] : undefined,
      });
      if (!hasNext) {
        if (isModelExhaustionError(err)) {
          throw buildModelsUnavailableError(models, model, err, label);
        }
        throw err;
      }
      if (!isModelExhaustionError(err)) {
        throw err;
      }
    }
  }
  throw lastErr;
}

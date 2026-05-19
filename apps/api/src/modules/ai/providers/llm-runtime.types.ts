import type { ProviderId } from "./provider-catalog.js";

/** Runtime resuelto desde BYOK del usuario (sin leer claves de env). */
export interface UserLLMRuntime {
  providerId: ProviderId;
  apiKey: string;
  baseURL: string;
  chatModel: string;
  chatModelFallbacks: string[];
  embeddingModel: string | null;
  /** Dimensión de vectores para Falkor (derivada o override de usuario). */
  embeddingDimension: number | null;
  embeddingsEnabled: boolean;
  sttModel: string | null;
  visionModel: string;
  extras?: Record<string, unknown>;
}

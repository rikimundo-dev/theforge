/** Debe coincidir con `MODELS_UNAVAILABLE_CODE` del API. */
export const MODELS_UNAVAILABLE_CODE = "MODELS_UNAVAILABLE";

export const MODELS_UNAVAILABLE_MESSAGE =
  "No hay un modelo disponible configurado. Revisa el modelo principal y los respaldos en Ajustes → Gestionar instancias.";

export function isModelsUnavailableStreamError(event: {
  message?: string;
  code?: string;
}): boolean {
  if (event.code === MODELS_UNAVAILABLE_CODE) return true;
  const msg = (event.message ?? "").trim();
  return (
    msg.includes("No hay un modelo disponible configurado") ||
    /not a valid model id/i.test(msg)
  );
}

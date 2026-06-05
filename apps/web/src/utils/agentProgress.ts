export type AgentProgressStatus = "active" | "done" | "generando" | "terminado";

export type AgentProgressItem = {
  agent: string;
  message: string;
  step?: string;
  status?: AgentProgressStatus;
};

/** Paso ya ejecutado: marca el activo anterior como hecho y añade uno nuevo completado. */
export function appendAgentProgressDone(
  prev: readonly AgentProgressItem[],
  item: { agent: string; message: string },
): AgentProgressItem[] {
  const normalized = prev.map((p) =>
    isAgentProgressActive(p) ? { ...p, status: "done" as const } : { ...p, status: p.status ?? "done" },
  );
  return [...normalized, { ...item, status: "done" }];
}

export function isAgentProgressActive(item: AgentProgressItem): boolean {
  return item.status === "active" || item.status === "generando";
}

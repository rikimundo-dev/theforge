import { AsyncLocalStorage } from "node:async_hooks";
import { ForbiddenException } from "@nestjs/common";

/** Alcance por petición HTTP autenticada (usuario JWT). */
export interface RequestUserStore {
  userId: string;
}

export const requestUserStore = new AsyncLocalStorage<RequestUserStore>();

/** userId del JWT en la petición actual (tras interceptor + Passport). */
export function getRequestUserId(): string {
  const s = requestUserStore.getStore();
  if (!s?.userId) {
    throw new ForbiddenException("Contexto de usuario no disponible");
  }
  return s.userId;
}

/** Scripts / tareas sin HTTP: ejecutar código con un userId sintético. */
export function runWithRequestUser<T>(userId: string, fn: () => T): T {
  return requestUserStore.run({ userId }, fn);
}

export async function runWithRequestUserAsync<T>(userId: string, fn: () => Promise<T>): Promise<T> {
  return requestUserStore.run({ userId }, fn);
}

const TOKEN_KEY = "theforge_access_token";

export const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

/** Fetch al API con Authorization si hay sesión; ante 401 limpia token y emite evento. */
export async function apiFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const r = await fetch(input, { ...init, headers });
  if (r.status === 401 && token) {
    clearAccessToken();
    window.dispatchEvent(new Event("theforge:auth-expired"));
  }
  return r;
}

const TOKEN_KEY = "theforge_access_token";
const USER_KEY = "theforge_user";

export interface TheForgeUser {
  id: string;
  email: string;
  role: "admin" | "developer";
  /** Display name from profile / JWT; may be empty until backend provides it */
  name?: string | null;
}

export const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

/** Decodifica JWT sin verificar firma. */
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    return JSON.parse(atob((token.split(".")[1] ?? ""))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAccessToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  // Extraer user info del JWT
  const payload = decodeJwt(token);
  if (payload) {
    const rawName = payload.name;
    const name =
      typeof rawName === "string" && rawName.trim() !== ""
        ? rawName.trim()
        : null;
    const user: TheForgeUser = {
      id: (payload.sub as string) || "",
      email: (payload.email as string) || "",
      role: (payload.role as "admin" | "developer") || "developer",
      name,
    };
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function getStoredUser(): TheForgeUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as TheForgeUser;
  } catch {
    return null;
  }
}

export function clearAccessToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
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

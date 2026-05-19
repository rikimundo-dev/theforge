/**
 * Claves maestras para cifrado de tokens BYOK (env).
 * TOKEN_MASTER_KEYS: JSON { "1": "<base64 32 bytes>", "2": "..." }
 * TOKEN_ACTIVE_KEY_VERSION: versión usada al cifrar nuevos tokens.
 */

export function parseTokenMasterKeys(): Map<number, Buffer> {
  const raw = process.env.TOKEN_MASTER_KEYS?.trim();
  if (!raw) {
    throw new Error("TOKEN_MASTER_KEYS no está configurado");
  }
  let parsed: Record<string, string>;
  try {
    parsed = JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error("TOKEN_MASTER_KEYS debe ser JSON válido");
  }
  const map = new Map<number, Buffer>();
  for (const [k, v] of Object.entries(parsed)) {
    const version = parseInt(k, 10);
    if (!Number.isFinite(version) || version < 1) continue;
    const buf = Buffer.from(v, "base64");
    if (buf.length !== 32) {
      throw new Error(`TOKEN_MASTER_KEYS[${k}] debe decodificar a 32 bytes`);
    }
    map.set(version, buf);
  }
  if (map.size === 0) {
    throw new Error("TOKEN_MASTER_KEYS no contiene versiones válidas");
  }
  return map;
}

export function getActiveKeyVersion(): number {
  const raw = process.env.TOKEN_ACTIVE_KEY_VERSION?.trim();
  const v = raw ? parseInt(raw, 10) : 1;
  if (!Number.isFinite(v) || v < 1) {
    throw new Error("TOKEN_ACTIVE_KEY_VERSION debe ser un entero >= 1");
  }
  return v;
}

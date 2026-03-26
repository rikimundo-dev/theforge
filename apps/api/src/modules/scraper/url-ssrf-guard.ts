import { isIP } from "node:net";
import { resolve4, resolve6 } from "node:dns/promises";
import ipRangeCheck from "ip-range-check";

/**
 * Rangos que no deben ser alcanzables por fetch del scraper (SSRF).
 * Incluye loopback, RFC1918, link-local, CGNAT y metadata cloud típica.
 */
const BLOCKED_CIDRS = [
  "127.0.0.0/8",
  "10.0.0.0/8",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "169.254.0.0/16",
  "0.0.0.0/8",
  "100.64.0.0/10",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
];

function hostnameLooksBlocked(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "0.0.0.0") return true;
  return false;
}

function assertIpNotPrivate(ip: string): void {
  if (ipRangeCheck(ip, BLOCKED_CIDRS)) {
    throw new Error(`SSRF: dirección no permitida (${ip})`);
  }
}

/**
 * Resolución DNS + comprobación de IP; aborta si el host apunta a red privada/loopback.
 */
export async function assertPublicHttpUrl(urlString: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    throw new Error("URL inválida");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Solo se permiten URL http(s)");
  }
  const host = url.hostname;
  if (hostnameLooksBlocked(host)) {
    throw new Error("SSRF: hostname no permitido");
  }

  const kind = isIP(host);
  if (kind === 4 || kind === 6) {
    assertIpNotPrivate(host);
    return url;
  }

  const ips: string[] = [];
  try {
    ips.push(...(await resolve4(host)));
  } catch {
    /* sin A */
  }
  try {
    ips.push(...(await resolve6(host)));
  } catch {
    /* sin AAAA */
  }
  if (ips.length === 0) {
    throw new Error("No se pudo resolver el host");
  }
  for (const ip of ips) {
    assertIpNotPrivate(ip);
  }
  return url;
}

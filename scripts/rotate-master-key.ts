#!/usr/bin/env npx tsx
/**
 * Rota TOKEN_ACTIVE_KEY_VERSION re-cifrando user_provider_configs.tokenCiphertext.
 * Uso: TOKEN_MASTER_KEYS='{"1":"...","2":"..."}' TOKEN_ACTIVE_KEY_VERSION=2 npx tsx scripts/rotate-master-key.ts
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PrismaClient } from "@theforge/database";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function parseKeys(): Map<number, Buffer> {
  const raw = process.env.TOKEN_MASTER_KEYS?.trim();
  if (!raw) throw new Error("TOKEN_MASTER_KEYS requerido");
  const parsed = JSON.parse(raw) as Record<string, string>;
  const map = new Map<number, Buffer>();
  for (const [k, v] of Object.entries(parsed)) {
    const version = parseInt(k, 10);
    const buf = Buffer.from(v, "base64");
    if (buf.length !== 32) throw new Error(`Clave ${k} inválida`);
    map.set(version, buf);
  }
  return map;
}

function decryptBlob(ciphertext: string, keys: Map<number, Buffer>): string {
  const parts = ciphertext.split(":");
  if (parts.length !== 4 || !parts[0]?.startsWith("v")) throw new Error("blob inválido");
  const version = parseInt(parts[0].slice(1), 10);
  const key = keys.get(version);
  if (!key) throw new Error(`sin clave v${version}`);
  const iv = Buffer.from(parts[1]!, "base64");
  const tag = Buffer.from(parts[2]!, "base64");
  const data = Buffer.from(parts[3]!, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

function encryptBlob(plaintext: string, version: number, keys: Map<number, Buffer>): string {
  const key = keys.get(version);
  if (!key) throw new Error(`sin clave activa v${version}`);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [`v${version}`, iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

async function main(): Promise<void> {
  const keys = parseKeys();
  const targetVersion = parseInt(process.env.TOKEN_ACTIVE_KEY_VERSION?.trim() || "1", 10);
  if (!keys.has(targetVersion)) {
    throw new Error(`TOKEN_ACTIVE_KEY_VERSION=${targetVersion} no está en TOKEN_MASTER_KEYS`);
  }

  const prisma = new PrismaClient();
  const rows = await prisma.userProviderConfig.findMany({
    select: { id: true, tokenCiphertext: true, tokenKeyVersion: true },
  });

  let rotated = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.tokenKeyVersion === targetVersion) {
      skipped++;
      continue;
    }
    const plain = decryptBlob(row.tokenCiphertext, keys);
    const next = encryptBlob(plain, targetVersion, keys);
    await prisma.userProviderConfig.update({
      where: { id: row.id },
      data: { tokenCiphertext: next, tokenKeyVersion: targetVersion },
    });
    rotated++;
  }

  console.log(`rotate-master-key: rotated=${rotated} skipped=${skipped} target=v${targetVersion}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { getActiveKeyVersion, parseTokenMasterKeys } from "./crypto.config.js";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

@Injectable()
export class TokenCryptoService {
  private readonly keys = parseTokenMasterKeys();
  private readonly activeVersion = getActiveKeyVersion();

  encrypt(plaintext: string): { ciphertext: string; keyVersion: number } {
    const key = this.keys.get(this.activeVersion);
    if (!key) {
      throw new Error(`TOKEN_MASTER_KEYS no incluye versión activa ${this.activeVersion}`);
    }
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = [
      `v${this.activeVersion}`,
      iv.toString("base64"),
      tag.toString("base64"),
      enc.toString("base64"),
    ].join(":");
    return { ciphertext: payload, keyVersion: this.activeVersion };
  }

  decrypt(ciphertext: string, keyVersion: number): string {
    const key = this.keys.get(keyVersion);
    if (!key) {
      throw new Error(`TOKEN_MASTER_KEYS no incluye versión ${keyVersion}`);
    }
    const parts = ciphertext.split(":");
    if (parts.length !== 4 || !parts[0]?.startsWith("v")) {
      throw new Error("Formato de token cifrado inválido");
    }
    const iv = Buffer.from(parts[1]!, "base64");
    const tag = Buffer.from(parts[2]!, "base64");
    const data = Buffer.from(parts[3]!, "base64");
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  getActiveVersion(): number {
    return this.activeVersion;
  }

  listKeyVersions(): number[] {
    return [...this.keys.keys()].sort((a, b) => a - b);
  }
}

/**
 * ScryptPasswordHasher —— 基于 Node 内置 crypto.scrypt 的实现（无外部依赖）。
 * 格式：scrypt$N$r$p$salt$hash（hex）
 */

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { PasswordHasher } from "../application/password-hasher";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

export class ScryptPasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const derived = await scrypt(plain, salt, KEYLEN, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
  }

  async verify(plain: string, hashed: string): Promise<boolean> {
    const [scheme, nStr, rStr, pStr, saltHex, hashHex] = hashed.split("$");
    if (scheme !== "scrypt" || !nStr || !rStr || !pStr || !saltHex || !hashHex) return false;
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    if (![N, r, p].every(Number.isInteger)) return false;
    try {
      const salt = Buffer.from(saltHex, "hex");
      const expected = Buffer.from(hashHex, "hex");
      const derived = await scrypt(plain, salt, expected.length, { N, r, p });
      return timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }
}

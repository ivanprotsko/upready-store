import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { MedusaError } from "@medusajs/framework/utils";

/**
 * Encryption at rest for `tenant_integration_secret.payload`
 * (t03-tenant-secrets-robokassa).
 *
 * The scheme mirrors `@gorgo/medusa-integration`'s `services/crypto.js`, read
 * from the installed package on 2026-09-15: AES-256-GCM, a 32-byte key derived
 * from the passphrase with SHA-256, a random 12-byte IV per call, and one base64
 * blob `iv ‖ authTag ‖ ciphertext`. The same passphrase, `INTEGRATION_ENCRYPTION_KEY`,
 * keys both, so a deployment configures one platform secret and not two.
 *
 * A missing key is a boot-time configuration error at the first write, never a
 * silent fallback to plaintext: `keyFromEnv` throws, and the row is not written.
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export const ENCRYPTION_KEY_ENV = "INTEGRATION_ENCRYPTION_KEY";

export const deriveKey = (passphrase: string): Buffer =>
  createHash("sha256").update(passphrase, "utf8").digest();

export const keyFromEnv = (env: NodeJS.ProcessEnv = process.env): Buffer => {
  const passphrase = env[ENCRYPTION_KEY_ENV];
  if (!passphrase) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `${ENCRYPTION_KEY_ENV} is not set. Tenant integration secrets cannot be encrypted or decrypted without it.`,
    );
  }
  return deriveKey(passphrase);
};

export const encryptJson = (value: unknown, key: Buffer): string => {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
};

/** Inverse of {@link encryptJson}. Throws on a wrong key or a tampered blob. */
export const decryptJson = <T = unknown>(blob: string, key: Buffer): T => {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return JSON.parse(decrypted.toString("utf8")) as T;
};

/**
 * What a route may say about a secret: whether it is set, and its last four
 * characters. Never the value. A value shorter than four characters is masked
 * whole, so a two-character password does not leak in full as its own "tail".
 */
export type MaskedSecret = { set: boolean; last4: string | null };

export const maskSecret = (value: string | null | undefined): MaskedSecret => {
  if (!value) {
    return { set: false, last4: null };
  }
  return { set: true, last4: value.length >= 4 ? value.slice(-4) : "•".repeat(value.length) };
};

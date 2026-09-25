import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const configured = process.env.APP_CREDENTIAL_ENCRYPTION_KEY;

  if (!configured) {
    throw new Error("APP_CREDENTIAL_ENCRYPTION_KEY is required");
  }

  const key = /^[a-f\d]{64}$/i.test(configured)
    ? Buffer.from(configured, "hex")
    : Buffer.from(configured, "base64");

  if (key.length !== 32) {
    throw new Error("APP_CREDENTIAL_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return key;
}

export function encryptCredential(plainText: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decryptCredential(payload: string): string {
  const [version, ivValue, authTagValue, encryptedValue] = payload.split(":");

  if (version !== "v1" || !ivValue || !authTagValue || !encryptedValue) {
    throw new Error("Encrypted credential has an invalid format");
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivValue, "base64"));
  decipher.setAuthTag(Buffer.from(authTagValue, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}


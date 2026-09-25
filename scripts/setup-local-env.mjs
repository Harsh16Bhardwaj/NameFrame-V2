import { randomBytes } from "node:crypto";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const sourcePath = resolve("..", "nameframe", ".env");
const targetPath = resolve(".env");

const previousTarget = await readFile(targetPath, "utf8").catch((error) => {
  if (error.code === "ENOENT") {
    return "";
  }

  throw error;
});
const preservedEncryptionKey = previousTarget.match(
  /^APP_CREDENTIAL_ENCRYPTION_KEY=(.+)$/m,
)?.[1];

await copyFile(sourcePath, targetPath);

const existing = await readFile(targetPath, "utf8");
const lines = [existing.trimEnd()];

if (!/^APP_CREDENTIAL_ENCRYPTION_KEY=/m.test(existing)) {
  lines.push(
    `APP_CREDENTIAL_ENCRYPTION_KEY=${preservedEncryptionKey ?? randomBytes(32).toString("base64")}`,
  );
}

if (!/^NEXT_PUBLIC_CLERK_SIGN_IN_URL=/m.test(existing)) {
  lines.push("NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in");
}

if (!/^NEXT_PUBLIC_CLERK_SIGN_UP_URL=/m.test(existing)) {
  lines.push("NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up");
}

await writeFile(targetPath, `${lines.join("\n")}\n`, { encoding: "utf8", mode: 0o600 });
console.log("Local environment copied from NameFrame; missing Sertify-only values were generated.");

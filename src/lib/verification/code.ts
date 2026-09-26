export function normalizeVerificationCode(input: string): string {
  let value = input.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    // Keep the original value. UUID validation will reject malformed input.
  }
  if (value.includes("/verify/")) {
    try {
      value = new URL(value).pathname.split("/").filter(Boolean).pop() ?? value;
    } catch {
      value = value.split("/verify/").pop() ?? value;
    }
  }
  value = value.replace(/^verification\s+code\s*:\s*/i, "").split(/[?#\s]/, 1)[0] ?? "";
  return value.trim().toLowerCase();
}

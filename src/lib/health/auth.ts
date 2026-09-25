import { timingSafeEqual } from "node:crypto";

export function isAuthorizedHealthRequest(
  request: Request,
  secret = process.env.HEALTH_CHECK_SECRET,
): boolean {
  if (!secret) return false;

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;

  const supplied = authorization.slice(7);
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);

  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

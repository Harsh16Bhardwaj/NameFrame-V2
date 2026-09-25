import { timingSafeEqual } from "node:crypto";

export function isAuthorizedWorkerRequest(request: Request, secret = process.env.CRON_SECRET): boolean {
  if (!secret) return false;
  const authorization = request.headers.get("authorization");
  const supplied = authorization?.startsWith("Bearer ") ? authorization.slice(7) : request.headers.get("x-cron-secret");
  if (!supplied) return false;
  const expectedBytes = Buffer.from(secret);
  const suppliedBytes = Buffer.from(supplied);
  return expectedBytes.length === suppliedBytes.length && timingSafeEqual(expectedBytes, suppliedBytes);
}

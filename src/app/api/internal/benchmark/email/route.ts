import { randomUUID } from "node:crypto";

import { isAuthorizedWorkerRequest } from "@/lib/jobs/worker-auth";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found." }, { status: 404 });
  if (!isAuthorizedWorkerRequest(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const startedAt = performance.now();
  const body = await request.json() as { to?: unknown; fail?: unknown };
  if (typeof body.to !== "string" || !body.to.includes("@")) {
    return Response.json({ error: "A recipient is required." }, { status: 400 });
  }

  await new Promise((resolve) => setTimeout(resolve, 120));
  if (body.fail === true) {
    return Response.json({ error: "Synthetic email provider timeout.", code: "EMAIL_PROVIDER_UNAVAILABLE", durationMs: Math.round(performance.now() - startedAt) }, { status: 503 });
  }

  return Response.json({ messageId: `benchmark-${randomUUID()}`, durationMs: Math.round(performance.now() - startedAt) });
}

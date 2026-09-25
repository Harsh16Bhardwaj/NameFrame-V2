import { randomUUID } from "node:crypto";

import { isAuthorizedWorkerRequest } from "@/lib/jobs/worker-auth";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return Response.json({ error: "Not found." }, { status: 404 });
  if (!isAuthorizedWorkerRequest(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });

  const startedAt = performance.now();
  const body = await request.json() as { width?: unknown; height?: unknown; fail?: unknown };
  const width = positiveInteger(body.width);
  const height = positiveInteger(body.height);
  if (!width || !height) return Response.json({ error: "Valid source dimensions are required." }, { status: 400 });

  await new Promise((resolve) => setTimeout(resolve, 2_000));
  if (body.fail === true) {
    return Response.json({ error: "Synthetic Cloudinary timeout.", code: "CLOUDINARY_UNAVAILABLE", durationMs: Math.round(performance.now() - startedAt) }, { status: 503 });
  }

  const id = randomUUID();
  return Response.json({
    artifactUrl: `https://benchmark.invalid/certificates/${id}.png`,
    publicId: `benchmark/${id}`,
    width,
    height,
    durationMs: Math.round(performance.now() - startedAt),
  });
}

function positiveInteger(value: unknown) {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

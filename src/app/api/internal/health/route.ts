import { isAuthorizedHealthRequest } from "@/lib/health/auth";
import { buildHealthReport } from "@/lib/health/service";

export async function GET(request: Request) {
  if (!isAuthorizedHealthRequest(request)) {
    return Response.json(
      { success: false, error: { code: "AUTHENTICATION_ERROR", message: "Invalid health-check credentials." } },
      { status: 401 },
    );
  }

  const report = await buildHealthReport();
  return Response.json(report, { status: report.status === "healthy" ? 200 : 503 });
}

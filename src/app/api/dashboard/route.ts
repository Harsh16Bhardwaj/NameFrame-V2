import { getOrganizationDashboard } from "@/lib/dashboard/service";
import { errorResponse } from "@/lib/errors/http";

export async function GET() {
  try {
    return Response.json({ success: true, data: await getOrganizationDashboard() });
  } catch (error) {
    return errorResponse(error);
  }
}

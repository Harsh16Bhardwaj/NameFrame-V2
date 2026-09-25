import { errorResponse } from "@/lib/errors/http";
import { exportOrganizationParticipants } from "@/lib/participants/service";

export async function GET(request: Request) {
  try {
    const source = new URL(request.url).searchParams;
    const params = new URLSearchParams({ page: "1", limit: "100", search: source.get("search") ?? "", eligibility: source.get("eligibility") ?? "all" });
    const rows = await exportOrganizationParticipants(params);
    const csv = [
      ["Name", "Email", "Event", "Event status", "Eligible", "Added"],
      ...rows.map((row) => [row.name, row.email, row.event.title, row.event.status, row.eligibleForCertificate ? "Yes" : "No", row.createdAt.toISOString()]),
    ].map((row) => row.map(csvCell).join(",")).join("\r\n");
    return new Response(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="nameframe-participants-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

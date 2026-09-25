import type { DashboardListInput } from "@/lib/dashboard/service";

export function dashboardListInput(request: Request): DashboardListInput {
  const searchParams = new URL(request.url).searchParams;
  return {
    page: searchParams.get("page") ?? undefined,
    pageSize: searchParams.get("pageSize") ?? undefined,
    search: searchParams.get("search") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    queue: searchParams.get("queue") ?? undefined,
    provider: searchParams.get("provider") ?? undefined,
  };
}

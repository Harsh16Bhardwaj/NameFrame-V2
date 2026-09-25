import { readableStatus } from "@/lib/dashboard/presentation";

export function StatusBadge({ status }: { status: string }) {
  const tone = ["DEAD", "FAILED", "UNAVAILABLE"].some((value) => status.includes(value)) ? "danger"
    : ["PENDING", "PROCESSING", "RETRY", "RATE"].some((value) => status.includes(value)) ? "warning"
      : ["SENT", "COMPLETED", "HEALTHY", "ACTIVE"].some((value) => status.includes(value)) ? "success" : "neutral";
  return <span className={`status-badge status-${tone}`}>{readableStatus(status)}</span>;
}

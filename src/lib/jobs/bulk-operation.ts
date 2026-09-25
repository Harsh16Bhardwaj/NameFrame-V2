import { BulkOperationStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";

type BulkProgress = {
  totalCount: number;
  completedCount: number;
  failedCount: number;
};

type BulkJobCounts = {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  dead: number;
};

export function deriveBulkStatusFromJobs(counts: BulkJobCounts): BulkOperationStatus {
  if (Object.values(counts).some((count) => count < 0) || counts.pending + counts.processing + counts.completed + counts.dead !== counts.total) {
    throw new AppError("INTERNAL_ERROR", "Bulk operation job counts are inconsistent.");
  }
  if (counts.total === 0) return BulkOperationStatus.PENDING;
  if (counts.completed === counts.total) return BulkOperationStatus.COMPLETED;
  if (counts.dead === counts.total) return BulkOperationStatus.FAILED;
  if (counts.completed + counts.dead === counts.total) return BulkOperationStatus.PARTIAL_FAILURE;
  if (counts.processing > 0 || counts.completed > 0 || counts.dead > 0) return BulkOperationStatus.PROCESSING;
  return BulkOperationStatus.PENDING;
}

export function deriveBulkOperationStatus(progress: BulkProgress): BulkOperationStatus {
  const { totalCount, completedCount, failedCount } = progress;

  if (
    totalCount < 0 ||
    completedCount < 0 ||
    failedCount < 0 ||
    completedCount + failedCount > totalCount
  ) {
    throw new AppError("INTERNAL_ERROR", "Bulk operation counters are inconsistent.");
  }

  if (totalCount === 0 || completedCount + failedCount === 0) {
    return BulkOperationStatus.PENDING;
  }

  if (completedCount + failedCount < totalCount) {
    return BulkOperationStatus.PROCESSING;
  }

  if (failedCount === totalCount) {
    return BulkOperationStatus.FAILED;
  }

  if (failedCount > 0) {
    return BulkOperationStatus.PARTIAL_FAILURE;
  }

  return BulkOperationStatus.COMPLETED;
}

import { after } from "next/server";

import { dispatchWorkerPools } from "@/lib/jobs/worker-pool";

export function wakeWorkersAfterResponse(eventId: string) {
  after(async () => {
    try {
      await dispatchWorkerPools();
    } catch (error) {
      console.error("Worker pool dispatch failed", {
        eventId,
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
  });
}

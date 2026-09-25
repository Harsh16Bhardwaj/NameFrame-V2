import { EventStatus } from "@/generated/prisma/enums";
import { AppError } from "@/lib/errors/app-error";

export function assertEventAllowsSending(status: EventStatus): void {
  if (status === EventStatus.DRAFT) {
    throw new AppError("CONFLICT", "Certificates cannot be sent while an event is in draft.");
  }
}


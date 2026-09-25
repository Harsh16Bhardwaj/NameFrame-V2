import { AppError } from "@/lib/errors/app-error";

export type EventFields = {
  title: string;
  description: string | null;
  location: string | null;
  eventDate: Date | null;
  certificateTitle: string | null;
  emailSubject: string | null;
  emailBody: string | null;
};

function optionalString(value: unknown, field: string, maximum: number): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new AppError("VALIDATION_ERROR", `${field} must be text.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new AppError("VALIDATION_ERROR", `${field} must be ${maximum} characters or fewer.`);
  }
  return normalized || null;
}

export function parseEventFields(input: Record<string, unknown>): EventFields {
  const title = optionalString(input.title, "Event title", 160) ?? "";
  let eventDate: Date | null = null;

  if (input.eventDate !== undefined && input.eventDate !== null && input.eventDate !== "") {
    if (typeof input.eventDate !== "string") {
      throw new AppError("VALIDATION_ERROR", "Event date must be a valid date.");
    }
    eventDate = new Date(input.eventDate);
    if (Number.isNaN(eventDate.getTime())) {
      throw new AppError("VALIDATION_ERROR", "Event date must be a valid date.");
    }
  }

  return {
    title,
    description: optionalString(input.description, "Description", 4000),
    location: optionalString(input.location, "Location", 240),
    eventDate,
    certificateTitle: optionalString(input.certificateTitle, "Certificate title", 240),
    emailSubject: optionalString(input.emailSubject, "Email subject", 240),
    emailBody: optionalString(input.emailBody, "Email body", 10000),
  };
}

export function validateFinalEvent(fields: EventFields): void {
  const required: Array<[unknown, string]> = [
    [fields.title, "Event title"],
    [fields.eventDate, "Event date"],
    [fields.certificateTitle, "Certificate title"],
    [fields.emailSubject, "Email subject"],
    [fields.emailBody, "Email body"],
  ];

  for (const [value, label] of required) {
    if (!value) throw new AppError("VALIDATION_ERROR", `${label} is required.`);
  }
}

export function validateTemplatePresent(template: unknown): void {
  if (!template) {
    throw new AppError("TEMPLATE_REQUIRED", "Create a certificate template before creating the event.");
  }
}

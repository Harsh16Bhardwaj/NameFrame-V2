import { AppError } from "@/lib/errors/app-error";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ParticipantValues = {
  name: string;
  email: string;
  eligibleForCertificate: boolean;
};

export function normalizeParticipantEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError("INVALID_PARTICIPANT_EMAIL", "Participant email is required.");
  }
  const email = value.trim().toLowerCase();
  if (!email || email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw new AppError("INVALID_PARTICIPANT_EMAIL", "Enter a valid participant email address.");
  }
  return email;
}

export function normalizeParticipantName(value: unknown): string {
  if (typeof value !== "string") {
    throw new AppError("INVALID_PARTICIPANT_NAME", "Participant name is required.");
  }
  const name = value.trim();
  if (!name || name.length > 200) {
    throw new AppError("INVALID_PARTICIPANT_NAME", "Participant name must contain 1 to 200 characters.");
  }
  return name;
}

export function parseParticipantValues(input: unknown): ParticipantValues {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError("VALIDATION_ERROR", "Participant details must be an object.");
  }

  const values = input as Record<string, unknown>;
  if (values.eligibleForCertificate !== undefined && typeof values.eligibleForCertificate !== "boolean") {
    throw new AppError("VALIDATION_ERROR", "Certificate eligibility must be true or false.");
  }
  return {
    name: normalizeParticipantName(values.name),
    email: normalizeParticipantEmail(values.email),
    eligibleForCertificate: values.eligibleForCertificate ?? true,
  };
}

export function parseParticipantQuery(searchParams: URLSearchParams) {
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "50");
  const search = (searchParams.get("search") ?? "").trim();
  const eligibility = searchParams.get("eligibility") ?? "all";

  if (!Number.isInteger(page) || page < 1) throw new AppError("VALIDATION_ERROR", "Page must be a positive whole number.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AppError("VALIDATION_ERROR", "Page size must be between 1 and 100.");
  if (search.length > 200) throw new AppError("VALIDATION_ERROR", "Search must be 200 characters or fewer.");
  if (!["all", "eligible", "ineligible"].includes(eligibility)) throw new AppError("VALIDATION_ERROR", "Eligibility filter is invalid.");

  return { page, limit, search, eligibility: eligibility as "all" | "eligible" | "ineligible" };
}

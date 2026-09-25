import { getOrganizationActor, requireEventAccess, requireParticipantAccess } from "@/lib/auth/authorization";
import { prisma } from "@/lib/db/prisma";
import { AppError } from "@/lib/errors/app-error";
import {
  normalizeParticipantEmail,
  parseParticipantQuery,
  parseParticipantValues,
  type ParticipantValues,
} from "@/lib/participants/validation";

const IMPORT_LIMIT = 10_000;
const BATCH_SIZE = 500;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

function participantConflict(message: string, cause?: unknown) {
  return new AppError("PARTICIPANT_ALREADY_EXISTS", message, { cause });
}

export async function listParticipants(eventId: string, searchParams: URLSearchParams) {
  await requireEventAccess(eventId);
  return listParticipantsForEvent(eventId, searchParams);
}

export async function listParticipantsForEvent(eventId: string, searchParams: URLSearchParams) {
  const query = parseParticipantQuery(searchParams);
  const filter = {
    eventId,
    deletedAt: null,
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" as const } }, { email: { contains: query.search, mode: "insensitive" as const } }] }
      : {}),
    ...(query.eligibility === "all" ? {} : { eligibleForCertificate: query.eligibility === "eligible" }),
  };

  const [participants, filteredCount, eligibleParticipants, ineligibleParticipants] = await prisma.$transaction([
    prisma.participant.findMany({
      where: filter,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true, name: true, email: true, eligibleForCertificate: true, createdAt: true, updatedAt: true,
        certificateJobs: { where: { deletedAt: null }, orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }], take: 1, select: { id: true, status: true, updatedAt: true, lastErrorCode: true, lastErrorMessage: true } },
        deliveries: { where: { deletedAt: null }, orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }], take: 1, select: { id: true, status: true, updatedAt: true, lastErrorCode: true, lastErrorMessage: true } },
      },
    }),
    prisma.participant.count({ where: filter }),
    prisma.participant.count({ where: { eventId, deletedAt: null, eligibleForCertificate: true } }),
    prisma.participant.count({ where: { eventId, deletedAt: null, eligibleForCertificate: false } }),
  ]);

  return {
    participants,
    pagination: { page: query.page, limit: query.limit, total: filteredCount, totalPages: Math.max(1, Math.ceil(filteredCount / query.limit)) },
    counts: { totalParticipants: eligibleParticipants + ineligibleParticipants, eligibleParticipants, ineligibleParticipants },
    query,
  };
}

export async function listOrganizationParticipants(searchParams: URLSearchParams) {
  const actor = await getOrganizationActor();
  const query = parseParticipantQuery(searchParams);
  const where = organizationParticipantFilter(actor.organizationId, query.search, query.eligibility);
  const [participants, filteredCount, totalParticipants, eligibleParticipants, uniquePeople] = await Promise.all([
    prisma.participant.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true, name: true, email: true, eligibleForCertificate: true, createdAt: true,
        event: { select: { id: true, title: true, status: true } },
        deliveries: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
        certificateJobs: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
    prisma.participant.count({ where }),
    prisma.participant.count({ where: organizationParticipantFilter(actor.organizationId, "", "all") }),
    prisma.participant.count({ where: organizationParticipantFilter(actor.organizationId, "", "eligible") }),
    prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(DISTINCT LOWER(p."email")) AS count
      FROM "sertify"."Participant" AS p
      INNER JOIN "sertify"."Event" AS e ON e."id" = p."eventId"
      WHERE e."organizationId" = ${actor.organizationId}
        AND e."deletedAt" IS NULL
        AND p."deletedAt" IS NULL
    `,
  ]);
  return {
    participants,
    pagination: { page: query.page, limit: query.limit, total: filteredCount, totalPages: Math.max(1, Math.ceil(filteredCount / query.limit)) },
    counts: { totalParticipants, eligibleParticipants, uniquePeople: Number(uniquePeople[0]?.count ?? 0) },
    query,
  };
}

export async function exportOrganizationParticipants(searchParams: URLSearchParams) {
  const actor = await getOrganizationActor();
  const query = parseParticipantQuery(searchParams);
  return prisma.participant.findMany({
    where: organizationParticipantFilter(actor.organizationId, query.search, query.eligibility),
    orderBy: [{ event: { title: "asc" } }, { name: "asc" }],
    select: { name: true, email: true, eligibleForCertificate: true, createdAt: true, event: { select: { title: true, status: true } } },
  });
}

function organizationParticipantFilter(organizationId: string, search: string, eligibility: "all" | "eligible" | "ineligible") {
  return {
    deletedAt: null,
    event: { organizationId, deletedAt: null },
    ...(search ? { OR: [
      { name: { contains: search, mode: "insensitive" as const } },
      { email: { contains: search, mode: "insensitive" as const } },
      { event: { title: { contains: search, mode: "insensitive" as const }, organizationId, deletedAt: null } },
    ] } : {}),
    ...(eligibility === "all" ? {} : { eligibleForCertificate: eligibility === "eligible" }),
  };
}

export async function createParticipant(eventId: string, input: unknown) {
  await requireEventAccess(eventId);
  return createParticipantForEvent(eventId, input);
}

export async function createParticipantForEvent(eventId: string, input: unknown) {
  const values = parseParticipantValues(input);
  const existing = await prisma.participant.findUnique({ where: { eventId_email: { eventId, email: values.email } } });
  if (existing && !existing.deletedAt) throw participantConflict("A participant with this email already exists in the event.");
  try {
    if (existing) {
      return await prisma.participant.update({ where: { id: existing.id }, data: { ...values, deletedAt: null } });
    }
    return await prisma.participant.create({ data: { eventId, ...values } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw participantConflict("A participant with this email already exists in the event.", error);
    }
    throw error;
  }
}

export async function updateParticipant(eventId: string, participantId: string, input: unknown) {
  const { participant } = await requireParticipantAccess(eventId, participantId);
  const values = parseParticipantValues(input);
  if (values.email !== participant.email) {
    const conflict = await prisma.participant.findUnique({ where: { eventId_email: { eventId, email: values.email } } });
    if (conflict && conflict.id !== participant.id) throw participantConflict("Another participant already uses this email.");
  }
  try {
    return await prisma.participant.update({ where: { id: participant.id }, data: values });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw participantConflict("Another participant already uses this email.", error);
    }
    throw error;
  }
}

export async function deleteParticipant(eventId: string, participantId: string) {
  const { participant } = await requireParticipantAccess(eventId, participantId);
  return prisma.participant.update({
    where: { id: participant.id },
    data: { deletedAt: new Date(), eligibleForCertificate: false },
  });
}

export async function findExistingParticipantEmails(eventId: string, rawEmails: unknown) {
  await requireEventAccess(eventId);
  if (!Array.isArray(rawEmails)) throw new AppError("VALIDATION_ERROR", "Participant emails must be provided as an array.");
  if (rawEmails.length > IMPORT_LIMIT) throw new AppError("IMPORT_TOO_LARGE", "Check at most 10,000 participant rows at once.");
  const emails = [...new Set(rawEmails.map(normalizeParticipantEmail))];
  const existing = await prisma.participant.findMany({
    where: { eventId, email: { in: emails }, deletedAt: null },
    select: { email: true },
  });
  return existing.map((participant) => participant.email);
}

export async function importParticipants(eventId: string, input: unknown) {
  await requireEventAccess(eventId);
  return persistParticipantImport(eventId, input);
}

export async function persistParticipantImport(eventId: string, input: unknown) {
  if (!Array.isArray(input) || input.length === 0) throw new AppError("IMPORT_NO_VALID_ROWS", "No valid participant rows were provided.");
  if (input.length > IMPORT_LIMIT) throw new AppError("IMPORT_TOO_LARGE", "An import may contain at most 10,000 rows.");

  const uniqueRows: ParticipantValues[] = [];
  const seen = new Set<string>();
  let skippedCount = 0;
  for (const raw of input) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new AppError("IMPORT_BATCH_FAILED", "An imported participant row is invalid.");
    const values = parseParticipantValues(raw as Record<string, unknown>);
    if (seen.has(values.email)) { skippedCount += 1; continue; }
    seen.add(values.email);
    uniqueRows.push(values);
  }

  let insertedCount = 0;
  let failedCount = 0;
  for (let offset = 0; offset < uniqueRows.length; offset += BATCH_SIZE) {
    const batch = uniqueRows.slice(offset, offset + BATCH_SIZE);
    try {
      const result = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.participant.findMany({
          where: { eventId, email: { in: batch.map((row) => row.email) } },
          select: { id: true, email: true, deletedAt: true },
        });
        const existingByEmail = new Map(existing.map((participant) => [participant.email, participant]));
        const restored = batch.filter((row) => existingByEmail.get(row.email)?.deletedAt);
        const activeCount = batch.filter((row) => existingByEmail.get(row.email) && !existingByEmail.get(row.email)?.deletedAt).length;
        await Promise.all(restored.map((row) => transaction.participant.update({
          where: { id: existingByEmail.get(row.email)!.id },
          data: { ...row, deletedAt: null },
        })));
        const fresh = batch.filter((row) => !existingByEmail.has(row.email));
        const created = await transaction.participant.createMany({ data: fresh.map((row) => ({ eventId, ...row })), skipDuplicates: true });
        return { inserted: restored.length + created.count, skipped: activeCount + fresh.length - created.count };
      });
      insertedCount += result.inserted;
      skippedCount += result.skipped;
    } catch (error) {
      console.error("Participant import batch failed", {
        eventId,
        offset,
        batchSize: batch.length,
        error,
      });
      failedCount = uniqueRows.length - offset;
      break;
    }
  }

  return {
    requestedCount: input.length,
    insertedCount,
    skippedCount,
    failedCount,
    errorCode: failedCount ? "IMPORT_BATCH_FAILED" : null,
  };
}

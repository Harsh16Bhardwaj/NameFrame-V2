import { prisma } from "@/lib/db/prisma";
import { requireLeaderActor } from "@/lib/auth/authorization";
import { requireGroupLeader, requireSameOrganization, type OrganizationActor } from "@/lib/auth/permissions";
import { AppError } from "@/lib/errors/app-error";
import { verifySmtpConnection, type SmtpConnection } from "@/lib/delivery/providers/smtp";
import { decryptCredential, encryptCredential } from "@/lib/security/encryption";

type SmtpConfigInput = {
  label?: unknown;
  host?: unknown;
  port?: unknown;
  username?: unknown;
  password?: unknown;
  fromName?: unknown;
  fromEmail?: unknown;
  secure?: unknown;
  sendLimit?: unknown;
  rateLimitPerMinute?: unknown;
};

const safeSelect = {
  id: true,
  label: true,
  host: true,
  port: true,
  username: true,
  fromName: true,
  fromEmail: true,
  secure: true,
  active: true,
  sendCount: true,
  sendLimit: true,
  rateLimitPerMinute: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function listOrganizationSmtpConfigs() {
  const actor = await requireLeaderActor();
  return prisma.organizationSmtpConfig.findMany({
    where: { organizationId: actor.organizationId, deletedAt: null },
    select: safeSelect,
    orderBy: { updatedAt: "desc" },
  });
}

export async function createOrganizationSmtpConfig(input: SmtpConfigInput) {
  const actor = await requireLeaderActor();
  return createOrganizationSmtpConfigForActor(actor, input);
}

export async function createOrganizationSmtpConfigForActor(
  actor: OrganizationActor,
  input: SmtpConfigInput,
  verify: (connection: SmtpConnection) => Promise<void> = verifySmtpConnection,
) {
  requireGroupLeader(actor);
  const values = parseSmtpInput(input, true);
  const connection = toConnection(values);
  try {
    await verify(connection);
  } catch (error) {
    throw new AppError("SMTP_CONFIGURATION_INVALID", "The SMTP connection could not be verified.", { cause: error });
  }
  return prisma.$transaction(async (transaction) => {
    await transaction.organizationSmtpConfig.updateMany({
      where: { organizationId: actor.organizationId, active: true, deletedAt: null },
      data: { active: false },
    });
    return transaction.organizationSmtpConfig.create({
      data: {
        organizationId: actor.organizationId,
        createdByUserId: actor.userId,
        label: values.label,
        host: values.host,
        port: values.port,
        username: values.username,
        encryptedPassword: encryptCredential(values.password),
        fromName: values.fromName,
        fromEmail: values.fromEmail,
        secure: values.secure,
        sendLimit: values.sendLimit,
        rateLimitPerMinute: values.rateLimitPerMinute,
      },
      select: safeSelect,
    });
  });
}

export async function updateOrganizationSmtpConfig(configId: string, input: SmtpConfigInput) {
  const actor = await requireLeaderActor();
  const existing = await requireOwnedConfig(actor, configId);
  const merged = {
    label: input.label ?? existing.label,
    host: input.host ?? existing.host,
    port: input.port ?? existing.port,
    username: input.username ?? existing.username,
    password: input.password ?? decryptCredential(existing.encryptedPassword),
    fromName: input.fromName ?? existing.fromName,
    fromEmail: input.fromEmail ?? existing.fromEmail,
    secure: input.secure ?? existing.secure,
    sendLimit: input.sendLimit ?? existing.sendLimit,
    rateLimitPerMinute: input.rateLimitPerMinute ?? existing.rateLimitPerMinute,
  };
  const values = parseSmtpInput(merged, true);
  try {
    await verifySmtpConnection(toConnection(values));
  } catch (error) {
    throw new AppError("SMTP_CONFIGURATION_INVALID", "The SMTP connection could not be verified.", { cause: error });
  }
  return prisma.$transaction(async (transaction) => {
    await transaction.organizationSmtpConfig.updateMany({
      where: { organizationId: actor.organizationId, active: true, deletedAt: null, id: { not: configId } },
      data: { active: false },
    });
    return transaction.organizationSmtpConfig.update({
      where: { id: configId },
      data: {
        label: values.label,
        host: values.host,
        port: values.port,
        username: values.username,
        encryptedPassword: encryptCredential(values.password),
        fromName: values.fromName,
        fromEmail: values.fromEmail,
        secure: values.secure,
        active: true,
        sendLimit: values.sendLimit,
        rateLimitPerMinute: values.rateLimitPerMinute,
      },
      select: safeSelect,
    });
  });
}

export async function disableOrganizationSmtpConfig(configId: string) {
  const actor = await requireLeaderActor();
  await requireOwnedConfig(actor, configId);
  return prisma.organizationSmtpConfig.update({
    where: { id: configId },
    data: { active: false },
    select: safeSelect,
  });
}

export async function validateOrganizationSmtpConnection(input: SmtpConfigInput) {
  await requireLeaderActor();
  const values = parseSmtpInput(input, true);
  try {
    await verifySmtpConnection(toConnection(values));
    return { valid: true };
  } catch (error) {
    throw new AppError("SMTP_CONFIGURATION_INVALID", "The SMTP connection could not be verified.", { cause: error });
  }
}

async function requireOwnedConfig(actor: OrganizationActor, configId: string) {
  const config = await prisma.organizationSmtpConfig.findFirst({ where: { id: configId, deletedAt: null } });
  if (!config) throw new AppError("NOT_FOUND", "SMTP configuration not found.");
  requireSameOrganization(actor, config.organizationId);
  return config;
}

function parseSmtpInput(input: SmtpConfigInput, passwordRequired: boolean) {
  const label = text(input.label, "Label", 100);
  const host = text(input.host, "SMTP host", 255);
  const username = text(input.username, "SMTP username", 320);
  const password = passwordRequired ? text(input.password, "SMTP password", 1000) : "";
  const fromName = text(input.fromName, "From name", 100);
  const fromEmail = text(input.fromEmail, "From email", 320);
  if (!/^\S+@\S+\.\S+$/.test(fromEmail)) throw new AppError("SMTP_CONFIGURATION_INVALID", "From email is invalid.");
  const port = integer(input.port, "SMTP port", 1, 65535);
  const sendLimit = integer(input.sendLimit ?? 10000, "Send limit", 1, 10_000_000);
  const rateLimitPerMinute = integer(input.rateLimitPerMinute ?? 30, "Rate limit", 1, 100_000);
  if (typeof input.secure !== "boolean") throw new AppError("SMTP_CONFIGURATION_INVALID", "Secure must be a boolean.");
  return { label, host, port, username, password, fromName, fromEmail, secure: input.secure, sendLimit, rateLimitPerMinute };
}

function toConnection(values: ReturnType<typeof parseSmtpInput>): SmtpConnection {
  return { host: values.host, port: values.port, username: values.username, password: values.password, secure: values.secure };
}

function text(value: unknown, field: string, maxLength: number) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > maxLength) {
    throw new AppError("SMTP_CONFIGURATION_INVALID", `${field} is required and must be at most ${maxLength} characters.`);
  }
  return value.trim();
}

function integer(value: unknown, field: string, min: number, max: number) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new AppError("SMTP_CONFIGURATION_INVALID", `${field} must be an integer from ${min} to ${max}.`);
  }
  return value;
}

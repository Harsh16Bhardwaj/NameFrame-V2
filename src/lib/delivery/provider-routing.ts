import { EmailProvider } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/prisma";
import { reserveProviderCapacity } from "@/lib/delivery/provider-state";
import { ResendEmailProvider } from "@/lib/delivery/providers/resend";
import { SmtpEmailProvider } from "@/lib/delivery/providers/smtp";
import type { ProviderSelection, ResolvedEmailRoute } from "@/lib/delivery/types";
import { decryptCredential } from "@/lib/security/encryption";

const DEFAULT_WAIT_MS = 60_000;

export async function resolvePrimaryProvider(organizationId: string, now = new Date()): Promise<ProviderSelection> {
  return selectAvailableRoute(await buildProviderCandidates(organizationId), now);
}

export async function resolveBackupProvider(
  organizationId: string,
  primaryRouteKey: string | null,
  now = new Date(),
): Promise<ProviderSelection> {
  const candidates = await buildProviderCandidates(organizationId);
  const resend = candidates.find((candidate) => candidate.key === "resend");
  const previous = candidates.find((candidate) => candidate.key === primaryRouteKey);
  const ordered = [resend, previous, ...candidates].filter((candidate, index, all): candidate is ResolvedEmailRoute =>
    Boolean(candidate) && all.findIndex((item) => item?.key === candidate?.key) === index,
  );
  return selectAvailableRoute(ordered, now);
}

async function selectAvailableRoute(candidates: ResolvedEmailRoute[], now: Date): Promise<ProviderSelection> {
  let earliest = new Date(now.getTime() + DEFAULT_WAIT_MS);
  let reason = "EMAIL_PROVIDER_UNAVAILABLE";
  for (const route of candidates) {
    const capacity = await reserveProviderCapacity(route, now);
    if (capacity.reserved) return { type: "READY", route };
    if (capacity.nextAttemptAt < earliest) earliest = capacity.nextAttemptAt;
    reason = capacity.reason;
  }
  return { type: "WAIT", nextAttemptAt: earliest, code: reason };
}

async function buildProviderCandidates(organizationId: string): Promise<ResolvedEmailRoute[]> {
  const candidates: ResolvedEmailRoute[] = [];
  const organizationSmtp = await prisma.organizationSmtpConfig.findFirst({
    where: { organizationId, active: true, deletedAt: null },
    orderBy: { updatedAt: "desc" },
  });
  if (organizationSmtp && organizationSmtp.sendCount < organizationSmtp.sendLimit) {
    try {
      candidates.push({
        key: `org-smtp:${organizationSmtp.id}`,
        provider: EmailProvider.SMTP,
        fromName: organizationSmtp.fromName,
        fromEmail: organizationSmtp.fromEmail,
        rateLimitPerMinute: organizationSmtp.rateLimitPerMinute,
        sendLimit: organizationSmtp.sendLimit,
        organizationId,
        organizationSmtpConfigId: organizationSmtp.id,
        adapter: new SmtpEmailProvider({
          host: organizationSmtp.host,
          port: organizationSmtp.port,
          username: organizationSmtp.username,
          password: decryptCredential(organizationSmtp.encryptedPassword),
          secure: organizationSmtp.secure,
        }),
      });
    } catch {
      // Invalid encrypted credentials make this route unusable without exposing the secret failure.
    }
  }

  const siteSmtp = readSiteSmtp();
  if (siteSmtp) candidates.push(siteSmtp);
  const resend = readResend();
  if (resend) candidates.push(resend);
  return candidates;
}

function readSiteSmtp(): ResolvedEmailRoute | null {
  const host = process.env.SITE_SMTP_HOST;
  const port = positiveInteger(process.env.SITE_SMTP_PORT);
  const username = process.env.SITE_SMTP_USERNAME;
  const password = process.env.SITE_SMTP_PASSWORD;
  const fromEmail = process.env.SITE_SMTP_FROM_EMAIL;
  if (!host || !port || !username || !password || !fromEmail) return null;
  return {
    key: "site-smtp",
    provider: EmailProvider.SMTP,
    fromName: process.env.SITE_SMTP_FROM_NAME?.trim() || "NameFrame",
    fromEmail,
    rateLimitPerMinute: positiveInteger(process.env.SITE_SMTP_RATE_LIMIT_PER_MINUTE) ?? 30,
    sendLimit: positiveInteger(process.env.SITE_SMTP_SEND_LIMIT) ?? 1_000_000,
    adapter: new SmtpEmailProvider({ host, port, username, password, secure: process.env.SITE_SMTP_SECURE !== "false" }),
  };
}

function readResend(): ResolvedEmailRoute | null {
  const apiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !fromEmail) return null;
  return {
    key: "resend",
    provider: EmailProvider.RESEND,
    fromName: process.env.RESEND_FROM_NAME?.trim() || "NameFrame",
    fromEmail,
    rateLimitPerMinute: positiveInteger(process.env.RESEND_RATE_LIMIT_PER_MINUTE) ?? 60,
    sendLimit: positiveInteger(process.env.RESEND_SEND_LIMIT) ?? 1_000_000,
    adapter: new ResendEmailProvider(apiKey),
  };
}

function positiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

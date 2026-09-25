import type { EmailProvider } from "@/generated/prisma/enums";

export type EmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: "image/png";
};

export type EmailMessage = {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  text: string;
  html: string;
  certificateUrl: string;
  attachment?: EmailAttachment;
};

export type EmailSendResult = { messageId: string };

export interface EmailProviderAdapter {
  send(message: EmailMessage, options: { idempotencyKey: string }): Promise<EmailSendResult>;
}

export type ResolvedEmailRoute = {
  key: string;
  provider: EmailProvider;
  fromName: string;
  fromEmail: string;
  rateLimitPerMinute: number;
  sendLimit: number;
  organizationId?: string;
  organizationSmtpConfigId?: string;
  adapter: EmailProviderAdapter;
};

export class EmailProviderError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
    readonly providerFailure: boolean,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "EmailProviderError";
  }
}

export type ProviderSelection =
  | { type: "READY"; route: ResolvedEmailRoute }
  | { type: "WAIT"; nextAttemptAt: Date; code: string };

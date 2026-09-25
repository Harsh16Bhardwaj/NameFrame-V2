import { Resend } from "resend";

import { EmailProviderError, type EmailMessage, type EmailProviderAdapter } from "@/lib/delivery/types";

export class ResendEmailProvider implements EmailProviderAdapter {
  constructor(private readonly apiKey: string) {}

  async send(message: EmailMessage, options: { idempotencyKey: string }): Promise<{ messageId: string }> {
    const resend = new Resend(this.apiKey);
    try {
      const { data, error } = await resend.emails.send({
        from: `${message.fromName} <${message.fromEmail}>`,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachment ? [{ filename: message.attachment.filename, content: message.attachment.content }] : undefined,
        headers: { "X-Entity-Ref-ID": options.idempotencyKey },
      }, { idempotencyKey: options.idempotencyKey });
      if (error) throw error;
      if (!data?.id) throw new Error("Resend did not return a message identifier.");
      return { messageId: data.id };
    } catch (error) {
      throw classifyResendError(error);
    }
  }
}

export function classifyResendError(error: unknown): EmailProviderError {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const status = typeof record.statusCode === "number" ? record.statusCode : undefined;
  const name = typeof record.name === "string" ? record.name.toLowerCase() : "";
  if (status === 429 || name.includes("rate_limit")) {
    return new EmailProviderError("EMAIL_PROVIDER_RATE_LIMITED", true, true, "The email provider rate limit was reached.", { cause: error });
  }
  if (status === 401 || name.includes("restricted_api_key")) {
    return new EmailProviderError("EMAIL_PROVIDER_AUTH_ERROR", true, true, "The email provider rejected authentication.", { cause: error });
  }
  if (status !== undefined && status >= 500) {
    return new EmailProviderError("EMAIL_PROVIDER_UNAVAILABLE", true, true, "The email provider is temporarily unavailable.", { cause: error });
  }
  if (status !== undefined && status >= 400) {
    return new EmailProviderError("EMAIL_PROVIDER_REJECTED", false, false, "The email provider rejected the sender or recipient configuration.", { cause: error });
  }
  return new EmailProviderError("EMAIL_SEND_FAILED", true, true, "The email provider failed unexpectedly.", { cause: error });
}

import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

import { EmailProviderError, type EmailMessage, type EmailProviderAdapter } from "@/lib/delivery/types";

export type SmtpConnection = {
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
};

export async function verifySmtpConnection(connection: SmtpConnection): Promise<void> {
  try {
    await createTransport(connection).verify();
  } catch (error) {
    throw classifySmtpError(error, "SMTP_CONNECTION_FAILED");
  }
}

export class SmtpEmailProvider implements EmailProviderAdapter {
  constructor(private readonly connection: SmtpConnection) {}

  async send(message: EmailMessage): Promise<{ messageId: string }> {
    try {
      const result = await createTransport(this.connection).sendMail({
        from: { name: message.fromName, address: message.fromEmail },
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.attachment ? [{
          filename: message.attachment.filename,
          content: message.attachment.content,
          contentType: message.attachment.contentType,
        }] : undefined,
      });
      return { messageId: result.messageId };
    } catch (error) {
      throw classifySmtpError(error);
    }
  }
}

function createTransport(connection: SmtpConnection) {
  return nodemailer.createTransport({
    host: connection.host,
    port: connection.port,
    secure: connection.secure,
    auth: { user: connection.username, pass: connection.password },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

function classifySmtpError(error: unknown, fallbackCode = "EMAIL_SEND_FAILED"): EmailProviderError {
  const smtp = (error && typeof error === "object" ? error : {}) as SMTPTransport.SentMessageInfo & { code?: string; responseCode?: number };
  const code = smtp.code?.toUpperCase();
  if (smtp.responseCode === 550 || smtp.responseCode === 553 || code === "EENVELOPE") {
    return new EmailProviderError("EMAIL_INVALID_RECIPIENT", false, false, "The email recipient was rejected.", { cause: error });
  }
  if (code === "EAUTH") {
    return new EmailProviderError("EMAIL_PROVIDER_AUTH_ERROR", true, true, "The SMTP provider rejected authentication.", { cause: error });
  }
  if (["ETIMEDOUT", "ECONNECTION", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "ESOCKET"].includes(code ?? "")) {
    return new EmailProviderError("EMAIL_PROVIDER_UNAVAILABLE", true, true, "The SMTP provider is temporarily unavailable.", { cause: error });
  }
  return new EmailProviderError(fallbackCode, true, true, "The SMTP operation failed.", { cause: error });
}

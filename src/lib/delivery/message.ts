import type { EmailMessage } from "@/lib/delivery/types";

export const MAX_CERTIFICATE_ATTACHMENT_BYTES = 8 * 1024 * 1024;

type DeliveryMessageSource = {
  id: string;
  recipientEmail: string;
  emailSubjectSnapshot: string;
  emailBodySnapshot: string;
  certificate: { artifactUrl: string; eventTitleSnapshot: string; organizationNameSnapshot: string };
};

export async function buildDeliveryMessage(
  delivery: DeliveryMessageSource,
  sender: { fromName: string; fromEmail: string },
  fetcher: typeof fetch = fetch,
): Promise<EmailMessage> {
  const certificateUrl = delivery.certificate.artifactUrl;
  const body = delivery.emailBodySnapshot.trim();
  const text = [
    body,
    `Certificate: ${certificateUrl}`,
  ].filter(Boolean).join("\n\n");
  const html = [
    `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    `<p><a href="${escapeHtml(certificateUrl)}">View your certificate</a></p>`,
  ].join("");
  const attachment = await fetchCertificateAttachment(certificateUrl, delivery.id, fetcher);

  return {
    to: delivery.recipientEmail,
    fromName: sender.fromName,
    fromEmail: sender.fromEmail,
    subject: delivery.emailSubjectSnapshot,
    text,
    html,
    certificateUrl,
    attachment,
  };
}

export async function fetchCertificateAttachment(
  certificateUrl: string,
  deliveryId: string,
  fetcher: typeof fetch = fetch,
) {
  try {
    const response = await fetcher(certificateUrl, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) return undefined;
    const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (contentType !== "image/png" || declaredSize > MAX_CERTIFICATE_ATTACHMENT_BYTES) return undefined;
    const content = Buffer.from(await response.arrayBuffer());
    if (!content.length || content.length > MAX_CERTIFICATE_ATTACHMENT_BYTES) return undefined;
    return { filename: `certificate-${deliveryId}.png`, content, contentType: "image/png" as const };
  } catch {
    return undefined;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

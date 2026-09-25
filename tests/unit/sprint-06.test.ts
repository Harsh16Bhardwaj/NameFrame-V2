import assert from "node:assert/strict";
import test from "node:test";

import { buildDeliveryMessage, fetchCertificateAttachment, MAX_CERTIFICATE_ATTACHMENT_BYTES } from "../../src/lib/delivery/message.ts";
import { classifyResendError } from "../../src/lib/delivery/providers/resend.ts";

test("delivery email always includes the immutable certificate link", async () => {
  const message = await buildDeliveryMessage({
    id: "delivery-1",
    recipientEmail: "recipient@example.test",
    emailSubjectSnapshot: "Your certificate",
    emailBodySnapshot: "Well done <winner>!",
    certificate: {
      artifactUrl: "https://assets.example.test/certificate.png",
      eventTitleSnapshot: "Event",
      organizationNameSnapshot: "Organization",
    },
  }, { fromName: "NameFrame", fromEmail: "certificates@example.test" }, async () => new Response(null, { status: 503 }));

  assert.match(message.text, /https:\/\/assets\.example\.test\/certificate\.png/);
  assert.match(message.html, /View your certificate/);
  assert.match(message.html, /&lt;winner&gt;/);
  assert.equal(message.attachment, undefined);
});

test("PNG attachment retrieval succeeds within the bounded size", async () => {
  const bytes = new Uint8Array([137, 80, 78, 71]);
  const attachment = await fetchCertificateAttachment(
    "https://assets.example.test/certificate.png",
    "delivery-2",
    async () => new Response(bytes, { headers: { "content-type": "image/png", "content-length": String(bytes.length) } }),
  );
  assert.equal(attachment?.contentType, "image/png");
  assert.deepEqual(attachment?.content, Buffer.from(bytes));
});

test("unsafe or oversized attachment responses fall back to link-only email", async () => {
  const nonPng = await fetchCertificateAttachment(
    "https://assets.example.test/certificate",
    "delivery-3",
    async () => new Response("not an image", { headers: { "content-type": "text/html" } }),
  );
  const oversized = await fetchCertificateAttachment(
    "https://assets.example.test/certificate.png",
    "delivery-3",
    async () => new Response(null, { headers: { "content-type": "image/png", "content-length": String(MAX_CERTIFICATE_ATTACHMENT_BYTES + 1) } }),
  );
  assert.equal(nonPng, undefined);
  assert.equal(oversized, undefined);
});

test("Resend test-mode recipient rejection is permanent and not mislabeled as authentication", () => {
  const error = classifyResendError({ statusCode: 403, name: "validation_error", message: "You can only send testing emails to your own email address." });
  assert.equal(error.code, "EMAIL_PROVIDER_REJECTED");
  assert.equal(error.retryable, false);
  assert.equal(error.providerFailure, false);
});

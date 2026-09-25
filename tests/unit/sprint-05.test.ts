import assert from "node:assert/strict";
import test from "node:test";

import { createCertificateHash } from "../../src/lib/certificates/integrity.ts";
import { fitParticipantName, NameFitError } from "../../src/lib/certificates/name-fit.ts";
import { certificatePublicId, classifyCloudinaryError } from "../../src/lib/certificates/renderer.ts";

test("normalized bounds convert to source pixels and long names shrink deterministically", () => {
  const fitted = fitParticipantName({
    name: "Alexandria Catherine Montgomery",
    sourceWidth: 1200,
    sourceHeight: 800,
    bounds: { left: 0.25, top: 0.4, right: 0.75, bottom: 0.6 },
    configuredFontSize: 72,
  });

  assert.deepEqual(fitted.box, { left: 300, top: 320, right: 900, bottom: 480, width: 600, height: 160 });
  assert.ok(fitted.fontSize < 72);
  assert.equal(fitParticipantName({
    name: "Alexandria Catherine Montgomery",
    sourceWidth: 1200,
    sourceHeight: 800,
    bounds: { left: 0.25, top: 0.4, right: 0.75, bottom: 0.6 },
    configuredFontSize: 72,
  }).fontSize, fitted.fontSize);
});

test("a name that cannot fit at the minimum size fails permanently", () => {
  assert.throws(
    () => fitParticipantName({
      name: "A name that cannot possibly fit",
      sourceWidth: 100,
      sourceHeight: 100,
      bounds: { left: 0.49, top: 0.49, right: 0.51, bottom: 0.51 },
      configuredFontSize: 8,
    }),
    (error) => error instanceof NameFitError && error.code === "CERTIFICATE_NAME_DOES_NOT_FIT",
  );
});

test("certificate hashes are stable, ordered, and SHA-256 sized", () => {
  const input = {
    verificationId: "05a86883-88b0-4abe-b668-a3cce4b2d03c",
    participantName: "Ada Lovelace",
    eventTitle: "Computing Summit",
    organizationName: "Analytical Society",
    artifactUrl: "https://example.test/certificate.png",
    issuedAt: new Date("2026-09-24T12:00:00.000Z"),
  };
  const first = createCertificateHash(input);
  assert.equal(first, createCertificateHash(input));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, createCertificateHash({ ...input, participantName: "Grace Hopper" }));
});

test("Cloudinary identity is deterministic and excludes participant data", () => {
  assert.equal(certificatePublicId("event-1", "participant-2"), "certificates/event-1/participant-2");
});

test("Cloudinary failures distinguish retryable provider failures from permanent input failures", () => {
  const rateLimit = classifyCloudinaryError({ http_code: 429 });
  assert.equal(rateLimit.code, "CLOUDINARY_RATE_LIMITED");
  assert.equal(rateLimit.retryable, true);

  const malformed = classifyCloudinaryError({ http_code: 400 });
  assert.equal(malformed.code, "CLOUDINARY_INVALID_TRANSFORMATION");
  assert.equal(malformed.retryable, false);
});

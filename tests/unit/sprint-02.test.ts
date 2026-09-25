import "dotenv/config";

import assert from "node:assert/strict";
import test from "node:test";

import { AppError } from "../../src/lib/errors/app-error.ts";
import { parseEventFields, validateFinalEvent, validateTemplatePresent } from "../../src/lib/events/validation.ts";
import { parseTemplateValues } from "../../src/lib/templates/service.ts";
import { validateImageFile } from "../../src/lib/uploads/cloudinary.ts";

test("event validation reports the specific required field", () => {
  const fields = parseEventFields({ title: "Launch", eventDate: "2026-10-01", certificateTitle: "", emailSubject: "Subject", emailBody: "Body" });
  assert.throws(() => validateFinalEvent(fields), (error) => error instanceof AppError && error.message === "Certificate title is required.");
});

test("template bounds must be normalized and non-collapsed", () => {
  assert.throws(
    () => parseTemplateValues({ nameLeft: 0.7, nameTop: 0.4, nameRight: 0.6, nameBottom: 0.5 }),
    (error) => error instanceof AppError && error.code === "INVALID_TEMPLATE_COORDINATES",
  );
  const values = parseTemplateValues({ nameLeft: 0.2, nameTop: 0.4, nameRight: 0.8, nameBottom: 0.55, fontSize: 48, fontColor: "#123abc", fontWeight: "600", textAlign: "center" });
  assert.equal(values.nameRight, 0.8);
});

test("event finalization without a template fails with a structured condition", () => {
  assert.throws(() => validateTemplatePresent(null), (error) => error instanceof AppError && error.code === "TEMPLATE_REQUIRED");
});

test("upload validation rejects unsupported and oversized files before provider work", () => {
  assert.throws(() => validateImageFile({ type: "application/pdf", size: 100 } as File), (error) => error instanceof AppError && error.code === "INVALID_UPLOAD_TYPE");
  assert.throws(() => validateImageFile({ type: "image/png", size: 11 * 1024 * 1024 } as File), (error) => error instanceof AppError && error.code === "UPLOAD_TOO_LARGE");
});

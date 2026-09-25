import assert from "node:assert/strict";
import test from "node:test";

import * as XLSX from "xlsx";

import {
  applyEventDuplicates,
  buildImportPreview,
  ImportParseError,
  importableRows,
  parseParticipantFile,
} from "../../src/lib/participants/import-client.ts";
import { AppError } from "../../src/lib/errors/app-error.ts";
import { parseParticipantQuery, parseParticipantValues } from "../../src/lib/participants/validation.ts";

test("participant values normalize email and default eligibility to true", () => {
  const values = parseParticipantValues({ name: "  Ada Lovelace ", email: " ADA@Example.COM " });
  assert.deepEqual(values, { name: "Ada Lovelace", email: "ada@example.com", eligibleForCertificate: true });
  assert.throws(() => parseParticipantValues({ name: "Ada", email: "not-an-email" }), (error) => error instanceof AppError && error.code === "INVALID_PARTICIPANT_EMAIL");
});

test("malformed participant payloads fail as validation errors", () => {
  for (const value of [null, [], "participant"]) {
    assert.throws(
      () => parseParticipantValues(value),
      (error) => error instanceof AppError && error.code === "VALIDATION_ERROR",
    );
  }
});

test("participant pagination and eligibility bounds are validated", () => {
  assert.throws(() => parseParticipantQuery(new URLSearchParams({ limit: "101" })), (error) => error instanceof AppError);
  assert.equal(parseParticipantQuery(new URLSearchParams({ page: "2", eligibility: "eligible" })).page, 2);
});

test("alias recognition classifies warnings, invalid rows, and file duplicates", () => {
  const preview = buildImportPreview([
    ["Participant Name", "Email Address", "Attendance", "Team"],
    ["Ada", "ADA@example.com", "yes", "Blue"],
    ["Grace", "grace@example.com", "perhaps", "Blue"],
    ["Duplicate Ada", "ada@example.com", "no", "Red"],
    ["Missing Email", "", "yes", "Red"],
  ]);
  assert.deepEqual(preview.ignoredColumns, ["Team"]);
  assert.equal(preview.summary.validRows, 1);
  assert.equal(preview.summary.warnings, 1);
  assert.equal(preview.summary.invalidRows, 1);
  assert.equal(preview.summary.duplicates, 1);
  assert.equal(preview.rows[1].eligibleForCertificate, false);
});

test("ambiguous and missing required columns fail clearly", () => {
  assert.throws(() => buildImportPreview([["Name", "Full Name", "Email"]]), (error) => error instanceof ImportParseError && error.code === "IMPORT_AMBIGUOUS_COLUMN_MAPPING");
  assert.throws(() => buildImportPreview([["Name"], ["Ada"]]), (error) => error instanceof ImportParseError && error.code === "IMPORT_MISSING_EMAIL_COLUMN");
});

test("event duplicates are excluded from the normalized confirmation payload", () => {
  const preview = buildImportPreview([["name", "email"], ["Ada", "ada@example.com"], ["Grace", "grace@example.com"]]);
  const checked = applyEventDuplicates(preview, ["ADA@example.com"]);
  assert.equal(checked.rows[0].status, "DUPLICATE_IN_EVENT");
  assert.deepEqual(importableRows(checked).map((row) => row.email), ["grace@example.com"]);
});

test("CSV and XLSX files parse entirely in the browser pipeline", async () => {
  const csv = new File(["full_name,email_id,present\nAda,ada@example.com,y"], "participants.csv", { type: "text/csv" });
  assert.equal((await parseParticipantFile(csv)).summary.validRows, 1);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["candidate name", "mail"], ["Grace", "grace@example.com"]]), "Participants");
  const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const xlsx = new File([bytes], "participants.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  assert.equal((await parseParticipantFile(xlsx)).summary.validRows, 1);
});

export type ImportStatus = "VALID" | "WARNING" | "INVALID" | "DUPLICATE_IN_FILE" | "DUPLICATE_IN_EVENT";

export type ImportPreviewRow = {
  rowNumber: number;
  name: string;
  email: string;
  eligibleForCertificate: boolean;
  status: ImportStatus;
  message: string;
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  ignoredColumns: string[];
  summary: {
    totalRows: number;
    validRows: number;
    warnings: number;
    invalidRows: number;
    duplicates: number;
    eligibleParticipants: number;
    ineligibleParticipants: number;
  };
};

export class ImportParseError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ImportParseError";
  }
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALIASES = {
  name: new Set(["name", "full name", "participant name", "participant", "student name", "candidate name"]),
  email: new Set(["email", "email address", "email id", "mail", "participant email", "student email"]),
  eligibility: new Set(["present", "attendance", "attended", "participated", "eligible", "certificate eligibility", "eligibility"]),
};
const TRUE_VALUES = new Set(["yes", "y", "true", "1", "present", "attended", "eligible", "✓", "checked"]);
const FALSE_VALUES = new Set(["", "no", "n", "false", "0", "absent", "ineligible", "x", "cross", "null", "✗"]);

function normalizeHeader(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
}

function findColumn(headers: string[], field: keyof typeof ALIASES, missingCode: string): number | null {
  const matches = headers.flatMap((header, index) => ALIASES[field].has(header) ? [index] : []);
  if (matches.length > 1) {
    throw new ImportParseError("IMPORT_AMBIGUOUS_COLUMN_MAPPING", `Multiple columns look like the ${field} field.`);
  }
  if (!matches.length && field !== "eligibility") {
    throw new ImportParseError(missingCode, `The spreadsheet is missing a ${field} column.`);
  }
  return matches[0] ?? null;
}

function parseEligibility(value: unknown, hasColumn: boolean) {
  if (!hasColumn) return { eligible: true, warning: null };
  const normalized = String(value ?? "").trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return { eligible: true, warning: null };
  if (FALSE_VALUES.has(normalized)) return { eligible: false, warning: null };
  return { eligible: false, warning: `Unknown eligibility value “${String(value)}”; defaulted to ineligible.` };
}

export function buildImportPreview(matrix: unknown[][]): ImportPreview {
  if (!matrix.length) throw new ImportParseError("IMPORT_INVALID_FILE", "The spreadsheet is empty.");
  const originalHeaders = matrix[0].map((header) => String(header ?? "").trim());
  const headers = originalHeaders.map(normalizeHeader);
  const nameIndex = findColumn(headers, "name", "IMPORT_MISSING_NAME_COLUMN")!;
  const emailIndex = findColumn(headers, "email", "IMPORT_MISSING_EMAIL_COLUMN")!;
  const eligibilityIndex = findColumn(headers, "eligibility", "") ;
  const used = new Set([nameIndex, emailIndex, ...(eligibilityIndex === null ? [] : [eligibilityIndex])]);
  const ignoredColumns = originalHeaders.filter((header, index) => header && !used.has(index));
  const dataRows = matrix.slice(1).filter((row) => row.some((value) => String(value ?? "").trim() !== ""));
  if (dataRows.length > MAX_ROWS) throw new ImportParseError("IMPORT_TOO_LARGE", "An import may contain at most 10,000 rows.");

  const seenEmails = new Set<string>();
  const rows = dataRows.map((row, index): ImportPreviewRow => {
    const rowNumber = index + 2;
    const name = String(row[nameIndex] ?? "").trim();
    const email = String(row[emailIndex] ?? "").trim().toLowerCase();
    const eligibility = parseEligibility(eligibilityIndex === null ? undefined : row[eligibilityIndex], eligibilityIndex !== null);

    if (!name) return { rowNumber, name, email, eligibleForCertificate: eligibility.eligible, status: "INVALID", message: "Name is required." };
    if (!email || !EMAIL_PATTERN.test(email)) return { rowNumber, name, email, eligibleForCertificate: eligibility.eligible, status: "INVALID", message: "A valid email is required." };
    if (seenEmails.has(email)) return { rowNumber, name, email, eligibleForCertificate: eligibility.eligible, status: "DUPLICATE_IN_FILE", message: "Later duplicate email in this file." };
    seenEmails.add(email);
    if (eligibility.warning) return { rowNumber, name, email, eligibleForCertificate: false, status: "WARNING", message: eligibility.warning };
    return { rowNumber, name, email, eligibleForCertificate: eligibility.eligible, status: "VALID", message: "Ready to import." };
  });

  return summarize(rows, ignoredColumns);
}

function summarize(rows: ImportPreviewRow[], ignoredColumns: string[]): ImportPreview {
  const importable = rows.filter((row) => row.status === "VALID" || row.status === "WARNING");
  return {
    rows,
    ignoredColumns,
    summary: {
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status === "VALID").length,
      warnings: rows.filter((row) => row.status === "WARNING").length,
      invalidRows: rows.filter((row) => row.status === "INVALID").length,
      duplicates: rows.filter((row) => row.status === "DUPLICATE_IN_FILE" || row.status === "DUPLICATE_IN_EVENT").length,
      eligibleParticipants: importable.filter((row) => row.eligibleForCertificate).length,
      ineligibleParticipants: importable.filter((row) => !row.eligibleForCertificate).length,
    },
  };
}

export function applyEventDuplicates(preview: ImportPreview, existingEmails: string[]): ImportPreview {
  const existing = new Set(existingEmails.map((email) => email.trim().toLowerCase()));
  const rows = preview.rows.map((row) =>
    existing.has(row.email) && (row.status === "VALID" || row.status === "WARNING")
      ? { ...row, status: "DUPLICATE_IN_EVENT" as const, message: "This email already exists in the event." }
      : row,
  );
  return summarize(rows, preview.ignoredColumns);
}

export function importableRows(preview: ImportPreview) {
  return preview.rows
    .filter((row) => row.status === "VALID" || row.status === "WARNING")
    .map(({ name, email, eligibleForCertificate }) => ({ name, email, eligibleForCertificate }));
}

export async function parseParticipantFile(file: File): Promise<ImportPreview> {
  if (file.size <= 0) throw new ImportParseError("IMPORT_INVALID_FILE", "Choose a non-empty CSV or XLSX file.");
  if (file.size > MAX_FILE_BYTES) throw new ImportParseError("IMPORT_TOO_LARGE", "The spreadsheet must be no larger than 10 MB.");
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "csv" && extension !== "xlsx") throw new ImportParseError("IMPORT_UNSUPPORTED_FORMAT", "Only CSV and XLSX files are supported.");

  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", dense: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new ImportParseError("IMPORT_INVALID_FILE", "The spreadsheet has no readable worksheet.");
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: false, blankrows: false });
    return buildImportPreview(matrix);
  } catch (error) {
    if (error instanceof ImportParseError) throw error;
    throw new ImportParseError("IMPORT_INVALID_FILE", "The spreadsheet could not be parsed.");
  }
}

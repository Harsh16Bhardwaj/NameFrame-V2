"use client";

import { useState } from "react";

import {
  applyEventDuplicates,
  importableRows,
  parseParticipantFile,
  type ImportPreview,
} from "@/lib/participants/import-client";

type ImportResult = { requestedCount: number; insertedCount: number; skippedCount: number; failedCount: number };

export function ParticipantImport({ eventId, onComplete }: { eventId: string; onComplete: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [stage, setStage] = useState<"idle" | "parsing" | "checking" | "importing">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragging, setDragging] = useState(false);

  async function selectFile(file: File | undefined) {
    if (!file) return;
    setPreview(null); setResult(null); setError(null); setStage("parsing");
    try {
      const parsed = await parseParticipantFile(file);
      setStage("checking");
      const emails = importableRows(parsed).map((row) => row.email);
      const response = await fetch(`/api/events/${eventId}/participants/import/check`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Existing participants could not be checked.");
      setPreview(applyEventDuplicates(parsed, payload.data.emails));
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "The spreadsheet could not be parsed.");
    } finally {
      setStage("idle");
    }
  }

  async function confirmImport() {
    if (!preview) return;
    const rows = importableRows(preview);
    if (!rows.length) return setError("There are no valid rows to import.");
    setStage("importing"); setError(null);
    try {
      const response = await fetch(`/api/events/${eventId}/participants/import`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }),
      });
      const payload = await response.json();
      if (!response.ok && !payload.data) throw new Error(payload.error?.message ?? "Import failed.");
      setResult(payload.data);
      if (payload.data.failedCount) setError(`${payload.data.failedCount} rows were not persisted because a database batch failed.`);
      onComplete();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setStage("idle");
    }
  }

  const importableCount = preview ? importableRows(preview).length : 0;

  return (
    <section className="panel participant-import">
      <div className="section-heading"><div><p className="eyebrow">Bulk addition</p><h2>Drop a participant spreadsheet</h2><p className="muted-copy">CSV, XLS, or XLSX · parsed locally before confirmation.</p></div></div>
      <label className={`participant-dropzone ${dragging ? "is-dragging" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files[0]); }}><strong>{dragging ? "Drop the spreadsheet here" : "Drop CSV or Excel here"}</strong><span>or click to choose a file with name, email, and optional eligibility columns</span><input type="file" accept=".csv,.xls,.xlsx" disabled={stage !== "idle"} onChange={(event) => selectFile(event.target.files?.[0])}/></label>
      {stage === "parsing" ? <p className="operation-state">Parsing spreadsheet…</p> : null}
      {stage === "checking" ? <p className="operation-state">Checking event duplicates…</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {preview ? (
        <>
          <div className="import-summary">
            <Metric label="Rows" value={preview.summary.totalRows} />
            <Metric label="Valid" value={preview.summary.validRows} />
            <Metric label="Warnings" value={preview.summary.warnings} />
            <Metric label="Invalid" value={preview.summary.invalidRows} />
            <Metric label="Duplicates" value={preview.summary.duplicates} />
            <Metric label="Eligible" value={preview.summary.eligibleParticipants} />
            <Metric label="Ineligible" value={preview.summary.ineligibleParticipants} />
          </div>
          {preview.ignoredColumns.length ? <p className="field-help">Ignored columns: {preview.ignoredColumns.join(", ")}</p> : null}
          <div className="table-scroll import-preview-table">
            <table className="data-table">
              <thead><tr><th>Row</th><th>Name</th><th>Email</th><th>Eligibility</th><th>Status</th><th>Message</th></tr></thead>
              <tbody>{preview.rows.slice(0, 100).map((row) => <tr key={`${row.rowNumber}-${row.email}`}><td>{row.rowNumber}</td><td>{row.name || "—"}</td><td>{row.email || "—"}</td><td>{row.eligibleForCertificate ? "Eligible" : "Ineligible"}</td><td><span className={`row-status row-${row.status.toLowerCase()}`}>{row.status.replaceAll("_", " ")}</span></td><td>{row.message}</td></tr>)}</tbody>
            </table>
          </div>
          {preview.rows.length > 100 ? <p className="field-help">Showing the first 100 of {preview.rows.length} preview rows.</p> : null}
          <div className="inline-actions"><p className="field-help">{importableCount} rows will be submitted.</p><button className="button button-primary" type="button" disabled={!importableCount || stage !== "idle"} onClick={confirmImport}>{stage === "importing" ? "Importing…" : "Confirm import"}</button></div>
        </>
      ) : null}
      {result ? <p className="success-message" role="status">Imported {result.insertedCount}; skipped {result.skippedCount}; failed {result.failedCount}.</p> : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

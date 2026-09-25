"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { ParticipantImport } from "@/app/events/[eventId]/participants/participant-import";
import { AppIcon } from "@/components/app-icon";
import { StatusBadge } from "@/components/status-badge";

type WorkState = { id: string; status: string; updatedAt: string; lastErrorCode: string | null; lastErrorMessage: string | null };
type Participant = { id: string; name: string; email: string; eligibleForCertificate: boolean; certificateJobs: WorkState[]; deliveries: WorkState[] };
type ParticipantData = {
  participants: Participant[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  counts: { totalParticipants: number; eligibleParticipants: number; ineligibleParticipants: number };
  query: { search: string; eligibility: "all" | "eligible" | "ineligible" };
};
type FormValues = { name: string; email: string; eligibleForCertificate: boolean };
const EMPTY_FORM: FormValues = { name: "", email: "", eligibleForCertificate: true };

export function ParticipantManager({ eventId, initialData, basePath }: { eventId: string; initialData: ParticipantData; basePath?: string }) {
  const router = useRouter();
  const route = basePath ?? `/events/${eventId}/participants`;
  const [isNavigating, startTransition] = useTransition();
  const [search, setSearch] = useState(initialData.query.search);
  const [eligibility, setEligibility] = useState(initialData.query.eligibility);
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"single" | "bulk" | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const hasActiveWork = initialData.participants.some((participant) => [...participant.certificateJobs, ...participant.deliveries].some((item) => ["PENDING", "PROCESSING", "RETRY_PENDING"].includes(item.status)));

  useEffect(() => {
    if (!hasActiveWork) return;
    const interval = window.setInterval(() => router.refresh(), 5000);
    return () => window.clearInterval(interval);
  }, [hasActiveWork, router]);

  function navigate(page: number, nextSearch = search, nextEligibility = eligibility) {
    const embedded = Boolean(basePath);
    const params = new URLSearchParams({ [embedded ? "participantPage" : "page"]: String(page), [embedded ? "participantLimit" : "limit"]: "25" });
    if (nextSearch.trim()) params.set(embedded ? "participantSearch" : "search", nextSearch.trim());
    if (nextEligibility !== "all") params.set(embedded ? "participantEligibility" : "eligibility", nextEligibility);
    startTransition(() => router.push(`${route}?${params.toString()}#participants`));
  }

  async function request(path: string, body: unknown) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "The request could not be started.");
  }

  async function saveParticipant(event: React.FormEvent) {
    event.preventDefault(); setPending("participant"); setError(null); setMessage(null);
    try {
      const response = await fetch(`/api/events/${eventId}/participants${editingId ? `/${editingId}` : ""}`, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Participant could not be saved.");
      setMessage(editingId ? "Participant updated." : "Participant added."); setForm(EMPTY_FORM); setEditingId(null); setAddMode(null); router.refresh();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Participant could not be saved."); }
    finally { setPending(null); }
  }

  async function sendOne(participant: Participant) {
    setPending(participant.id); setError(null); setMessage(null);
    try { await request(`/api/events/${eventId}/certificate-jobs`, { participantId: participant.id, requestId: crypto.randomUUID() }); setMessage(`Certificate queued for ${participant.name}.`); router.refresh(); }
    catch (sendError) { setError(sendError instanceof Error ? sendError.message : "Certificate could not be queued."); }
    finally { setPending(null); }
  }

  async function sendAll() {
    setPending("bulk"); setError(null); setMessage(null);
    try { await request(`/api/events/${eventId}/bulk-operations`, { operationRequestId: crypto.randomUUID() }); setMessage("Bulk certificate run queued."); router.refresh(); }
    catch (sendError) { setError(sendError instanceof Error ? sendError.message : "Bulk run could not be queued."); }
    finally { setPending(null); }
  }

  async function removeParticipant(participant: Participant) {
    if (!window.confirm(`Remove ${participant.name} from this event?`)) return;
    setError(null); setMessage(null);
    const response = await fetch(`/api/events/${eventId}/participants/${participant.id}`, { method: "DELETE" });
    const payload = await response.json();
    if (!response.ok) return setError(payload.error?.message ?? "Participant could not be removed.");
    setMessage("Participant removed."); router.refresh();
  }

  function edit(participant: Participant) { setEditingId(participant.id); setForm({ name: participant.name, email: participant.email, eligibleForCertificate: participant.eligibleForCertificate }); setAddMode("single"); setError(null); }

  return <section className="participant-workspace" id="participants">
    <div className="participant-kpis" aria-label="Participant counts">
      <article><span><AppIcon name="participants" size={17}/>Participants</span><strong>{initialData.counts.totalParticipants}</strong></article>
      <article><span><AppIcon name="certificate" size={17}/>Eligible</span><strong>{initialData.counts.eligibleParticipants}</strong></article>
      <article><span><AppIcon name="warning" size={17}/>Ineligible</span><strong>{initialData.counts.ineligibleParticipants}</strong></article>
    </div>

    <section className="panel participant-panel embedded-participants">
      <div className="participant-heading"><div><p className="eyebrow">Participants</p><h2>Certificate recipients</h2></div><div className="inline-actions"><button className="button button-secondary" type="button" onClick={() => { setEditingId(null); setForm(EMPTY_FORM); setAddMode("single"); }}>Single addition</button><button className="button button-secondary" type="button" onClick={() => setAddMode("bulk")}>Bulk addition</button><button className="button button-primary button-with-icon" disabled={!initialData.counts.eligibleParticipants || pending === "bulk"} type="button" onClick={sendAll}><AppIcon name="mail" size={16}/>{pending === "bulk" ? "Queuing…" : `Send all (${initialData.counts.eligibleParticipants})`}</button></div></div>

      {addMode === "single" ? <form className="participant-form compact-participant-form" onSubmit={saveParticipant}><label className="field"><span>Name</span><input className="text-input" value={form.name} maxLength={200} required onChange={(event) => setForm({ ...form, name: event.target.value })}/></label><label className="field"><span>Email</span><input className="text-input" type="email" value={form.email} required onChange={(event) => setForm({ ...form, email: event.target.value })}/></label><label className="checkbox-field"><input type="checkbox" checked={form.eligibleForCertificate} onChange={(event) => setForm({ ...form, eligibleForCertificate: event.target.checked })}/> Eligible</label><div className="inline-actions"><button className="button button-primary" disabled={pending === "participant"} type="submit">{editingId ? "Save participant" : "Add participant"}</button><button className="button button-secondary" type="button" onClick={() => setAddMode(null)}>Cancel</button></div></form> : null}
      {addMode === "bulk" || initialData.counts.totalParticipants === 0 ? <ParticipantImport eventId={eventId} onComplete={() => { setAddMode(null); router.refresh(); }}/> : null}

      {initialData.counts.totalParticipants ? <>
        <form className="participant-filters" onSubmit={(event) => { event.preventDefault(); navigate(1); }}><span><AppIcon name="search" size={16}/><input value={search} aria-label="Search participants" placeholder="Search by name or email" onChange={(event) => setSearch(event.target.value)}/></span><select value={eligibility} onChange={(event) => { const value = event.target.value as typeof eligibility; setEligibility(value); navigate(1, search, value); }}><option value="all">All participants</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option></select><button className="button button-secondary" disabled={isNavigating} type="submit">Search</button></form>
        <div className="participant-table-viewport"><table className="data-table participant-table"><thead><tr><th>Name</th><th>Email</th><th>Eligibility</th><th>Delivery</th><th>Actions</th></tr></thead><tbody>{initialData.participants.map((participant) => { const latest = participant.deliveries[0] ?? participant.certificateJobs[0]; const status = latest?.status ?? "NOT_SENT"; const detail = latest?.lastErrorCode === "EMAIL_PROVIDER_UNAVAILABLE" ? "Configure SMTP to continue" : latest?.lastErrorMessage; return <tr key={participant.id}><td><strong>{participant.name}</strong></td><td>{participant.email}</td><td><span className={`status-pill ${participant.eligibleForCertificate ? "status-active" : "status-draft"}`}>{participant.eligibleForCertificate ? "Eligible" : "Ineligible"}</span></td><td><div className="participant-delivery-status"><StatusBadge status={status}/>{detail ? <small title={latest?.lastErrorMessage ?? undefined}>{detail}</small> : status === "SENT" ? <small>Provider accepted; inbox not confirmed</small> : null}</div></td><td><div className="table-actions"><button className="icon-action" aria-label={`Send certificate to ${participant.name}`} title="Send certificate" disabled={!participant.eligibleForCertificate || pending === participant.id || ["PENDING", "PROCESSING", "RETRY_PENDING"].includes(status)} type="button" onClick={() => sendOne(participant)}><AppIcon name="mail" size={16}/></button><button className="text-button" type="button" onClick={() => edit(participant)}>Edit</button><button className="text-button danger-text" type="button" onClick={() => removeParticipant(participant)}>Remove</button></div></td></tr>; })}</tbody></table></div>
        <div className="pagination"><span>Page {initialData.pagination.page} of {initialData.pagination.totalPages} · {initialData.pagination.total} matching · 25 per page</span><div className="inline-actions"><button className="button button-secondary" disabled={initialData.pagination.page <= 1 || isNavigating} type="button" onClick={() => navigate(initialData.pagination.page - 1)}>Previous</button><button className="button button-secondary" disabled={initialData.pagination.page >= initialData.pagination.totalPages || isNavigating} type="button" onClick={() => navigate(initialData.pagination.page + 1)}>Next</button></div></div>
      </> : null}
      {message ? <p className="success-message" role="status">{message}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  </section>;
}

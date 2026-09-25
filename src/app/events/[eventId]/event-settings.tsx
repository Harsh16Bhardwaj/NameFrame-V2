"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppIcon } from "@/components/app-icon";
import type { EventViewModel } from "@/lib/events/view-model";

export function EventSettings({ event, isLeader }: { event: EventViewModel; isLeader: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState({ title: event.title, description: event.description ?? "", location: event.location ?? "", eventDate: event.eventDate?.slice(0, 10) ?? "", certificateTitle: event.certificateTitle ?? "", emailSubject: event.emailSubject ?? "", emailBody: event.emailBody ?? "" });
  const [stateAction, setStateAction] = useState<"complete" | "delete" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function mutate(path: string, method: string, body?: unknown) {
    const response = await fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "The action failed.");
  }

  async function save() {
    setPending(true); setError(null); setMessage(null);
    try { await mutate(`/api/events/${event.id}`, "PATCH", form); setMessage("Event details saved."); router.refresh(); }
    catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Save failed."); }
    finally { setPending(false); }
  }

  async function confirmStateAction() {
    if (!stateAction) return;
    setPending(true); setError(null);
    try {
      if (stateAction === "complete") { await mutate(`/api/events/${event.id}/complete`, "POST"); setMessage("Event marked completed."); setStateAction(null); router.refresh(); }
      else { await mutate(`/api/events/${event.id}`, "DELETE", { confirmation }); router.push("/events"); router.refresh(); }
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "The event state could not be changed."); }
    finally { setPending(false); }
  }

  function update(name: keyof typeof form, value: string) { setForm((current) => ({ ...current, [name]: value })); }

  return <>
    <section className="panel event-edit-panel" id="event-details">
      <div className="section-heading"><div><p className="eyebrow">Edit event</p><h2>Details and delivery copy</h2><p className="section-copy">Keep participant-facing details and certificate email content together.</p></div><button className="button button-primary" disabled={pending} type="button" onClick={save}>{pending ? "Saving…" : "Save changes"}</button></div>
      <div className="event-edit-grid">
        <Field label="Event title" value={form.title} onChange={(value) => update("title", value)}/><Field label="Certificate title" value={form.certificateTitle} onChange={(value) => update("certificateTitle", value)}/>
        <TextField label="Description" value={form.description} onChange={(value) => update("description", value)}/><TextField label="Email subject" value={form.emailSubject} onChange={(value) => update("emailSubject", value)}/>
        <Field label="Location" value={form.location} onChange={(value) => update("location", value)}/><Field label="Event date" type="date" value={form.eventDate} onChange={(value) => update("eventDate", value)}/>
        <label className="field field-wide"><span>Email body</span><textarea className="text-input textarea" value={form.emailBody} onChange={(change) => update("emailBody", change.target.value)}/></label>
      </div>
      {isLeader ? <div className="event-state-row"><div><AppIcon name="warning" size={17}/><span><strong>Event state</strong><small>Complete or delete this event with typed confirmation.</small></span></div><div className="inline-actions">{event.status !== "COMPLETED" ? <button className="button button-secondary" type="button" onClick={() => { setConfirmation(""); setStateAction("complete"); }}>Mark complete</button> : null}<button className="button button-danger" type="button" onClick={() => { setConfirmation(""); setStateAction("delete"); }}>Delete event</button></div></div> : null}
      {message ? <p className="success-message" role="status">{message}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
    {stateAction ? <div className="modal-backdrop" role="presentation"><section className="confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="state-dialog-title"><p className="eyebrow">Confirm event state</p><h2 id="state-dialog-title">{stateAction === "complete" ? "Mark this event complete?" : "Delete this event?"}</h2><p>{stateAction === "complete" ? "Certificate sending will stop. Type COMPLETE to confirm." : "The event will be soft-deleted and removed from the workspace. Type DELETE to confirm."}</p><input className="text-input" autoFocus value={confirmation} placeholder={`Type ${stateAction === "complete" ? "COMPLETE" : "DELETE"}`} onChange={(change) => setConfirmation(change.target.value)}/><div className="inline-actions"><button className="button button-secondary" type="button" onClick={() => setStateAction(null)}>Cancel</button><button className={stateAction === "delete" ? "button button-danger" : "button button-primary"} disabled={pending || confirmation !== (stateAction === "complete" ? "COMPLETE" : "DELETE")} type="button" onClick={confirmStateAction}>{pending ? "Working…" : stateAction === "complete" ? "Mark complete" : "Delete event"}</button></div></section></div> : null}
  </>;
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) { return <label className="field"><span>{label}</span><input className="text-input" type={type} value={value} onChange={(change) => onChange(change.target.value)}/></label>; }
function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="field"><span>{label}</span><textarea className="text-input textarea" value={value} onChange={(change) => onChange(change.target.value)}/></label>; }

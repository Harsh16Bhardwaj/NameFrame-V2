"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppIcon } from "@/components/app-icon";
import { CertificateTemplateEditor, type TemplateEditorValue } from "@/components/certificate-template-editor";
import type { EventViewModel } from "@/lib/events/view-model";

type EventForm = {
  title: string;
  description: string;
  location: string;
  eventDate: string;
  certificateTitle: string;
  emailSubject: string;
  emailBody: string;
};

function initialForm(event: EventViewModel): EventForm {
  return {
    title: event.title,
    description: event.description ?? "",
    location: event.location ?? "",
    eventDate: event.eventDate?.slice(0, 10) ?? "",
    certificateTitle: event.certificateTitle ?? "",
    emailSubject: event.emailSubject ?? "",
    emailBody: event.emailBody ?? "",
  };
}

export function EventWorkspace({ event }: { event: EventViewModel }) {
  const router = useRouter();
  const [form, setForm] = useState(() => initialForm(event));
  const [hasTemplate, setHasTemplate] = useState(Boolean(event.template));
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [submitting, setSubmitting] = useState(false);
  const [submissionAction, setSubmissionAction] = useState<"DRAFT" | "ACTIVE" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof EventForm, string>>>({});
  const firstRender = useRef(true);

  async function persistDraft() {
    const response = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!response.ok) throw new Error("Draft could not be saved.");
  }

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        await persistDraft();
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => window.clearTimeout(timeout);
  // The whole form is the intended autosave dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event.id, form]);

  function update(field: keyof EventForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setError(null);
  }

  function validateForActivation() {
    const labels: Record<keyof EventForm, string> = {
      title: "Event title",
      description: "Description",
      location: "Location",
      eventDate: "Event date",
      certificateTitle: "Certificate title",
      emailSubject: "Email subject",
      emailBody: "Email body",
    };
    const required: Array<keyof EventForm> = ["title", "eventDate", "certificateTitle", "emailSubject", "emailBody"];
    const errors: Partial<Record<keyof EventForm, string>> = {};
    for (const field of required) if (!form[field].trim()) errors[field] = `${labels[field]} is required.`;
    setFieldErrors(errors);
    if (Object.keys(errors).length) {
      setError("Complete the highlighted event and email fields before making this event active.");
      document.getElementById("event-details")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    if (!hasTemplate) {
      setError("Configure and save the certificate template before making this event active.");
      document.getElementById("template-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return false;
    }
    return true;
  }

  async function finish(status: "DRAFT" | "ACTIVE") {
    setError(null);
    setSubmitting(true);
    setSubmissionAction(status);
    try {
      if (status === "DRAFT") {
        await persistDraft();
        router.push("/dashboard");
        router.refresh();
        return;
      }
      if (!validateForActivation()) return;
      const response = await fetch(`/api/events/${event.id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message ?? "Event could not be created.");
        return;
      }
      router.push(`/events/${event.id}`);
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Event could not be saved.");
    } finally {
      setSubmitting(false);
      setSubmissionAction(null);
    }
  }

  const templateValue: TemplateEditorValue | null = event.template ? { ...event.template } : null;
  const detailsReady = Boolean(form.title.trim() && form.eventDate.trim() && form.certificateTitle.trim());
  const emailReady = Boolean(form.emailSubject.trim() && form.emailBody.trim());
  const progress = [detailsReady, emailReady, hasTemplate];
  const currentStep = progress.findIndex((complete) => !complete);

  return (
    <>
      <section className="creation-topbar">
        <div><p className="eyebrow">Create event</p><p>{event.organizationName} · Draft changes save automatically</p></div>
        <span className={`save-indicator save-${saveState}`} aria-live="polite"><i/>{saveState === "saving" ? "Saving draft..." : saveState === "error" ? "Draft save failed" : "All changes saved"}</span>
      </section>

      <section className="panel event-preview-card event-appearance-card">
        <div className="event-preview-surface">
          <div className="event-preview-logo" style={event.organizationLogoUrl ? { backgroundImage: `url(${event.organizationLogoUrl})` } : undefined}>{event.organizationLogoUrl ? null : event.organizationName.slice(0, 2).toUpperCase()}</div>
          <div className="event-preview-copy"><span>{event.organizationName}</span><h1>{form.title || "Untitled event"}</h1><p>{form.description || "Add a short event description to complete this event card."}</p><div><span><AppIcon name="participants" size={14}/>0 participants</span><span><AppIcon name="certificate" size={14}/>{form.certificateTitle || "Certificate title"}</span><span><AppIcon name="events" size={14}/>{form.eventDate || "Date not set"}</span><span>{form.location || "Location not set"}</span></div></div>
          <span className="status-badge status-neutral">Draft</span>
        </div>
      </section>

      <div className="creation-progress" role="list" aria-label="Event setup progress">
        {progress.map((complete, index) => <span role="listitem" key={index} className={complete ? "done" : currentStep === index ? "active" : ""} aria-label={`${["Event details", "Email message", "Certificate template"][index]} ${complete ? "complete" : currentStep === index ? "current" : "not complete"}`} title={["Event details", "Email message", "Certificate template"][index]}/>) }
      </div>

      <div className="creation-workspace">
        <div className="creation-content">
          <section className="panel form-card creation-card" id="event-details">
            <div className="section-heading compact-section-heading"><div><p className="eyebrow">Event details</p><h2>What are you recognizing?</h2><p className="section-copy">The essential information participants will see.</p></div></div>
            <div className="form-grid">
              <Field label="Event title" name="title" value={form.title} error={fieldErrors.title} onChange={update} placeholder="Annual design showcase" required/>
              <Field label="Event date" name="eventDate" value={form.eventDate} error={fieldErrors.eventDate} onChange={update} type="date" required/>
              <Field label="Location" name="location" value={form.location} error={fieldErrors.location} onChange={update} placeholder="Delhi"/>
              <Field label="Certificate title" name="certificateTitle" value={form.certificateTitle} error={fieldErrors.certificateTitle} onChange={update} placeholder="Certificate of Achievement" required/>
              <TextField label="Event description" name="description" value={form.description} error={fieldErrors.description} onChange={update} placeholder="A short description for your organizing team and event workspace."/>
            </div>

            <div className="form-section-divider"><span><AppIcon name="mail" size={17}/>Email delivery</span><p>This message is sent with each generated certificate.</p></div>
            <div className="form-grid email-form-grid">
              <Field label="Email subject" name="emailSubject" value={form.emailSubject} error={fieldErrors.emailSubject} onChange={update} placeholder="Your certificate from Annual Design Showcase" required wide/>
              <TextField label="Email body" name="emailBody" value={form.emailBody} error={fieldErrors.emailBody} onChange={update} placeholder="Congratulations — your certificate is ready. Use the secure link below to view it." required/>
            </div>
          </section>

          <CertificateTemplateEditor eventId={event.id} initialValue={templateValue} onSaved={() => setHasTemplate(true)}/>

          {error ? <p className="form-error creation-error" role="alert"><AppIcon name="warning" size={18}/>{error}</p> : null}
          <div className="creation-actions">
            <button className="button button-secondary" type="button" disabled={submitting} onClick={() => void finish("DRAFT")}>{submissionAction === "DRAFT" ? "Saving..." : "Save as draft"}</button>
            <button className="button button-quiet" type="button" disabled={submitting} onClick={() => router.push("/events")}>Cancel</button>
            <button className="button button-primary" type="button" disabled={submitting} onClick={() => void finish("ACTIVE")}>{submissionAction === "ACTIVE" ? "Activating..." : "Activate"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, name, value, error, onChange, type = "text", required = false, wide = false, placeholder }: { label: string; name: keyof EventForm; value: string; error?: string; onChange: (name: keyof EventForm, value: string) => void; type?: string; required?: boolean; wide?: boolean; placeholder?: string }) {
  return <label className={wide ? "field field-wide" : "field"}><span>{label}{required ? " *" : ""}</span><input className="text-input" type={type} value={value} placeholder={placeholder} onChange={(change) => onChange(name, change.target.value)}/>{error ? <small className="form-error">{error}</small> : null}</label>;
}

function TextField({ label, name, value, error, onChange, required = false, placeholder }: { label: string; name: keyof EventForm; value: string; error?: string; onChange: (name: keyof EventForm, value: string) => void; required?: boolean; placeholder?: string }) {
  return <label className="field field-wide"><span>{label}{required ? " *" : ""}</span><textarea className="text-input textarea" value={value} placeholder={placeholder} onChange={(change) => onChange(name, change.target.value)}/>{error ? <small className="form-error">{error}</small> : null}</label>;
}

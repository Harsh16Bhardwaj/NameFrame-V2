import Link from "next/link";
import { notFound } from "next/navigation";

import { EventSettings } from "@/app/events/[eventId]/event-settings";
import { ParticipantManager } from "@/app/events/[eventId]/participants/participant-manager";
import { AppIcon } from "@/components/app-icon";
import { AppShell } from "@/components/app-shell";
import { CertificateTemplateEditor, type TemplateEditorValue } from "@/components/certificate-template-editor";
import { StatusBadge } from "@/components/status-badge";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getOrganizationActor } from "@/lib/auth/authorization";
import { getBulkOperationsForEvent, getCertificateJobsForEvent, getDeliveriesForEvent, getEventDashboardForEvent } from "@/lib/dashboard/service";
import { readableOperationalError } from "@/lib/dashboard/presentation";
import { getEvent } from "@/lib/events/service";
import { eventViewModel } from "@/lib/events/view-model";
import { listParticipants } from "@/lib/participants/service";

type SearchValues = Record<string, string | string[] | undefined>;

export default async function EventPage({ params, searchParams }: { params: Promise<{ eventId: string }>; searchParams: Promise<SearchValues> }) {
  const { eventId } = await params;
  const rawQuery = await searchParams;
  const participantQuery = new URLSearchParams({ limit: "25", page: typeof rawQuery.participantPage === "string" ? rawQuery.participantPage : "1" });
  if (typeof rawQuery.participantSearch === "string") participantQuery.set("search", rawQuery.participantSearch);
  if (typeof rawQuery.participantEligibility === "string") participantQuery.set("eligibility", rawQuery.participantEligibility);

  let result;
  try {
    result = await Promise.all([
      getEvent(eventId), getOrganizationActor(), getEventDashboardForEvent(eventId),
      getBulkOperationsForEvent(eventId, { pageSize: 8 }), getCertificateJobsForEvent(eventId, { pageSize: 12 }),
      getDeliveriesForEvent(eventId, { pageSize: 12 }), listParticipants(eventId, participantQuery),
    ]);
  } catch { notFound(); }

  const [eventRecord, actor, dashboard, bulkOperations, jobs, deliveries, participantData] = result;
  const event = eventViewModel(eventRecord);
  const metrics = dashboard.metrics;
  const templateValue: TemplateEditorValue | null = event.template ? { ...event.template } : null;
  const serializableParticipants = {
    ...participantData,
    participants: participantData.participants.map((participant) => ({
      ...participant, createdAt: participant.createdAt.toISOString(), updatedAt: participant.updatedAt.toISOString(),
      certificateJobs: participant.certificateJobs.map((job) => ({ ...job, updatedAt: job.updatedAt.toISOString() })),
      deliveries: participant.deliveries.map((delivery) => ({ ...delivery, updatedAt: delivery.updatedAt.toISOString() })),
    })),
  };
  const activity = [
    ...bulkOperations.data.map((item) => ({ id: `bulk-${item.id}`, at: item.createdAt, status: item.status, title: `Bulk run · ${item.totalJobs} certificates`, detail: `${item.completed} complete · ${item.processing} processing · ${item.pending} pending · ${item.dead} failed`, certificateUrl: null as string | null })),
    ...jobs.data.map((item) => ({ id: `job-${item.id}`, at: item.updatedAt, status: item.status, title: `Certificate · ${item.participant.name}`, detail: item.lastErrorCode ? readableOperationalError(item.lastErrorCode, item.lastErrorMessage) : `${item.attemptCount}/${item.maxAttempts} attempts`, certificateUrl: item.certificate?.artifactUrl ?? null })),
    ...deliveries.data.map((item) => ({ id: `delivery-${item.id}`, at: item.completedAt ?? item.createdAt, status: item.status, title: `Email · ${item.participant.name}`, detail: item.lastErrorCode ? readableOperationalError(item.lastErrorCode, item.lastErrorMessage) : item.status === "SENT" ? `Accepted by ${item.latestProvider ?? "the configured provider"}; inbox delivery is not confirmed.` : `${item.currentQueue}${item.latestProvider ? ` · ${item.latestProvider}` : ""}`, certificateUrl: item.certificate.artifactUrl })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 12);

  return <AppShell>
    <section className="event-identity-header">
      <div className="event-identity-logo" style={event.organizationLogoUrl ? { backgroundImage: `url(${event.organizationLogoUrl})` } : undefined}>{event.organizationLogoUrl ? null : <AppIcon name="building" size={28}/>}</div>
      <div className="event-identity-copy"><div className="event-title-line"><StatusBadge status={event.status}/><span>{event.eventDate ? new Date(event.eventDate).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "Date not set"}</span></div><h1>{event.title}</h1><p>{event.description || "No event description added."}</p><div><span><AppIcon name="building" size={14}/>{event.organizationName}</span><span><AppIcon name="location" size={14}/>{event.location || "Location not set"}</span></div></div>
      <div className="event-header-actions"><Link className="button button-secondary" href="#event-details">Edit event</Link><Link className="button button-secondary" href="#event-template">Edit template</Link></div>
    </section>

    <section className="event-kpi-grid">
      <Kpi icon="participants" label="Participants" value={metrics.participants} detail={`${metrics.eligibleParticipants} eligible`} tone="violet"/>
      <Kpi icon="certificate" label="Issued" value={metrics.issuedCertificates} detail={`${metrics.certificateJobs.completed} generated`} tone="blue"/>
      <Kpi icon="retry" label="In progress" value={metrics.certificateJobs.pending + metrics.certificateJobs.processing + metrics.certificateJobs.retrying} detail={`${metrics.certificateJobs.retrying} retrying`} tone="amber"/>
      <Kpi icon="mail" label="Emails sent" value={metrics.deliveries.sent} detail={`${metrics.deliveries.pending + metrics.deliveries.processing} pending`} tone="green"/>
      <Kpi icon="warning" label="Needs attention" value={metrics.certificateJobs.dead + metrics.deliveries.dead} detail="Failed jobs and emails" tone="red"/>
    </section>

    <section className="panel event-activity-panel">
      <div className="section-heading"><div><p className="eyebrow">Latest worker activity</p><h2>Recent certificate runs</h2><p className="section-copy">Generation and email delivery updates appear here in the order they happened.</p></div></div>
      {activity.length ? <div className="activity-timeline">{activity.map((item) => <article key={item.id}><span className={`activity-indicator activity-${activityTone(item.status)}`}>{activityMark(item.status)}</span><div><strong>{item.title}</strong><p>{item.detail}</p>{item.certificateUrl ? <a href={item.certificateUrl} target="_blank" rel="noreferrer">Open certificate</a> : null}</div><div><StatusBadge status={item.status}/><time>{item.at.toLocaleString()}</time></div></article>)}</div> : <div className="empty-state compact-empty"><p>No certificate activity yet. Send one certificate or start a bulk run below.</p></div>}
    </section>

    <ParticipantManager eventId={eventId} basePath={`/events/${eventId}`} initialData={serializableParticipants}/>
    <EventSettings event={event} isLeader={actor.role === OrganizationRole.GROUP_LEADER}/>
    <div id="event-template"><CertificateTemplateEditor eventId={eventId} initialValue={templateValue} compact/></div>
  </AppShell>;
}

function Kpi({ icon, label, value, detail, tone }: { icon: "participants" | "certificate" | "retry" | "mail" | "warning"; label: string; value: number; detail: string; tone: "violet" | "blue" | "amber" | "green" | "red" }) { return <article className={`event-kpi event-kpi-${tone}`}><div className="event-kpi-topline"><span className="event-kpi-icon"><AppIcon name={icon} size={17}/></span><span>{label}</span></div><strong>{value}</strong><small>{detail}</small></article>; }
function activityTone(status: string) { return ["COMPLETED", "SENT", "DELIVERED"].includes(status) ? "success" : ["DEAD", "FAILED", "PARTIAL_FAILURE"].includes(status) ? "danger" : "pending"; }
function activityMark(status: string) { return ["COMPLETED", "SENT", "DELIVERED"].includes(status) ? "✓" : ["DEAD", "FAILED", "PARTIAL_FAILURE"].includes(status) ? "×" : "•"; }

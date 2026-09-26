import Link from "next/link";
import { redirect } from "next/navigation";

import { AppIcon, type AppIconName } from "@/components/app-icon";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getOrganizationActor } from "@/lib/auth/authorization";
import { ensureCurrentUser } from "@/lib/auth/user-sync";
import { getOrganizationDashboard, getProviderStatus } from "@/lib/dashboard/service";

export default async function DashboardPage() {
  const user = await ensureCurrentUser();
  if (!user.organizationId) redirect("/onboarding");
  const [actor, dashboard, providerStatus] = await Promise.all([
    getOrganizationActor(), getOrganizationDashboard(), getProviderStatus(),
  ]);
  const { metrics } = dashboard;
  const cards: Array<{ label: string; value: number; detail: string; icon: AppIconName; tone?: string }> = [
    { label: "Total events", value: metrics.totalEvents, detail: `${metrics.activeEvents} active · ${metrics.draftEvents} draft`, icon: "calendar" },
    { label: "Unique participants", value: metrics.uniqueParticipants, detail: `${metrics.totalParticipants} total entries`, icon: "participants" },
    { label: "Certificates issued", value: metrics.issuedCertificates, detail: "Verified issuance records", icon: "certificate" },
    { label: "Emails sent", value: metrics.sentDeliveries, detail: `${metrics.pendingDeliveries} pending`, icon: "mail" },
    { label: "Retrying", value: metrics.retryQueueCount, detail: "In the retry queue", icon: "retry", tone: "warm" },
    { label: "Needs attention", value: metrics.deadLetterCount, detail: `${metrics.deadDeliveries} dead deliveries`, icon: "warning", tone: "danger" },
  ];
  const totalDeliveryWork = metrics.sentDeliveries + metrics.pendingDeliveries + metrics.deadDeliveries;
  const deliveryRate = totalDeliveryWork ? Math.round(metrics.sentDeliveries / totalDeliveryWork * 100) : 0;
  const eligibleRate = metrics.totalParticipants ? Math.round(metrics.eligibleParticipants / metrics.totalParticipants * 100) : 0;
  const pendingDeliveryRate = totalDeliveryWork ? Math.round(metrics.pendingDeliveries / totalDeliveryWork * 100) : 0;
  const sentSweep = deliveryRate;
  const pendingSweep = sentSweep + pendingDeliveryRate;
  const largestEventParticipantCount = Math.max(1, ...dashboard.recentEvents.map((event) => event._count.participants));

  return (
    <AppShell className="dashboard-workspace">
      <section className="dashboard-header operational-header workspace-page-header">
        <div><p className="eyebrow">Operational overview</p><h1>Dashboard</h1><p className="muted-copy">A clear view of events, participants, certificate generation, and delivery health.</p><div className="identity-line"><span>{dashboard.organization.name}</span><i /> <span>{actor.role === OrganizationRole.GROUP_LEADER ? "Group leader" : "Group member"}</span></div></div>
        {actor.role === OrganizationRole.GROUP_LEADER ? <Link className="button button-primary button-with-icon" href="/events/new"><AppIcon name="plus" size={17}/>Create event</Link> : null}
      </section>

      <section className="metric-grid metric-grid-six" aria-label="Organization summary">
        {cards.map((card) => <article className={`panel metric-card icon-metric-card ${card.tone ? `metric-${card.tone}` : ""}`} key={card.label}><div className="metric-icon"><AppIcon name={card.icon}/></div><span>{card.label}</span><strong>{card.value}</strong><small>{card.detail}</small></article>)}
      </section>

      <section className="dashboard-analysis-grid" aria-label="Operational analytics">
        <article className="panel analytics-summary-card"><div className="section-heading"><div><p className="eyebrow">Readiness</p><h2>Participant eligibility</h2></div><strong>{eligibleRate}%</strong></div><div className="analytics-progress"><i style={{ width: `${eligibleRate}%` }}/></div><p>{metrics.eligibleParticipants} of {metrics.totalParticipants} participant entries are ready for certificate generation.</p></article>
        <article className="panel analytics-summary-card"><div className="section-heading"><div><p className="eyebrow">Delivery</p><h2>Email completion</h2></div><strong>{deliveryRate}%</strong></div><div className="analytics-progress"><i style={{ width: `${deliveryRate}%` }}/></div><p>{metrics.sentDeliveries} sent · {metrics.pendingDeliveries} pending · {metrics.deadDeliveries} need attention.</p></article>
      </section>

      <section className="dashboard-visual-grid" aria-label="Visual operational analytics">
        <article className="panel dashboard-chart-card dashboard-fulfilment-card">
          <div className="section-heading"><div><p className="eyebrow">Work fulfilment</p><h2>Delivery mix</h2></div><AppIcon name="certificate" size={19}/></div>
          <div className="dashboard-donut-layout">
            <div className="dashboard-donut" style={{ background: `conic-gradient(#397866 0 ${sentSweep}%, #c18a43 ${sentSweep}% ${pendingSweep}%, #a3484f ${pendingSweep}% 100%)` }}><div><strong>{deliveryRate}%</strong><span>accepted</span></div></div>
            <div className="dashboard-legend"><div><i className="legend-dot legend-sent"/><span>Sent</span><strong>{metrics.sentDeliveries}</strong></div><div><i className="legend-dot legend-pending"/><span>In progress</span><strong>{metrics.pendingDeliveries}</strong></div><div><i className="legend-dot legend-dead"/><span>Needs attention</span><strong>{metrics.deadDeliveries}</strong></div></div>
          </div>
          <p className="chart-note">A live view of all email delivery work across the organization.</p>
        </article>

        <article className="panel dashboard-chart-card dashboard-events-chart-card">
          <div className="section-heading"><div><p className="eyebrow">Event distribution</p><h2>Participants by event</h2></div><AppIcon name="participants" size={19}/></div>
          {dashboard.recentEvents.length ? <div className="dashboard-event-bars">{dashboard.recentEvents.slice(0, 5).map((event) => { const participants = event._count.participants; const deliveries = event._count.deliveries; return <div className="dashboard-event-bar-row" key={event.id}><div className="dashboard-event-bar-label"><strong>{event.title || "Untitled draft"}</strong><span>{participants} participants · {deliveries} emails</span></div><div className="dashboard-event-bar-track"><i style={{ width: `${Math.max(participants ? 5 : 0, participants / largestEventParticipantCount * 100)}%` }}/><b>{participants}</b></div></div>; })}</div> : <div className="empty-state compact-empty"><p>No event distribution yet.</p></div>}
          <p className="chart-note">The five most recently updated events, sized by participant volume.</p>
        </article>
      </section>

      <div className="dashboard-columns">
        <section className="panel operational-panel">
          <div className="section-heading"><div><p className="eyebrow">Workspace</p><h2>Recent events</h2></div><Link className="text-link" href="/events">View all</Link></div>
          {dashboard.recentEvents.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>Event</th><th>Status</th><th>Participants</th><th>Certificates</th><th>Deliveries</th></tr></thead><tbody>{dashboard.recentEvents.map((event) => <tr key={event.id}><td><Link className="text-link" href={event.status === "DRAFT" ? "/events/new" : `/events/${event.id}`}>{event.title || "Untitled draft"}</Link></td><td><StatusBadge status={event.status} /></td><td>{event._count.participants}</td><td>{event._count.certificates}</td><td>{event._count.deliveries}</td></tr>)}</tbody></table></div> : <div className="empty-state compact-empty"><p>No events yet.</p></div>}
        </section>

        <section className="panel operational-panel">
          <div className="section-heading"><div><p className="eyebrow">Routing</p><h2>Provider health</h2></div></div>
          <div className="provider-list">{providerStatus.providers.map((provider) => <article className="provider-row" key={provider.label}><div><strong>{provider.label}</strong>{provider.smtpLabel ? <span>{provider.smtpLabel}</span> : null}</div><StatusBadge status={provider.status.toUpperCase().replaceAll(" ", "_")} /><p>{provider.sendCount.toLocaleString()} / {provider.sendLimit.toLocaleString()} sends · {provider.rateLimitPerMinute}/minute</p>{provider.unhealthyUntil ? <small>Unavailable until {provider.unhealthyUntil.toLocaleString()}</small> : null}</article>)}</div>
        </section>
      </div>

      <section className="panel operational-panel activity-panel">
        <div className="section-heading"><div><p className="eyebrow">Latest</p><h2>Recent activity</h2></div></div>
        {dashboard.activity.length ? <ol className="activity-list">{dashboard.activity.map((item) => <li key={item.id}><div><Link className="text-link" href={`/events/${item.eventId}`}>{item.eventTitle}</Link><p>{item.message}</p></div><time dateTime={item.at.toISOString()}>{item.at.toLocaleString()}</time></li>)}</ol> : <div className="empty-state compact-empty"><p>No operational activity yet.</p></div>}
      </section>
    </AppShell>
  );
}

import { redirect } from "next/navigation";

import { AppIcon } from "@/components/app-icon";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getOrganizationActor } from "@/lib/auth/authorization";
import { ensureCurrentUser } from "@/lib/auth/user-sync";
import { getOrganizationDashboard, getProviderStatus } from "@/lib/dashboard/service";
import { listOrganizationSmtpConfigs } from "@/lib/delivery/smtp-config-service";
import { listOrganizationMembers } from "@/lib/organizations/service";
import { OrganizationControls } from "@/app/organization/organization-controls";

export default async function OrganizationPage() {
  const user = await ensureCurrentUser();
  if (!user.organizationId) redirect("/organization/setup");
  const [actor, dashboard, providerStatus, members] = await Promise.all([getOrganizationActor(), getOrganizationDashboard(), getProviderStatus(), listOrganizationMembers()]);
  const smtpConfigs = actor.role === OrganizationRole.GROUP_LEADER ? await listOrganizationSmtpConfigs() : [];
  const activeSmtp = smtpConfigs.find((config) => config.active) ?? smtpConfigs[0] ?? null;
  const smtpForClient = activeSmtp ? { id: activeSmtp.id, label: activeSmtp.label, host: activeSmtp.host, port: activeSmtp.port, username: activeSmtp.username, fromName: activeSmtp.fromName, fromEmail: activeSmtp.fromEmail, secure: activeSmtp.secure, active: activeSmtp.active, sendCount: activeSmtp.sendCount, sendLimit: activeSmtp.sendLimit, rateLimitPerMinute: activeSmtp.rateLimitPerMinute } : null;
  const serializableMembers = members.map((member) => ({ ...member, createdAt: member.createdAt.toISOString() }));

  return (
    <AppShell>
      <section className="workspace-page-header page-heading app-page-heading">
        <div><p className="eyebrow">Organization</p><h1>{dashboard.organization.name}</h1><p className="muted-copy">Shared identity, role access, and safe delivery-provider status.</p></div>
        <span className="role-badge"><AppIcon name="building"/>{actor.role === OrganizationRole.GROUP_LEADER ? "Group leader" : "Group member"}</span>
      </section>
      <section className="organization-summary-grid">
        <article className="panel organization-identity-card"><div className="organization-monogram">{dashboard.organization.name.slice(0, 2).toUpperCase()}</div><div><p className="eyebrow">Workspace identity</p><h2>{dashboard.organization.name}</h2><p>This identity is attached to events and certificate records across the workspace.</p></div></article>
        <article className="panel organization-facts"><div><span>Members can view</span><strong>Operational dashboards</strong></div><div><span>Leader access</span><strong>Events and SMTP settings</strong></div><div><span>Organization scope</span><strong>{dashboard.metrics.totalEvents} events · {dashboard.metrics.uniqueParticipants} people</strong></div></article>
      </section>
      <section className="panel operational-panel organization-provider-panel">
        <div className="section-heading"><div><p className="eyebrow">Delivery routes</p><h2>Provider health and usage</h2><p className="section-copy">Only safe operational information is shown here. Credentials remain private.</p></div></div>
        <div className="provider-list">{providerStatus.providers.map((provider) => <article className="provider-row" key={provider.label}><div><strong>{provider.label}</strong>{provider.smtpLabel ? <span>{provider.smtpLabel}</span> : null}</div><StatusBadge status={provider.status.toUpperCase().replaceAll(" ", "_")}/><p>{provider.sendCount.toLocaleString()} / {provider.sendLimit.toLocaleString()} sends · {provider.rateLimitPerMinute}/minute</p></article>)}</div>
      </section>
      <OrganizationControls initialSmtp={smtpForClient} members={serializableMembers} isLeader={actor.role === OrganizationRole.GROUP_LEADER}/>
    </AppShell>
  );
}

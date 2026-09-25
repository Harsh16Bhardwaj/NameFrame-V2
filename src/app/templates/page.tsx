import Link from "next/link";
import { redirect } from "next/navigation";

import { AppIcon } from "@/components/app-icon";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getOrganizationActor } from "@/lib/auth/authorization";
import { ensureCurrentUser } from "@/lib/auth/user-sync";
import { listEvents } from "@/lib/events/service";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const user = await ensureCurrentUser();
  if (!user.organizationId) redirect("/organization/setup");
  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim().slice(0, 100) ?? "";
  const [actor, events] = await Promise.all([getOrganizationActor(), listEvents({ search: query })]);
  const configured = events.filter((event) => event.template);

  return <AppShell>
    <section className="events-index-header"><div><p className="eyebrow">Design library</p><h1>Templates</h1><p>Certificate designs, the events using them, and their ownership.</p></div>{actor.role === OrganizationRole.GROUP_LEADER ? <Link className="button button-primary button-with-icon" href="/events/new"><AppIcon name="plus" size={16}/>New event</Link> : null}</section>
    <div className="events-index-toolbar">
      <form className="event-search" action="/templates" method="get" role="search"><AppIcon name="search" size={17}/><input name="q" defaultValue={query} aria-label="Search templates" placeholder="Search by event, creator, location, or certificate…"/>{query ? <Link href="/templates">Clear</Link> : null}<button type="submit">Search</button></form>
      <div className="event-counts"><span><strong>{configured.length}</strong> configured</span><span><i/>{events.length - configured.length} missing</span></div>
    </div>
    {events.length ? <section className="template-index-list">{events.map((event) => <article className="panel template-index-card" key={event.id}>
      <div className="template-index-thumb" style={event.template ? { backgroundImage: `url(${event.template.backgroundUrl})` } : undefined}>{event.template ? null : <AppIcon name="templates" size={22}/>}</div>
      <div className="template-index-main"><div><StatusBadge status={event.template ? "READY" : "DRAFT"}/><h2>{event.certificateTitle || "Untitled certificate"}</h2></div><p>Used by <Link href={`/events/${event.id}`}>{event.title}</Link></p><div className="template-index-meta"><span><AppIcon name="calendar" size={14}/>Created {event.template?.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "not yet"}</span><span><AppIcon name="participants" size={14}/>Created by {event.createdBy.name || event.createdBy.email}</span><span><AppIcon name="events" size={14}/>{event._count.participants} participants</span></div></div>
      <Link className="event-row-open" href={`/events/${event.id}#event-template`} aria-label={`Edit template for ${event.title}`}><AppIcon name="chevron-right" size={19}/></Link>
    </article>)}</section> : <section className="panel empty-state polished-empty"><h2>{query ? "No matching templates" : "No event templates yet"}</h2><p>{query ? "Try another event, creator, location, or certificate name." : "Create an event first; its template will appear here."}</p></section>}
  </AppShell>;
}

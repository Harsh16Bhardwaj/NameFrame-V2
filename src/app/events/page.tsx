import Link from "next/link";
import { redirect } from "next/navigation";

import { AppIcon } from "@/components/app-icon";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getOrganizationActor } from "@/lib/auth/authorization";
import { ensureCurrentUser } from "@/lib/auth/user-sync";
import { listEvents } from "@/lib/events/service";

type EventsSearchParams = { q?: string | string[] };

export default async function EventsPage({ searchParams }: { searchParams: Promise<EventsSearchParams> }) {
  const user = await ensureCurrentUser();
  if (!user.organizationId) redirect("/organization/setup");

  const rawQuery = (await searchParams).q;
  const query = (Array.isArray(rawQuery) ? rawQuery[0] : rawQuery)?.trim().slice(0, 100) ?? "";
  const [actor, events] = await Promise.all([getOrganizationActor(), listEvents({ search: query })]);
  const active = events.filter((event) => event.status === "ACTIVE").length;
  const completed = events.filter((event) => event.status === "COMPLETED").length;

  return (
    <AppShell>
      <section className="events-index-header">
        <div>
          <p className="eyebrow">Event workspace</p>
          <h1>Events</h1>
          <p>Find an event and continue from where your team left off.</p>
        </div>
        {actor.role === OrganizationRole.GROUP_LEADER ? <Link className="button button-primary button-with-icon" href="/events/new"><AppIcon name="plus" size={16}/>New event</Link> : null}
      </section>

      <div className="events-index-toolbar">
        <form className="event-search" action="/events" method="get" role="search">
          <AppIcon name="search" size={17}/>
          <input name="q" defaultValue={query} aria-label="Search events" placeholder="Search by event, organization, location, or certificate…"/>
          {query ? <Link href="/events" aria-label="Clear event search">Clear</Link> : null}
          <button type="submit">Search</button>
        </form>
        <div className="event-counts" aria-label="Event counts">
          <span><strong>{events.length}</strong>{query ? " found" : " total"}</span>
          <span><i className="count-active"/>{active} active</span>
          <span><i/>{completed} completed</span>
        </div>
      </div>

      {events.length ? (
        <section className="event-index-list" aria-label="Events">
          {events.map((event) => (
            <article className="panel event-index-card" key={event.id}>
              <div className="event-company-logo" style={event.organizationLogoUrl ? { backgroundImage: `url(${event.organizationLogoUrl})` } : undefined}>
                {event.organizationLogoUrl ? null : <AppIcon name="building" size={23}/>} 
              </div>

              <Link className="event-index-main" href={`/events/${event.id}`}>
                <div className="event-index-title">
                  <h2>{event.title}</h2>
                  <span>{event.organizationName}</span>
                </div>
                <p>{event.description || "No event description added yet."}</p>
                <div className="event-index-facts">
                  <span><AppIcon name="participants" size={14}/>{event._count.participants} participant{event._count.participants === 1 ? "" : "s"}</span>
                  <span><AppIcon name="calendar" size={14}/>{event.eventDate?.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) ?? "Date not set"}</span>
                  <span><AppIcon name="location" size={14}/>{event.location || "Location not set"}</span>
                  <span><AppIcon name="certificate" size={14}/>{event.certificateTitle || "Certificate not named"}</span>
                </div>
              </Link>

              <div className="event-index-side">
                <StatusBadge status={event.status}/>
                <Link className="event-row-open" href={`/events/${event.id}`} aria-label={`Open ${event.title}`}><AppIcon name="chevron-right" size={19}/></Link>
              </div>
            </article>
          ))}
        </section>
      ) : (
        <section className="panel empty-state polished-empty compact-event-empty">
          <span className="empty-icon"><AppIcon name="search" size={22}/></span>
          <h2>{query ? "No matching events" : "No events yet"}</h2>
          <p>{query ? `Nothing matched “${query}”. Try a title, location, organization, or certificate name.` : "Create your first event, add its certificate design, then import participants."}</p>
          {query ? <Link className="button button-secondary" href="/events">Clear search</Link> : actor.role === OrganizationRole.GROUP_LEADER ? <Link className="button button-primary" href="/events/new">Create first event</Link> : null}
        </section>
      )}
    </AppShell>
  );
}

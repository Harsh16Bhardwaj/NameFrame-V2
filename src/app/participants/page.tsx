import Link from "next/link";
import { redirect } from "next/navigation";

import { AppIcon } from "@/components/app-icon";
import { AppShell } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { ensureCurrentUser } from "@/lib/auth/user-sync";
import { listOrganizationParticipants } from "@/lib/participants/service";

type SearchValues = Record<string, string | string[] | undefined>;

export default async function OrganizationParticipantsPage({ searchParams }: { searchParams: Promise<SearchValues> }) {
  const user = await ensureCurrentUser();
  if (!user.organizationId) redirect("/organization/setup");
  const raw = await searchParams;
  const params = new URLSearchParams({ page: first(raw.page) || "1", limit: "50", search: first(raw.search), eligibility: first(raw.eligibility) || "all" });
  const data = await listOrganizationParticipants(params);
  const exportParams = new URLSearchParams({ search: data.query.search, eligibility: data.query.eligibility });

  return <AppShell>
    <section className="events-index-header participant-directory-header"><div><p className="eyebrow">People directory</p><h1>Participants</h1><p>Every participant entry across your organization, with its event and delivery state.</p></div><a className="button button-primary button-with-icon" href={`/api/participants/export?${exportParams}`}><AppIcon name="download" size={16}/>Download CSV</a></section>
    <section className="participant-directory-kpis" aria-label="Participant summary">
      <article><span>Participant entries</span><strong>{data.counts.totalParticipants.toLocaleString()}</strong><small>Across all events</small></article>
      <article><span>Unique people</span><strong>{data.counts.uniquePeople.toLocaleString()}</strong><small>Matched by email</small></article>
      <article><span>Eligible</span><strong>{data.counts.eligibleParticipants.toLocaleString()}</strong><small>Ready for certificates</small></article>
    </section>
    <section className="panel organization-participant-panel">
      <form className="participant-directory-filters" action="/participants" method="get"><label><AppIcon name="search" size={17}/><input name="search" defaultValue={data.query.search} placeholder="Search name, email, or event" aria-label="Search participants"/></label><select name="eligibility" defaultValue={data.query.eligibility} aria-label="Filter eligibility"><option value="all">All eligibility</option><option value="eligible">Eligible</option><option value="ineligible">Ineligible</option></select><button className="button button-secondary" type="submit">Search</button>{data.query.search || data.query.eligibility !== "all" ? <Link href="/participants">Clear</Link> : null}</form>
      {data.participants.length ? <><div className="organization-participant-table"><table className="data-table"><thead><tr><th>Participant</th><th>Event</th><th>Eligibility</th><th>Delivery</th><th>Added</th></tr></thead><tbody>{data.participants.map((participant) => { const latest = participant.deliveries[0] ?? participant.certificateJobs[0]; return <tr key={participant.id}><td><strong>{participant.name}</strong><span>{participant.email}</span></td><td><Link href={`/events/${participant.event.id}#participants`}>{participant.event.title}</Link><small>{participant.event.status.toLowerCase()}</small></td><td><span className={`status-pill ${participant.eligibleForCertificate ? "status-active" : "status-draft"}`}>{participant.eligibleForCertificate ? "Eligible" : "Ineligible"}</span></td><td><StatusBadge status={latest?.status ?? "NOT_SENT"}/></td><td>{participant.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td></tr>; })}</tbody></table></div><Pagination page={data.pagination.page} totalPages={data.pagination.totalPages} search={data.query.search} eligibility={data.query.eligibility}/></> : <div className="empty-state compact-empty"><h2>No matching participants</h2><p>Try another search or add participants from an event workspace.</p></div>}
    </section>
  </AppShell>;
}

function Pagination({ page, totalPages, search, eligibility }: { page: number; totalPages: number; search: string; eligibility: string }) {
  const href = (next: number) => `/participants?${new URLSearchParams({ page: String(next), search, eligibility })}`;
  return <nav className="directory-pagination" aria-label="Participant pages"><span>Page {page} of {totalPages}</span><div>{page > 1 ? <Link className="button button-secondary" href={href(page - 1)}>Previous</Link> : null}{page < totalPages ? <Link className="button button-secondary" href={href(page + 1)}>Next</Link> : null}</div></nav>;
}

function first(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] ?? "" : value ?? ""; }

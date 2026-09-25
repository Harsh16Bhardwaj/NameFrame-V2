"use client";

import { AppShell } from "@/components/app-shell";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <AppShell><section className="panel compact-panel dashboard-error-panel"><p className="eyebrow">Dashboard unavailable</p><h1>We could not load operational data.</h1><p className="muted-copy">No internal details were exposed. Try the request again.</p><button className="button button-primary" onClick={reset}>Retry dashboard</button></section></AppShell>;
}

import { AppShell } from "@/components/app-shell";

export default function DashboardLoading() {
  return <AppShell><section className="dashboard-header workspace-page-header"><p className="eyebrow">Dashboard</p><h1>Loading organization activity...</h1></section><section className="metric-grid metric-grid-six">{Array.from({ length: 6 }, (_, index) => <div className="panel loading-card" key={index} />)}</section></AppShell>;
}

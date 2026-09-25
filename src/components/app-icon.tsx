export type AppIconName =
  | "arrow-left"
  | "arrow-right"
  | "building"
  | "calendar"
  | "certificate"
  | "chevron-right"
  | "dashboard"
  | "download"
  | "events"
  | "mail"
  | "menu"
  | "location"
  | "participants"
  | "plus"
  | "retry"
  | "search"
  | "templates"
  | "warning";

const paths: Record<AppIconName, React.ReactNode> = {
  "arrow-left": <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>,
  "arrow-right": <><path d="m9 18 6-6-6-6"/><path d="M5 12h10"/></>,
  building: <><path d="M4 21h16"/><path d="M6 21V7l6-3 6 3v14"/><path d="M9 10h1M14 10h1M9 14h1M14 14h1M11 21v-3h2v3"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></>,
  certificate: <><path d="M6 3h12v12H6z"/><path d="m9 21 3-2 3 2v-6H9zM9 7h6M9 11h4"/></>,
  "chevron-right": <path d="m9 18 6-6-6-6"/>,
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></>,
  download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14a2 2 0 0 0 2-2v-2M3 17v2a2 2 0 0 0 2 2"/></>,
  events: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M7 14h4v3H7z"/></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  location: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
  participants: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  retry: <><path d="M20 6v5h-5"/><path d="M19 11a7 7 0 1 0 1 5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  templates: <><path d="M4 4h16v16H4z"/><path d="M8 8h8M8 12h5M8 16h7"/></>,
  warning: <><path d="M12 3 2.5 20h19z"/><path d="M12 9v4M12 17h.01"/></>,
};

export function AppIcon({ name, size = 20, className }: { name: AppIconName; size?: number; className?: string }) {
  return <svg aria-hidden="true" className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

"use client";

import { UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { AppIcon, type AppIconName } from "@/components/app-icon";

const navigation: Array<{ href: string; label: string; icon: AppIconName }> = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/events", label: "Events", icon: "events" },
  { href: "/templates", label: "Templates", icon: "templates" },
  { href: "/participants", label: "Participants", icon: "participants" },
  { href: "/organization", label: "Organization", icon: "building" },
];

export function AppShell({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <div className="workspace-shell">
      <aside className={`workspace-sidebar ${open ? "is-open" : ""}`}>
        <div className="workspace-brand-row">
          <Link className="workspace-brand" href="/dashboard" onClick={() => setOpen(false)}>
            <Image src="/nameframelogo.png" width={38} height={38} alt="" />
            <span>NameFrame</span>
          </Link>
          <button className="workspace-mobile-close" type="button" aria-label="Close navigation" onClick={() => setOpen(false)}>×</button>
        </div>

        <nav className="workspace-navigation" aria-label="Application navigation">
          <p>Workspace</p>
          {navigation.map((item) => {
            const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
            return <Link key={item.href} href={item.href} className={active ? "active" : ""} onClick={() => setOpen(false)}><AppIcon name={item.icon}/><span>{item.label}</span></Link>;
          })}
        </nav>

        <div className="workspace-sidebar-footer">
          <div className="workspace-account-copy"><span>Account</span><small>Profile and sign out</small></div>
          <UserButton showName appearance={{ elements: { rootBox: "workspace-user-root", userButtonBox: "workspace-user-box", userButtonOuterIdentifier: "workspace-user-name" } }} />
        </div>
      </aside>

      {open ? <button className="workspace-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)} /> : null}

      <div className="workspace-main">
        <div className="workspace-utility-bar">
          <button className="workspace-menu-button" type="button" aria-label="Open navigation" onClick={() => setOpen(true)}><AppIcon name="menu"/></button>
          <div className="history-controls" aria-label="Page history">
            <button type="button" onClick={() => router.back()} aria-label="Go back"><AppIcon name="arrow-left" size={18}/></button>
            <button type="button" onClick={() => router.forward()} aria-label="Go forward"><AppIcon name="arrow-right" size={18}/></button>
          </div>
          <span className="workspace-route-label">{navigation.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "Workspace"}</span>
        </div>
        <main className={`workspace-content ${className}`}>{children}</main>
      </div>
    </div>
  );
}

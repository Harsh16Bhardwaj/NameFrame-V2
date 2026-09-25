import { UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export function AppHeader() {
  return (
    <nav className="topbar" aria-label="Primary application navigation">
      <Link className="brand app-brand" href="/dashboard"><Image src="/nameframelogo.png" width={34} height={34} alt="" /><span>NameFrame</span></Link>
      <div className="topbar-actions">
        <Link href="/dashboard">Dashboard</Link>
        <Link href="/events">Events</Link>
        <Link href="/templates">Templates</Link>
        <UserButton />
      </div>
    </nav>
  );
}

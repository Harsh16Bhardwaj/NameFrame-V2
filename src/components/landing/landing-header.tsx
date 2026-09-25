import { Show, UserButton } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";

export function LandingHeader() {
  return <header className="reference-nav"><div className="reference-nav-inner">
    <Link className="reference-brand" href="/" aria-label="NameFrame home"><Image src="/nameframe-stitch-logo.png" width={656} height={170} alt="NameFrame" priority/><span>ED.<br/>2025</span></Link>
    <nav aria-label="Primary navigation"><Link href="/dashboard">Dashboard</Link><Link href="/events/new">Create</Link><a href="#operations">Verify</a><Link href="/contact">Collab</Link><a href="#workflow">Features</a></nav>
    <div className="reference-nav-actions"><Show when="signed-out"><Link className="reference-enter" href="/sign-up">Enter app</Link><Link className="reference-avatar" href="/sign-in" aria-label="Sign in">N</Link></Show><Show when="signed-in"><Link className="reference-enter" href="/dashboard">Enter app</Link><UserButton/></Show></div>
  </div></header>;
}

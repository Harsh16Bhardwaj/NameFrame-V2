import { Show } from "@clerk/nextjs";
import Link from "next/link";

import { LandingIcon } from "@/components/landing/landing-icon";
import { LandingHeader } from "@/components/landing/landing-header";

const metrics = [
  ["10k", "Participants per import"],
  ["500", "Rows per database write"],
  ["~2k/hr", "Synthetic generation throughput"],
  ["4", "Coordinated worker slots"],
] as const;

export function LandingHero() {
  return <><LandingHeader/><section className="reference-hero"><span className="coordinate coordinate-top">+ 42.3601° N, 71.0589° W</span><span className="coordinate coordinate-bottom">[ANCHOR_RIG: ACTIVE]</span><div className="reference-hero-grid">
    <div className="reference-hero-copy"><p className="reference-pill"><i/>No manual exports · event-ready workflow</p><h1>Automated certificates, <em>crafted with reverence</em> for real milestones.</h1><p className="reference-lede">Upload your participant roster, position names on your own artwork, generate certificates in the background, and follow every delivery from one operational workspace.</p><div className="reference-actions"><Show when="signed-out"><Link className="reference-primary" href="/sign-up">Start creating certificates</Link></Show><Show when="signed-in"><Link className="reference-primary" href="/events/new">Start creating certificates</Link></Show><Link className="reference-secondary" href="/templates">Explore templates</Link></div><div className="reference-proof"><span><LandingIcon name="check" size={15}/>Organization scoped</span><span><LandingIcon name="workflow" size={15}/>Durable background jobs</span><span><LandingIcon name="upload" size={15}/>CSV &amp; Excel roster sync</span></div></div>
    <div className="reference-studio"><span className="registration reg-one">+</span><span className="registration reg-two">+</span><span className="registration reg-three">+</span><span className="registration reg-four">+</span><div className="reference-studio-card"><div className="reference-studio-head"><span><i/>Studio canvas // live</span><div><b>POS: X: 48.2% Y: 56.4%</b><strong>PREVIEW READY</strong></div></div><div className="reference-sheet-wrap"><span>+ 0,0</span><span>1200 × 850 +</span><span>+ LAT</span><span>ED. 2026 +</span><div className="reference-sheet"><div className="reference-medal"><LandingIcon name="award" size={22}/></div><p>Certificate of Fellowship</p><small>This academic honor and distinction is bestowed upon</small><div className="reference-live-name"><i>+</i><i>+</i><i>+</i><i>+</i><h3>Dr. Eleanor Vance</h3></div><p className="reference-description">For exceptional contribution to the annual systems and design fellowship.</p><div className="reference-signatures"><div><i/><b>Julian Sterling</b><span>Program Director</span></div><div className="reference-verified"><LandingIcon name="check" size={17}/><span>ISSUED</span></div><div><i/><b>September 25, 2026</b><span>Certificate record</span></div></div></div></div><div className="reference-tool-ribbon"><div><small>Font family</small><b>EB Garamond</b></div><div><small>Canvas</small><b>1200 × 850</b></div><div><small>Generation</small><b>Async job</b></div></div></div></div>
  </div></section><section className="reference-metrics">{metrics.map(([value,label])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</section></>;
}

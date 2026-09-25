import { LandingIcon } from "@/components/landing/landing-icon";

const pillars = [
  ["award" as const, "Adaptive Name Fitting", "Long participant names are reduced deterministically until they fit the configured width without wrapping.", "8px minimum · bounded fitting"],
  ["workflow" as const, "Durable Job Recovery", "Generation and delivery work is persisted before processing, with stale-claim recovery and explicit retries.", "Crash-safe job state"],
  ["mail" as const, "Provider-Aware Delivery", "Organization SMTP, site SMTP, and Resend are routed through bounded attempts and health checks.", "2 primary · 2 backup attempts"],
  ["check" as const, "Stable Artifact Identity", "Certificate artifacts reuse deterministic event and participant identities so retries do not create duplicates.", "Idempotent issuance records"],
] as const;

export function Reliability() {
  return <section className="reference-reliability"><div className="reference-reliability-inner"><header><p><i/>Precision rendering subsystem</p><h2>Engineered for <em>zero breakage.</em></h2><span>When issuing certificates at event scale, a clipped surname or duplicated send damages trust. NameFrame keeps those failure modes visible and recoverable.</span></header><div className="reference-pillar-grid">{pillars.map(([icon,title,copy,note])=><article key={title}><i><LandingIcon name={icon} size={17}/></i><h3>{title}</h3><p>{copy}</p><small>{note}</small></article>)}</div><footer><span><i/>Generation and delivery queues remain inspectable</span><div><b>MAX IMPORT: 10,000 ROWS</b><b>CLAIM BATCH: 5 JOBS</b></div></footer></div></section>;
}

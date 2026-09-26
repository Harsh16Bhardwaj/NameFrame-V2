import Image from "next/image";
import Link from "next/link";

import { LandingIcon } from "@/components/landing/landing-icon";

export function AuthPageShell({ mode, children }: { mode: "sign-in" | "sign-up"; children: React.ReactNode }) {
  const signingIn = mode === "sign-in";
  return <main className="auth-page">
    <section className="auth-story">
      <Link className="auth-brand" href="/"><Image src="/nameframelogo.png" width={42} height={42} alt=""/><span>NameFrame</span></Link>
      <div className="auth-story-copy">
        <p className="landing-kicker">Certificates, without the chaos</p>
        <h1>{signingIn ? "A calmer way to run every certificate event." : "One clear workspace for every certificate run."}</h1>
        <p>{signingIn ? "Pick up where you left off, inspect delivery, and keep your team moving." : "Bring participants, design, generation, and delivery into one dependable flow."}</p>
        <div className="auth-points">
          <span><LandingIcon name="check"/>Organization-isolated workspaces</span>
          <span><LandingIcon name="check"/>Durable certificate generation</span>
          <span><LandingIcon name="check"/>Inspectable email delivery</span>
        </div>
      </div>
      <div className="auth-story-note"><span className="auth-story-note-mark">N</span><div><b>Built for the work after the event</b><small>From roster to verified delivery.</small></div></div>
    </section>
    <section className="auth-form-side">
      <div className="auth-mobile-brand"><Image src="/nameframelogo.png" width={34} height={34} alt=""/><span>NameFrame</span></div>
      <div className="auth-form-wrap"><p className="eyebrow">{signingIn ? "Continue your work" : "Create your workspace"}</p><h2>{signingIn ? "Sign in" : "Create an account"}</h2><p>{signingIn ? "Your event workspace is waiting." : "Set up your certificate workspace in a few steps."}</p>{children}</div>
      <Link className="auth-back" href="/">← Back to home</Link>
    </section>
  </main>;
}

import { Show } from "@clerk/nextjs";
import Link from "next/link";

export function FinalCta() {
  return <section className="reference-cta"><i/><i/><div><p><span/>Start issuing certificates today</p><h2>Ready to automate your credential pipeline?</h2><span>Give your team one deliberate workflow for participant data, certificate generation, and delivery recovery.</span><div className="reference-cta-actions"><Show when="signed-out"><Link href="/sign-up">Create free certificate</Link></Show><Show when="signed-in"><Link href="/events/new">Create free certificate</Link></Show><Link href="/dashboard">View dashboard</Link></div><footer><span>• No credit card required</span><span>• Import CSV or Excel rosters</span><span>• Keep delivery history visible</span></footer></div></section>;
}

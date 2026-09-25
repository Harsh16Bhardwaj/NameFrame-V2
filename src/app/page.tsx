import { DesignerPreview } from "@/components/landing/designer-preview";
import { LandingFaq } from "@/components/landing/faq";
import { FinalCta } from "@/components/landing/final-cta";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHero } from "@/components/landing/hero";
import { Reliability } from "@/components/landing/reliability";
import { Stories } from "@/components/landing/stories";
import { Workflow } from "@/components/landing/workflow";

export default function HomePage() {
  return <main className="landing-page"><LandingHero/><Workflow/><DesignerPreview/><Reliability/><Stories/><LandingFaq/><FinalCta/><LandingFooter/></main>;
}

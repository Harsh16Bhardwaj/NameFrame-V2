import Link from "next/link";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { VerifyLookup } from "@/app/verify/verify-lookup";

export default function VerifyPage() {
  return <div className="verify-page landing-page"><LandingHeader/><main className="verify-main"><div className="verify-mark">✓</div><p className="verify-eyebrow">Public certificate verification</p><h1>Verify a certificate.</h1><p className="verify-lede">Enter the unique code included in the recipient&apos;s email to confirm that a certificate was issued by NameFrame.</p><VerifyLookup/><div className="verify-note"><strong>Where do I find the code?</strong><span>Look for the verification code and verification link in the certificate delivery email.</span></div><Link className="verify-home-link" href="/">Back to NameFrame</Link></main><LandingFooter/></div>;
}

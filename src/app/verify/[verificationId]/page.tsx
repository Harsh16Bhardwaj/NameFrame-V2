import Link from "next/link";
import Image from "next/image";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { verifyCertificate } from "@/lib/verification/service";

export default async function VerificationResultPage({ params }: { params: Promise<{ verificationId: string }> }) {
  const { verificationId } = await params;
  const result = await verifyCertificate(verificationId);
  return <div className="verify-page landing-page"><LandingHeader/><main className="verify-result-main">
    {result.status === "VERIFIED" ? <>
      <section className="verified-heading"><div className="verified-seal">✓</div><div><p className="verify-eyebrow">Authenticity confirmed</p><h1>Certificate verified.</h1><p>This certificate is an authentic NameFrame record.</p></div></section>
      <section className="verified-layout"><div className="verified-details"><p className="verify-eyebrow">Issued record</p><dl><div><dt>Participant</dt><dd>{result.certificate.participantName}</dd></div><div><dt>Event</dt><dd>{result.certificate.eventTitle}</dd></div><div><dt>Organization</dt><dd>{result.certificate.organizationName}</dd></div><div><dt>Issued</dt><dd>{result.certificate.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</dd></div></dl><div className="verified-code"><span>Verification code</span><code>{result.certificate.verificationId}</code></div><a className="verify-button verify-open" href={result.certificate.artifactUrl} target="_blank" rel="noreferrer">Open certificate ↗</a></div><div className="verified-certificate"><div className="verified-certificate-frame"><span className="certificate-corner top-left"/><span className="certificate-corner top-right"/><span className="certificate-corner bottom-left"/><span className="certificate-corner bottom-right"/><Image src={result.certificate.artifactUrl} alt={`Certificate for ${result.certificate.participantName}`} width={1200} height={850} unoptimized/></div><p>Issued certificate artwork</p></div></section>
    </> : <section className="verify-error-card"><div className="verify-error-mark">{result.status === "INTEGRITY_FAILED" ? "!" : "?"}</div><p className="verify-eyebrow">Verification unavailable</p><h1>{result.status === "INTEGRITY_FAILED" ? "Certificate verification failed." : "Certificate not found."}</h1><p>{result.status === "INTEGRITY_FAILED" ? "This certificate record could not be confirmed. Do not rely on it as an authentic certificate." : "We could not find a certificate with that verification code. Check the code in the email and try again."}</p><Link className="verify-button" href="/verify">Try another code</Link></section>}
  </main><LandingFooter/></div>;
}

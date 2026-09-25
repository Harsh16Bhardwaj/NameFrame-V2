"use client";

import { useState } from "react";

import { LandingIcon } from "@/components/landing/landing-icon";

const questions = [
  ["What makes NameFrame different from other certificate platforms?", "NameFrame keeps participant import, visual placement, asynchronous generation, delivery state, failure inspection, and retries in one organization-scoped event workspace."],
  ["Can I use my own certificate designs or templates?", "Yes. Upload PNG or JPEG artwork and place the participant name where it belongs using stable normalized coordinates."],
  ["What kind of events is NameFrame best for?", "It is designed for hackathons, workshops, college societies, training programs, and community events that issue certificates in bulk."],
  ["Can I send certificates directly by email?", "Yes. NameFrame routes deliveries through the configured provider and records pending, sent, retrying, and dead-letter states."],
  ["How are large participant lists handled?", "CSV and Excel imports are validated before persistence, capped at 10,000 rows, and written in bounded batches."],
  ["Is participant data separated between organizations?", "Yes. Event, participant, certificate, job, and delivery access is scoped through validated organization membership."],
  ["How does NameFrame prevent long names from breaking?", "The renderer reduces font size deterministically down to a safe minimum and fails visibly if the name still cannot fit."],
  ["What happens when generation or delivery fails?", "Failures preserve their reason and history. Eligible jobs and deliveries can be retried without silently discarding prior attempts."],
] as const;

export function LandingFaq() {
  const [open,setOpen]=useState<number|null>(null);
  return <section className="reference-section reference-faq" id="answers"><div className="reference-faq-grid"><div className="reference-faq-intro"><p>Knowledge base</p><h2>Questions &amp;<br/>Answers</h2><span>Everything you need to know about participant rosters, generation jobs, and certificate delivery.</span><div className="reference-quick"><small>Still figuring things out?</small><h3>Here is the quick version.</h3><ul><li><LandingIcon name="check" size={14}/>Bulk import via CSV and Excel</li><li><LandingIcon name="check" size={14}/>Visual placement on your artwork</li><li><LandingIcon name="check" size={14}/>Asynchronous certificate generation</li><li><LandingIcon name="check" size={14}/>Inspectable delivery recovery</li></ul><a href="mailto:support@nameframe.site">Contact support</a></div></div><div className="reference-faq-list">{questions.map(([question,answer],index)=>{const active=open===index;return <article className={active?"active":""} key={question}><button type="button" onClick={()=>setOpen(active?null:index)} aria-expanded={active}><span>{question}</span><LandingIcon name="chevron" size={15}/></button><div><p>{answer}</p></div></article>})}</div></div></section>;
}

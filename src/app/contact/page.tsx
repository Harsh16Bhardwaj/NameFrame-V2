"use client";

import Link from "next/link";
import { useState } from "react";

import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";

const caseTypes = ["UI feature", "Core feature", "Collaboration", "Found a bug", "Something can be better", "Other"];
const socialLinks = [
  ["Telegram", "https://t.me/nameframe"],
  ["Instagram", "https://instagram.com/nameframe"],
  ["LinkedIn", "https://linkedin.com/company/nameframe"],
  ["Email", "mailto:support@nameframe.site"],
] as const;

type FormState = { name: string; email: string; phone: string; caseType: string; message: string };
const emptyForm: FormState = { name: "", email: "", phone: "", caseType: "", message: "" };

export default function ContactPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  function update(name: keyof FormState, value: string) { setForm((current) => ({ ...current, [name]: value })); }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setResult(null);
    try {
      const response = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const payload = await response.json() as { success?: boolean; message?: string; error?: string };
      if (!response.ok || !payload.success) throw new Error(payload.error ?? "We could not send your message.");
      setResult({ success: true, message: payload.message ?? "Message sent. We’ll get back to you soon." }); setForm(emptyForm);
    } catch (error) { setResult({ success: false, message: error instanceof Error ? error.message : "We could not send your message." }); }
    finally { setPending(false); }
  }

  return <div className="contact-page landing-page">
    <LandingHeader />
    <main className="contact-main">
      <div className="contact-pattern" aria-hidden="true" />
      <header className="contact-intro"><p>Collaboration desk</p><h1>Want a feature?<em>Just ask.</em></h1><span>Tell us what would make NameFrame more useful for your events, your team, or the people receiving your certificates.</span></header>
      <div className="contact-grid">
        <section id="contact-form" className="contact-card contact-form-card"><p className="contact-kicker">Start a conversation</p><h2>Contact our team</h2><p className="contact-copy">Fill out the form below and we’ll get back to you within one working day.</p>
          <form onSubmit={submit} className="contact-form">
            <label>Your name<input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Your name" required maxLength={120}/></label>
            <label>Email address<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="you@example.com" required maxLength={254}/></label>
            <label>Phone number <small>optional</small><input type="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="+91 00000 00000" maxLength={30}/></label>
            <label>What can we help with?<select value={form.caseType} onChange={(event) => update("caseType", event.target.value)}><option value="">Select a topic</option>{caseTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>Your message<textarea value={form.message} onChange={(event) => update("message", event.target.value)} placeholder="Tell us about your request..." rows={6} required maxLength={5000}/></label>
            <button className="contact-submit" type="submit" disabled={pending}>{pending ? "Sending message…" : "Send message"}</button>
          </form>
          {result ? <p className={`contact-result ${result.success ? "success" : "error"}`} role={result.success ? "status" : "alert"}>{result.message}</p> : null}
        </section>
        <aside className="contact-card contact-connect-card"><p className="contact-kicker">Find your way in</p><h2>Connect with us</h2><p className="contact-copy">Reach out through a channel that works for you. We’re building NameFrame alongside the people who use it.</p>
          <div className="contact-constellation" aria-label="Contact channels"><span className="contact-orbit orbit-a"/><span className="contact-orbit orbit-b"/><strong>Connect</strong>{socialLinks.map(([label, href], index) => <a className={`contact-node node-${index + 1}`} href={href} key={label} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined} aria-label={label}>{label.slice(0, 1)}</a>)}</div>
          <div className="contact-office"><h3>Our office</h3><p>⌖ Delhi, India</p><p>◷ Mon–Fri · 11:00 AM–3:00 PM</p><p>✉ support@nameframe.site</p></div>
          <div className="contact-quick"><h3>Prefer a quick note?</h3><p>Use the form and choose Collaboration. We’ll route it to the right person.</p><Link href="#contact-form">Jump to the form →</Link></div>
        </aside>
      </div>
    </main>
    <LandingFooter />
  </div>;
}

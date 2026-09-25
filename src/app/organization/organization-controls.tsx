"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { AppIcon } from "@/components/app-icon";

type SmtpConfig = { id: string; label: string; host: string; port: number; username: string; fromName: string; fromEmail: string; secure: boolean; active: boolean; sendCount: number; sendLimit: number; rateLimitPerMinute: number };
type Member = { id: string; role: "GROUP_LEADER" | "GROUP_MEMBER"; createdAt: string; user: { id: string; name: string; email: string } };
type Invitation = { id: string; emailAddress: string; status: string; createdAt: number };
type SmtpForm = { label: string; host: string; port: string; username: string; password: string; fromName: string; fromEmail: string; secure: boolean; sendLimit: string; rateLimitPerMinute: string };

export function OrganizationControls({ initialSmtp, members, isLeader }: { initialSmtp: SmtpConfig | null; members: Member[]; isLeader: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState<SmtpForm>(() => ({ label: initialSmtp?.label ?? "Organization SMTP", host: initialSmtp?.host ?? "", port: String(initialSmtp?.port ?? 465), username: initialSmtp?.username ?? "", password: "", fromName: initialSmtp?.fromName ?? "", fromEmail: initialSmtp?.fromEmail ?? "", secure: initialSmtp?.secure ?? true, sendLimit: String(initialSmtp?.sendLimit ?? 10000), rateLimitPerMinute: String(initialSmtp?.rateLimitPerMinute ?? 30) }));
  const [smtpBusy, setSmtpBusy] = useState<"test" | "save" | "disable" | null>(null);
  const [smtpMessage, setSmtpMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLeader) return;
    let active = true;
    fetch("/api/organizations/invitations").then((response) => response.json()).then((payload) => { if (active && payload.success) setInvitations(payload.data); }).catch(() => { if (active) setInviteMessage("Invitations could not be loaded."); });
    return () => { active = false; };
  }, [isLeader]);

  function smtpPayload(includeBlankPassword = false) {
    return { ...form, port: Number(form.port), sendLimit: Number(form.sendLimit), rateLimitPerMinute: Number(form.rateLimitPerMinute), password: includeBlankPassword ? form.password : form.password || undefined };
  }

  async function testSmtp() {
    if (!form.password) return setSmtpMessage({ tone: "error", text: "Enter the SMTP password to test this connection." });
    setSmtpBusy("test"); setSmtpMessage(null);
    try { const response = await fetch("/api/organizations/smtp/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(smtpPayload(true)) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "Connection test failed."); setSmtpMessage({ tone: "success", text: "Connection verified successfully." }); }
    catch (error) { setSmtpMessage({ tone: "error", text: error instanceof Error ? error.message : "Connection test failed." }); }
    finally { setSmtpBusy(null); }
  }

  async function saveSmtp(event: React.FormEvent) {
    event.preventDefault(); setSmtpBusy("save"); setSmtpMessage(null);
    try { const response = await fetch(initialSmtp ? `/api/organizations/smtp/${initialSmtp.id}` : "/api/organizations/smtp", { method: initialSmtp ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(smtpPayload()) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "SMTP settings could not be saved."); setForm((current) => ({ ...current, password: "" })); setSmtpMessage({ tone: "success", text: "SMTP settings saved and activated." }); router.refresh(); }
    catch (error) { setSmtpMessage({ tone: "error", text: error instanceof Error ? error.message : "SMTP settings could not be saved." }); }
    finally { setSmtpBusy(null); }
  }

  async function disableSmtp() {
    if (!initialSmtp) return; setSmtpBusy("disable"); setSmtpMessage(null);
    try { const response = await fetch(`/api/organizations/smtp/${initialSmtp.id}`, { method: "DELETE" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "SMTP route could not be disabled."); setSmtpMessage({ tone: "success", text: "Organization SMTP disabled." }); router.refresh(); }
    catch (error) { setSmtpMessage({ tone: "error", text: error instanceof Error ? error.message : "SMTP route could not be disabled." }); }
    finally { setSmtpBusy(null); }
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault(); setInviteBusy(true); setInviteMessage(null);
    try { const response = await fetch("/api/organizations/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: inviteEmail }) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "Invitation could not be sent."); setInvitations((current) => [payload.data, ...current.filter((item) => item.id !== payload.data.id)]); setInviteEmail(""); setInviteMessage("Invitation email sent."); }
    catch (error) { setInviteMessage(error instanceof Error ? error.message : "Invitation could not be sent."); }
    finally { setInviteBusy(false); }
  }

  async function revoke(invitationId: string) {
    setInviteBusy(true); setInviteMessage(null);
    try { const response = await fetch(`/api/organizations/invitations/${invitationId}`, { method: "DELETE" }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error?.message ?? "Invitation could not be revoked."); setInvitations((current) => current.filter((item) => item.id !== invitationId)); setInviteMessage("Invitation revoked."); }
    catch (error) { setInviteMessage(error instanceof Error ? error.message : "Invitation could not be revoked."); }
    finally { setInviteBusy(false); }
  }

  return <div className="organization-control-grid">
    <section className="panel organization-team-panel"><div className="section-heading"><div><p className="eyebrow">Team access</p><h2>Members and invitations</h2><p className="section-copy">Invite teammates with member access to this organization.</p></div></div>{isLeader ? <form className="invite-form" onSubmit={invite}><label><AppIcon name="mail" size={17}/><input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="teammate@company.com" aria-label="Invitee email"/></label><button className="button button-primary" disabled={inviteBusy}>Send invite</button></form> : null}{inviteMessage ? <p className="control-feedback">{inviteMessage}</p> : null}<div className="member-list">{members.map((member) => <article key={member.id}><span className="member-avatar">{initials(member.user.name)}</span><div><strong>{member.user.name}</strong><small>{member.user.email}</small></div><span className="member-role">{member.role === "GROUP_LEADER" ? "Leader" : "Member"}</span></article>)}{invitations.map((invitation) => <article className="pending-invite" key={invitation.id}><span className="member-avatar"><AppIcon name="mail" size={15}/></span><div><strong>{invitation.emailAddress}</strong><small>Invitation pending</small></div><button type="button" disabled={inviteBusy} onClick={() => void revoke(invitation.id)}>Revoke</button></article>)}</div></section>
    {isLeader ? <section className="panel organization-smtp-panel"><div className="section-heading"><div><p className="eyebrow">Email delivery</p><h2>Organization SMTP</h2><p className="section-copy">Your active SMTP route is preferred before site and backup providers.</p></div>{initialSmtp?.active ? <span className="status-pill status-active">Active</span> : <span className="status-pill status-draft">Not configured</span>}</div><form className="smtp-form" onSubmit={saveSmtp}><label>Label<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })}/></label><label>SMTP host<input required value={form.host} onChange={(event) => setForm({ ...form, host: event.target.value })} placeholder="smtp.example.com"/></label><label>Port<input required type="number" min="1" max="65535" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })}/></label><label>Username<input required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })}/></label><label>Password<input required={!initialSmtp} type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={initialSmtp ? "Leave blank to keep current password" : "SMTP password"}/></label><label>From name<input required value={form.fromName} onChange={(event) => setForm({ ...form, fromName: event.target.value })}/></label><label>From email<input required type="email" value={form.fromEmail} onChange={(event) => setForm({ ...form, fromEmail: event.target.value })}/></label><label>Security<select value={form.secure ? "secure" : "starttls"} onChange={(event) => setForm({ ...form, secure: event.target.value === "secure" })}><option value="secure">TLS / SSL</option><option value="starttls">STARTTLS</option></select></label><label>Send limit<input required type="number" min="1" value={form.sendLimit} onChange={(event) => setForm({ ...form, sendLimit: event.target.value })}/></label><label>Per minute<input required type="number" min="1" value={form.rateLimitPerMinute} onChange={(event) => setForm({ ...form, rateLimitPerMinute: event.target.value })}/></label><div className="smtp-actions"><button className="button button-secondary" type="button" disabled={Boolean(smtpBusy)} onClick={() => void testSmtp()}>{smtpBusy === "test" ? "Testing…" : "Test connection"}</button><button className="button button-primary" disabled={Boolean(smtpBusy)}>{smtpBusy === "save" ? "Saving…" : "Save and activate"}</button>{initialSmtp?.active ? <button className="text-button danger-text" type="button" disabled={Boolean(smtpBusy)} onClick={() => void disableSmtp()}>Disable</button> : null}</div>{smtpMessage ? <p className={`control-feedback ${smtpMessage.tone}`}>{smtpMessage.text}</p> : null}</form></section> : null}
  </div>;
}

function initials(name: string) { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }

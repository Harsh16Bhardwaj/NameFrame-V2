import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const caseType = typeof body.caseType === "string" ? body.caseType.trim() : "General inquiry";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!name || name.length > 120 || !emailPattern.test(email) || email.length > 254 || !message || message.length > 5000) {
      return NextResponse.json({ success: false, error: "Please provide a valid name, email, and message." }, { status: 400 });
    }

    const host = process.env.SITE_SMTP_HOST;
    const user = process.env.SITE_SMTP_USERNAME;
    const password = process.env.SITE_SMTP_PASSWORD;
    const from = process.env.SITE_SMTP_FROM_EMAIL;
    const destination = process.env.CONTACT_EMAIL;
    if (!host || !user || !password || !from || !destination) {
      return NextResponse.json({ success: false, error: "Contact delivery is not configured yet. Please email support@nameframe.site directly." }, { status: 503 });
    }

    const transporter = nodemailer.createTransport({ host, port: Number(process.env.SITE_SMTP_PORT ?? 587), secure: process.env.SITE_SMTP_SECURE === "true", auth: { user, pass: password }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
    await transporter.sendMail({ from, to: destination, replyTo: email, subject: `[NameFrame contact] ${caseType}`, text: [`Name: ${name}`, `Email: ${email}`, phone ? `Phone: ${phone}` : "", `Topic: ${caseType}`, "", message].filter(Boolean).join("\n") });
    return NextResponse.json({ success: true, message: "Message sent. We’ll get back to you soon." });
  } catch (error) {
    console.error("Contact form delivery failed", { error: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ success: false, error: "We could not send your message right now. Please try again later." }, { status: 502 });
  }
}

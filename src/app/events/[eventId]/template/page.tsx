import { redirect } from "next/navigation";

export default async function LegacyEventTemplatePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}#event-template`);
}

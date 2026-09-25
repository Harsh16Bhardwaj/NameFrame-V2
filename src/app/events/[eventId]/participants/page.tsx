import { redirect } from "next/navigation";

export default async function LegacyEventParticipantsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  redirect(`/events/${eventId}#participants`);
}

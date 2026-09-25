import { redirect } from "next/navigation";

import { EventWorkspace } from "@/app/events/new/event-workspace";
import { AppShell } from "@/components/app-shell";
import { OrganizationRole } from "@/generated/prisma/enums";
import { getOrganizationActor } from "@/lib/auth/authorization";
import { ensureCurrentUser } from "@/lib/auth/user-sync";
import { getOrCreateDraft } from "@/lib/events/service";
import { eventViewModel } from "@/lib/events/view-model";

export default async function NewEventPage() {
  const user = await ensureCurrentUser();
  if (!user.organizationId) redirect("/organization/setup");
  const actor = await getOrganizationActor();
  if (actor.role !== OrganizationRole.GROUP_LEADER) redirect("/events");
  const draft = await getOrCreateDraft();

  return <AppShell className="creation-page"><EventWorkspace event={eventViewModel(draft)} /></AppShell>;
}

import { redirect } from "next/navigation";

import { OrganizationSetupForm } from "@/app/organization/setup/organization-setup-form";
import { ensureCurrentUser } from "@/lib/auth/user-sync";

export default async function OrganizationSetupPage() {
  const user = await ensureCurrentUser();
  if (user.organizationId) redirect("/dashboard");

  return (
    <main className="centered-shell">
      <section className="panel compact-panel">
        <p className="eyebrow">Organization setup</p>
        <h1>Create your Sertify workspace</h1>
        <p className="muted-copy">Add the organization identity used automatically on every event. You become its sole group leader.</p>
        <OrganizationSetupForm />
      </section>
    </main>
  );
}

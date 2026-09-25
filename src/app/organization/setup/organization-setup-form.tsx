"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OrganizationSetupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/organizations", { method: "POST", body: formData });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Organization setup failed.");
      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Organization setup failed.");
      setPending(false);
    }
  }

  return (
    <form action={submit} className="form-stack">
      <label className="field-label" htmlFor="organization-name">Organization name</label>
      <input className="text-input" id="organization-name" name="name" minLength={2} maxLength={120} required />
      <label className="field-label" htmlFor="organization-logo">Organization logo</label>
      <input className="file-input" id="organization-logo" name="logo" type="file" accept="image/png,image/jpeg" required />
      <p className="field-help">PNG or JPEG, up to 10 MB.</p>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <button className="button button-primary" disabled={pending} type="submit">
        {pending ? "Uploading and creating…" : "Create organization"}
      </button>
    </form>
  );
}

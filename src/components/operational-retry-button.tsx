"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function OperationalRetryButton({ endpoint, confirmation, label = "Retry" }: { endpoint: string; confirmation: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function retry() {
    if (!window.confirm(confirmation)) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const payload = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(payload.error?.message || "The retry could not be started.");
      router.refresh();
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "The retry could not be started.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="retry-control">
      <button className="button button-secondary button-small" type="button" disabled={pending} onClick={retry}>
        {pending ? "Retrying..." : label}
      </button>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </div>
  );
}

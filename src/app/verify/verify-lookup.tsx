"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function VerifyLookup() {
  const router = useRouter();
  const [code, setCode] = useState("");
  return <form className="verify-lookup-form" onSubmit={(event) => { event.preventDefault(); const value = code.trim(); if (value) router.push(`/verify/${encodeURIComponent(value)}`); }}>
    <label htmlFor="verification-code">Verification code</label>
    <div><input id="verification-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="Paste the certificate code" autoComplete="off" required/><button className="verify-button" type="submit">Verify certificate</button></div>
  </form>;
}

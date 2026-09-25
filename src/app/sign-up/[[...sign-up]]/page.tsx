import { SignUp } from "@clerk/nextjs";

import { AuthPageShell } from "@/components/auth-page-shell";

const appearance = { elements: { rootBox: "auth-clerk-root", cardBox: "auth-clerk-card-box", card: "auth-clerk-card", header: "auth-clerk-hidden", socialButtonsBlockButton: "auth-clerk-social", formFieldInput: "auth-clerk-input", formButtonPrimary: "auth-clerk-primary", footer: "auth-clerk-footer" } };

export default function SignUpPage() {
  return <AuthPageShell mode="sign-up"><SignUp appearance={appearance} /></AuthPageShell>;
}

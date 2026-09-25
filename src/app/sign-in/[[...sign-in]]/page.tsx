import { SignIn } from "@clerk/nextjs";

import { AuthPageShell } from "@/components/auth-page-shell";

const appearance = { elements: { rootBox: "auth-clerk-root", cardBox: "auth-clerk-card-box", card: "auth-clerk-card", header: "auth-clerk-hidden", socialButtonsBlockButton: "auth-clerk-social", formFieldInput: "auth-clerk-input", formButtonPrimary: "auth-clerk-primary", footer: "auth-clerk-footer" } };

export default function SignInPage() {
  return <AuthPageShell mode="sign-in"><SignIn appearance={appearance} /></AuthPageShell>;
}

import { SignIn } from "@clerk/nextjs";

import { AuthPageShell } from "@/components/auth-page-shell";

const appearance = { variables: { colorPrimary: "#1d1612", colorText: "#1d1612", colorTextSecondary: "#756960", colorBackground: "#fffdf9", colorInputBackground: "#fffdf9", colorInputText: "#1d1612", borderRadius: "8px", fontFamily: "Inter, sans-serif" }, elements: { rootBox: "auth-clerk-root", cardBox: "auth-clerk-card-box", card: "auth-clerk-card", header: "auth-clerk-hidden", socialButtonsBlockButton: "auth-clerk-social", socialButtonsBlockButtonText: "auth-clerk-social-text", formFieldLabel: "auth-clerk-label", formFieldInput: "auth-clerk-input", formButtonPrimary: "auth-clerk-primary", footer: "auth-clerk-footer", footerActionLink: "auth-clerk-link", dividerLine: "auth-clerk-divider", dividerText: "auth-clerk-divider-text" } };

export default function SignInPage() {
  return <AuthPageShell mode="sign-in"><SignIn appearance={appearance} /></AuthPageShell>;
}

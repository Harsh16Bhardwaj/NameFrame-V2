import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { EB_Garamond, Inter, JetBrains_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";

import "./styles.css";

const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans" });
const garamond = EB_Garamond({ subsets: ["latin"], variable: "--font-editorial" });
const outfit = Outfit({ subsets: ["latin"], variable: "--font-app-display" });
const inter = Inter({ subsets: ["latin"], variable: "--font-app-sans" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-app-mono" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "NameFrame : Onestop Post Event Certification Solution",
  description: "NameFrame is an end-to-end post-event certification solution for creating, personalizing, verifying, and delivering certificates at scale.",
  applicationName: "NameFrame",
  keywords: ["event certificates", "certificate automation", "post-event certification", "bulk certificate generation", "certificate verification", "certificate delivery"],
  authors: [{ name: "NameFrame" }],
  creator: "NameFrame",
  publisher: "NameFrame",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "NameFrame",
    title: "NameFrame : Onestop Post Event Certification Solution",
    description: "Create, verify, and deliver polished event certificates from one dependable workspace.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "NameFrame : Onestop Post Event Certification Solution",
    description: "The dependable post-event certification workspace for modern event teams.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${garamond.variable} ${outfit.variable} ${inter.variable} ${jetbrains.variable}`}>
        <ClerkProvider>{children}</ClerkProvider>
      </body>
    </html>
  );
}

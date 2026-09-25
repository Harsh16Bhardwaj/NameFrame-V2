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
  title: "NameFrame — Certificates, without the chaos",
  description: "Create, personalize, send, and track event certificates from one reliable workspace.",
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

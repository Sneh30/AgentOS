import type { Metadata } from "next";
import { Poppins, Playfair_Display, JetBrains_Mono } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anymind — Personal Agent OS",
  description: "Your AI-powered personal agent that executes tasks across apps with persistent memory.",
  keywords: ["agent", "AI", "automation", "personal assistant", "memory"],
  authors: [{ name: "Anymind" }],
  openGraph: {
    title: "Anymind — Personal Agent OS",
    description: "Your AI-powered personal agent that executes tasks across apps with persistent memory.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html
        lang="en"
        suppressHydrationWarning
        data-scroll-behavior="smooth"
        className={`${poppins.variable} ${playfairDisplay.variable} ${jetbrainsMono.variable}`}
      >
        <body className="min-h-screen antialiased" suppressHydrationWarning={true}>
          <AppShell>{children}</AppShell>
        </body>
      </html>
    </ClerkProvider>
  );
}

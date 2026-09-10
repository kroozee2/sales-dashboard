import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar, BottomNav } from "@/components/sidebar";
import { ActivityTracker } from "@/components/activity-tracker";
import { AIAssistant } from "@/components/AIAssistant";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "7-Figure CEO AI Command Center",
  description: "Close more deals through DMs and calls. Leads, scripts, revenue, and your AI team in one place.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Command Center", statusBarStyle: "black-translucent" },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#09090b",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="min-h-screen bg-zinc-950 text-foreground antialiased font-sans lg:flex">
        <ActivityTracker />
        <Suspense fallback={null}>
          <Sidebar />
        </Suspense>
        <main className="flex-1 min-w-0">
          <div className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 py-6 sm:py-8 pb-28 lg:pb-8">{children}</div>
        </main>
        <AIAssistant />
        <BottomNav />
      </body>
    </html>
  );
}

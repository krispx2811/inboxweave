import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { ToastProvider } from "@/components/Toast";


const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";

export const metadata: Metadata = {
  title: {
    default: "InboxWeave — AI Auto-Replies for Instagram DMs in Oman",
    template: "%s | InboxWeave",
  },
  description:
    "AI that answers your Instagram DMs in Arabic and English from your own price list and offers, with a shared team inbox. 30 OMR/month.",
  keywords: [
    "AI customer support",
    "Instagram business AI",
    "Instagram DM automation",
    "Instagram auto reply",
    "AI inbox",
    "customer messaging platform",
    "Instagram chatbot Oman",
    "AI customer service Oman",
    "Instagram DM auto reply Arabic",
    "رد آلي انستقرام",
    "شات بوت انستقرام عمان",
    "multi-channel inbox",
    "AI auto reply",
    "customer support automation",
    "helpdesk software",
    "AI chatbot",
    "conversational AI",
    "BYOK OpenAI",
    "GCC customer support software",
  ],
  authors: [{ name: "InboxWeave" }],
  creator: "InboxWeave",
  publisher: "InboxWeave",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteUrl,
    siteName: "InboxWeave",
    title: "InboxWeave — AI Auto-Replies for Instagram DMs",
    description:
      "AI that answers your customers' Instagram DMs in Arabic and English, from your own price list and offers. 30 OMR/month, no setup fee.",
    // Image comes from app/opengraph-image.tsx.
  },
  twitter: {
    card: "summary_large_image",
    title: "InboxWeave — AI Auto-Replies for Instagram DMs",
    description:
      "AI replies to your Instagram DMs in Arabic and English. 30 OMR/month, no setup fee.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "InboxWeave",
  },
  category: "technology",
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {process.env.NEXT_PUBLIC_ADSENSE_ID && (
          <script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_ID}`}
            crossOrigin="anonymous"
          />
        )}
      </head>
      <body className="min-h-full antialiased bg-white text-slate-900">
        <ToastProvider>
          {children}
        </ToastProvider>
        <PwaRegistrar />
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { ToastProvider } from "@/components/Toast";


const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";

export const metadata: Metadata = {
  title: {
    default: "InboxWeave — AI Auto-Replies for WhatsApp, Instagram & Messenger in Oman",
    template: "%s | InboxWeave",
  },
  description:
    "AI that answers your WhatsApp, Instagram and Messenger customers in Arabic and English from your own price list and offers, with a shared team inbox. 30 OMR/month.",
  keywords: [
    "AI customer support",
    "WhatsApp business AI",
    "Instagram DM automation",
    "Facebook Messenger bot",
    "AI inbox",
    "customer messaging platform",
    "WhatsApp chatbot Oman",
    "AI customer service Oman",
    "WhatsApp auto reply Arabic",
    "رد آلي واتساب",
    "شات بوت واتساب عمان",
    "multi-channel inbox",
    "AI auto reply",
    "WhatsApp Cloud API",
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
    title: "InboxWeave — AI Auto-Replies for WhatsApp, Instagram & Messenger",
    description:
      "AI that answers your customers on WhatsApp, Instagram and Messenger in Arabic and English, from your own price list and offers. 30 OMR/month, no setup fee.",
    // Image comes from app/opengraph-image.tsx.
  },
  twitter: {
    card: "summary_large_image",
    title: "InboxWeave — AI Auto-Replies for WhatsApp, Instagram & Messenger",
    description:
      "AI customer replies in Arabic and English for WhatsApp, Instagram and Messenger. 30 OMR/month, no setup fee.",
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

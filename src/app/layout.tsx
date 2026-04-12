import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { ToastProvider } from "@/components/Toast";


const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";

export const metadata: Metadata = {
  title: {
    default: "InboxWeave — Free AI-Powered Customer Messaging for WhatsApp, Instagram & Messenger",
    template: "%s | InboxWeave",
  },
  description:
    "Connect WhatsApp, Instagram, Messenger, SMS, and Email to one free AI-powered inbox. Auto-reply with GPT-4o, upload your knowledge base, track analytics, and hand off to humans when it matters. 100% free, forever.",
  keywords: [
    "AI customer support",
    "WhatsApp business AI",
    "Instagram DM automation",
    "Facebook Messenger bot",
    "AI inbox",
    "free customer messaging",
    "GPT-4o customer support",
    "multi-channel inbox",
    "AI auto reply",
    "WhatsApp Cloud API",
    "customer support automation",
    "free helpdesk",
    "AI chatbot",
    "conversational AI",
    "BYOK OpenAI",
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
    title: "InboxWeave — Free AI-Powered Customer Messaging",
    description:
      "Connect WhatsApp, Instagram, Messenger, SMS & Email to one free AI inbox. GPT-4o auto-replies, knowledge base RAG, sentiment analysis, and team collaboration. No credit card, forever free.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "InboxWeave — Free AI-Powered Customer Messaging Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "InboxWeave — Free AI-Powered Customer Messaging",
    description:
      "One free inbox for WhatsApp, Instagram, Messenger, SMS & Email. AI auto-replies with GPT-4o, knowledge base, analytics, and team tools.",
    images: [`${siteUrl}/og-image.png`],
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

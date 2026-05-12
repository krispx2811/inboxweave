import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PwaRegistrar } from "@/components/PwaRegistrar";
import { ToastProvider } from "@/components/Toast";


const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://inboxweave.com";

export const metadata: Metadata = {
  title: {
    default: "InboxWeave — AI-Powered Customer Messaging for WhatsApp, Instagram & Messenger",
    template: "%s | InboxWeave",
  },
  description:
    "Connect WhatsApp, Instagram, Messenger, SMS, and Email to one AI-powered inbox. Auto-reply with GPT-4o, upload your knowledge base, track analytics, and hand off to humans when it matters. 300 OMR one-time setup.",
  keywords: [
    "AI customer support",
    "WhatsApp business AI",
    "Instagram DM automation",
    "Facebook Messenger bot",
    "AI inbox",
    "customer messaging platform",
    "GPT-4o customer support",
    "multi-channel inbox",
    "AI auto reply",
    "WhatsApp Cloud API",
    "customer support automation",
    "helpdesk software",
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
    title: "InboxWeave — AI-Powered Customer Messaging",
    description:
      "Connect WhatsApp, Instagram, Messenger, SMS & Email to one AI inbox. GPT-4o auto-replies, knowledge base RAG, sentiment analysis, and team collaboration. 300 OMR one-time setup, no subscriptions.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "InboxWeave — AI-Powered Customer Messaging Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "InboxWeave — AI-Powered Customer Messaging",
    description:
      "One inbox for WhatsApp, Instagram, Messenger, SMS & Email. AI auto-replies with GPT-4o, knowledge base, analytics, and team tools. 300 OMR one-time setup.",
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

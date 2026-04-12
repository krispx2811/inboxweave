import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to your InboxWeave account to manage customer conversations across WhatsApp, Instagram, Messenger, SMS, and Email.",
  robots: { index: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}

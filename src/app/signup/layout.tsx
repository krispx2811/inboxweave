import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign Up Free",
  description: "Create your free InboxWeave account. Connect WhatsApp, Instagram, and Messenger to one AI-powered inbox. No credit card required.",
  alternates: { canonical: "/signup" },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}

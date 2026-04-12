import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { LogoFull } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "InboxWeave Terms of Service. Read about acceptable use, BYOK API keys, AI-generated content, data handling, and your responsibilities.",
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
        <Link href="/"><LogoFull /></Link>
        <Link href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
          <IconArrowLeft className="h-3 w-3" /> Back
        </Link>
      </nav>

      <main className="mx-auto max-w-3xl px-6 pb-20">
        <div className="mb-10">
          <h1 className="text-3xl font-extrabold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: April 2026</p>
        </div>

        <article className="prose prose-slate prose-sm max-w-none [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:text-slate-600 [&_p]:leading-relaxed [&_ul]:text-slate-600 [&_li]:mb-1">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using InboxWeave (&ldquo;the Service&rdquo;), you agree to be bound by these Terms of Service. If you are using the Service on behalf of an organization, you represent that you have the authority to bind that organization to these terms.
          </p>

          <h2>2. Description of Service</h2>
          <p>
            InboxWeave is a multi-channel messaging platform that uses artificial intelligence to assist organizations in managing customer conversations across WhatsApp, Instagram, Facebook Messenger, SMS, and Email. The Service includes AI-powered auto-replies, knowledge base retrieval, conversation analytics, and team collaboration tools.
          </p>

          <h2>3. Accounts and Organizations</h2>
          <p>
            You are responsible for maintaining the security of your account credentials. Each organization is an independent tenant with its own data, users, and configuration. You must not share API keys or access tokens with unauthorized parties.
          </p>

          <h2>4. Bring Your Own Key (BYOK)</h2>
          <p>
            The Service requires you to provide your own OpenAI API key. Your key is encrypted at rest using AES-256-GCM and is never stored in plaintext. You are responsible for any charges incurred on your OpenAI account through the Service. We do not have access to your decrypted API key outside of the runtime processing of your messages.
          </p>

          <h2>5. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service to send spam, unsolicited messages, or bulk marketing without consent</li>
            <li>Violate the terms of the underlying messaging platforms (Meta, Twilio, etc.)</li>
            <li>Attempt to reverse-engineer, decompile, or extract source code from the Service</li>
            <li>Use the Service for any illegal purpose or to transmit harmful content</li>
            <li>Exceed the messaging windows imposed by platforms (e.g., WhatsApp 24-hour window)</li>
          </ul>

          <h2>6. Data and Privacy</h2>
          <p>
            Your organization&apos;s data (messages, contacts, knowledge base documents) is stored in your Supabase project and is isolated from other organizations via Row Level Security. We process data only to provide the Service. See our <Link href="/privacy" className="text-indigo-600 hover:underline">Privacy Policy</Link> for details.
          </p>

          <h2>7. AI-Generated Content</h2>
          <p>
            AI-generated replies are produced by third-party models (OpenAI GPT). While we strive for accuracy through knowledge base retrieval and system prompts, AI responses may occasionally be incorrect, incomplete, or inappropriate. You are responsible for monitoring AI output and configuring appropriate escalation rules.
          </p>

          <h2>8. Service Availability</h2>
          <p>
            We aim for high availability but do not guarantee uninterrupted service. The Service depends on third-party infrastructure (Supabase, Vercel, OpenAI, Meta APIs) and their respective availability. We will provide reasonable notice of planned maintenance.
          </p>

          <h2>9. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by law, InboxWeave shall not be liable for any indirect, incidental, special, or consequential damages, including loss of revenue, data, or business opportunities, arising from your use of the Service.
          </p>

          <h2>10. Termination</h2>
          <p>
            You may delete your organization and all associated data at any time. We reserve the right to suspend or terminate accounts that violate these terms. Upon termination, your data will be deleted within 30 days unless a legal hold applies.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We may update these terms from time to time. Material changes will be communicated via the Service. Continued use after changes constitutes acceptance.
          </p>

          <h2>12. Governing Law</h2>
          <p>
            These terms are governed by the laws of the jurisdiction in which the Service operator is established, without regard to conflict of law provisions.
          </p>
        </article>
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { LogoFull } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "InboxWeave Privacy Policy. Learn how we handle your data, encryption, GDPR rights, third-party integrations, and cookie usage.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
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
          <h1 className="text-3xl font-extrabold tracking-tight">Privacy Policy</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: April 2026</p>
        </div>

        <article className="prose prose-slate prose-sm max-w-none [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:text-slate-600 [&_p]:leading-relaxed [&_ul]:text-slate-600 [&_li]:mb-1">
          <h2>1. What We Collect</h2>
          <p>We collect and process the following data to provide the Service:</p>
          <ul>
            <li><strong>Account data:</strong> email address and hashed password for authentication</li>
            <li><strong>Organization data:</strong> organization name, member list, roles</li>
            <li><strong>Message data:</strong> inbound and outbound messages processed through connected channels, including text content, timestamps, and platform metadata</li>
            <li><strong>Contact data:</strong> phone numbers, social media IDs, and display names of people who message your organization</li>
            <li><strong>Knowledge base:</strong> documents you upload for AI retrieval (PDFs, text files)</li>
            <li><strong>Usage data:</strong> API token consumption, feature usage, analytics aggregates</li>
          </ul>

          <h2>2. How We Use Your Data</h2>
          <ul>
            <li>To process and deliver messages between your organization and your customers</li>
            <li>To generate AI replies using your configured system prompt and knowledge base</li>
            <li>To provide analytics, sentiment analysis, and conversation insights</li>
            <li>To send notifications about new messages or escalations</li>
            <li>To improve Service reliability and performance (aggregated, anonymized data only)</li>
          </ul>

          <h2>3. Data Storage and Security</h2>
          <p>All data is stored in your organization&apos;s Supabase project with the following protections:</p>
          <ul>
            <li><strong>Row Level Security (RLS):</strong> every database table is locked down so users can only access data belonging to their organization</li>
            <li><strong>Encryption at rest:</strong> API keys (OpenAI, Meta, Twilio) are encrypted using AES-256-GCM before storage. The encryption key is stored separately from the database</li>
            <li><strong>Encryption in transit:</strong> all connections use TLS 1.2+</li>
            <li><strong>Optional conversation encryption:</strong> per-conversation AES-256-GCM encryption with derived keys for sensitive industries</li>
            <li><strong>Webhook signature verification:</strong> all inbound webhooks from Meta are verified via HMAC-SHA256</li>
          </ul>

          <h2>4. Third-Party Services</h2>
          <p>The Service integrates with the following third-party providers. Your data may be processed by them according to their respective privacy policies:</p>
          <ul>
            <li><strong>Supabase:</strong> database hosting, authentication, file storage</li>
            <li><strong>OpenAI:</strong> AI reply generation and embeddings (using your BYOK API key)</li>
            <li><strong>Meta (WhatsApp, Instagram, Messenger):</strong> message delivery</li>
            <li><strong>Twilio:</strong> SMS delivery (if configured)</li>
            <li><strong>Vercel:</strong> application hosting</li>
          </ul>

          <h2>5. Data Retention</h2>
          <p>
            Message data is retained for as long as your organization exists on the platform. You can delete individual contacts and their messages at any time using the GDPR tools in your organization settings. When an organization is deleted, all associated data is permanently removed within 30 days.
          </p>

          <h2>6. Your Rights (GDPR)</h2>
          <p>If you or your contacts are in the EU/EEA, you have the right to:</p>
          <ul>
            <li><strong>Access:</strong> request a copy of all data we hold about a contact</li>
            <li><strong>Rectification:</strong> correct inaccurate personal data</li>
            <li><strong>Erasure:</strong> request deletion of a contact&apos;s data (right to be forgotten)</li>
            <li><strong>Portability:</strong> export data in CSV format</li>
            <li><strong>Restriction:</strong> limit how we process specific data</li>
          </ul>
          <p>
            These rights can be exercised through the GDPR tools at <code className="text-xs rounded bg-slate-100 px-1.5 py-0.5">Settings &rarr; GDPR &amp; Privacy</code> in your organization dashboard. Export and deletion requests are processed immediately.
          </p>

          <h2>7. Cookies</h2>
          <p>
            We use essential cookies only for authentication session management (Supabase Auth). We do not use tracking cookies, analytics cookies, or advertising cookies.
          </p>

          <h2>8. Children&apos;s Privacy</h2>
          <p>
            The Service is not directed at individuals under 16. We do not knowingly collect personal data from children.
          </p>

          <h2>9. Changes to This Policy</h2>
          <p>
            We may update this policy to reflect changes in our practices or legal requirements. We will notify you of material changes via the Service.
          </p>

          <h2>10. Contact</h2>
          <p>
            For privacy-related questions or requests, contact the platform administrator of your organization or reach out to us through the support channels listed in your dashboard.
          </p>
        </article>
      </main>
    </div>
  );
}

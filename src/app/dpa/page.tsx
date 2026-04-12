import type { Metadata } from "next";
import Link from "next/link";
import { IconArrowLeft } from "@/components/icons";
import { LogoFull } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description: "InboxWeave DPA. Details on data processing, sub-processors (Supabase, OpenAI, Meta, Twilio, Vercel), security measures, and GDPR compliance.",
  alternates: { canonical: "/dpa" },
};

export default function DpaPage() {
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
          <h1 className="text-3xl font-extrabold tracking-tight">Data Processing Agreement</h1>
          <p className="mt-2 text-sm text-slate-500">Last updated: April 2026</p>
        </div>

        <article className="prose prose-slate prose-sm max-w-none [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:text-slate-600 [&_p]:leading-relaxed [&_ul]:text-slate-600 [&_li]:mb-1">
          <h2>1. Scope and Purpose</h2>
          <p>
            This Data Processing Agreement (&ldquo;DPA&rdquo;) supplements the <Link href="/terms" className="text-indigo-600 hover:underline">Terms of Service</Link> and governs the processing of personal data by InboxWeave (&ldquo;Processor&rdquo;) on behalf of the organization using the Service (&ldquo;Controller&rdquo;).
          </p>

          <h2>2. Definitions</h2>
          <ul>
            <li><strong>Personal Data:</strong> any information relating to an identified or identifiable natural person, including customer phone numbers, names, message content, and email addresses processed through the Service</li>
            <li><strong>Processing:</strong> any operation performed on personal data, including collection, storage, retrieval, AI analysis, and deletion</li>
            <li><strong>Sub-processor:</strong> any third party engaged by the Processor to process personal data</li>
          </ul>

          <h2>3. Processing Details</h2>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 my-4 not-prose">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div>
                <div className="font-bold text-slate-700 mb-1">Subject matter</div>
                <div className="text-slate-500">Customer messaging and AI-assisted support</div>
              </div>
              <div>
                <div className="font-bold text-slate-700 mb-1">Duration</div>
                <div className="text-slate-500">For the term of the Service agreement</div>
              </div>
              <div>
                <div className="font-bold text-slate-700 mb-1">Categories of data</div>
                <div className="text-slate-500">Names, phone numbers, email addresses, message content, platform IDs</div>
              </div>
              <div>
                <div className="font-bold text-slate-700 mb-1">Data subjects</div>
                <div className="text-slate-500">End users who message the Controller&apos;s connected channels</div>
              </div>
            </div>
          </div>

          <h2>4. Obligations of the Processor</h2>
          <p>InboxWeave shall:</p>
          <ul>
            <li>Process personal data only on documented instructions from the Controller</li>
            <li>Ensure that persons authorized to process data are bound by confidentiality</li>
            <li>Implement appropriate technical and organizational security measures (encryption at rest, RLS, TLS, webhook signature verification)</li>
            <li>Assist the Controller in responding to data subject requests (via the GDPR tools)</li>
            <li>Delete or return all personal data upon termination of the Service</li>
            <li>Make available all information necessary to demonstrate compliance</li>
          </ul>

          <h2>5. Sub-processors</h2>
          <p>The following sub-processors are authorized:</p>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 my-4 not-prose">
            <div className="space-y-3 text-xs">
              {[
                { name: "Supabase Inc.", purpose: "Database, auth, storage, realtime", location: "US / EU" },
                { name: "OpenAI", purpose: "AI inference (via Controller's BYOK key)", location: "US" },
                { name: "Meta Platforms", purpose: "WhatsApp, Instagram, Messenger delivery", location: "US / EU" },
                { name: "Twilio Inc.", purpose: "SMS delivery (if configured)", location: "US" },
                { name: "Vercel Inc.", purpose: "Application hosting", location: "US / EU" },
              ].map(({ name, purpose, location }) => (
                <div key={name} className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-700">{name}</div>
                    <div className="text-slate-500">{purpose}</div>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{location}</span>
                </div>
              ))}
            </div>
          </div>
          <p>
            The Controller will be notified of any changes to the sub-processor list. The Controller may object to a new sub-processor within 14 days of notification.
          </p>

          <h2>6. International Transfers</h2>
          <p>
            Where personal data is transferred outside the EU/EEA, appropriate safeguards are in place, including Standard Contractual Clauses (SCCs) with each sub-processor. The Controller&apos;s choice of Supabase region determines the primary data storage location.
          </p>

          <h2>7. Security Measures</h2>
          <ul>
            <li>AES-256-GCM encryption for API keys and access tokens at rest</li>
            <li>Optional per-conversation AES-256-GCM encryption for message content</li>
            <li>Row Level Security isolating each organization&apos;s data</li>
            <li>HMAC-SHA256 webhook signature verification</li>
            <li>TLS 1.2+ for all data in transit</li>
            <li>Access logging via the audit_logs table</li>
            <li>Principle of least privilege: service-role access only in server-side code</li>
          </ul>

          <h2>8. Data Breach Notification</h2>
          <p>
            In the event of a personal data breach, InboxWeave will notify the Controller without undue delay and no later than 72 hours after becoming aware of the breach, providing details of the nature, scope, and recommended mitigation measures.
          </p>

          <h2>9. Audits</h2>
          <p>
            The Controller may audit the Processor&apos;s compliance with this DPA upon reasonable notice. The Processor will cooperate and provide necessary access to information and systems.
          </p>

          <h2>10. Term and Termination</h2>
          <p>
            This DPA remains in effect for the duration of the Service agreement. Upon termination, all personal data will be deleted within 30 days unless retention is required by law. The Controller may request a data export before termination.
          </p>
        </article>
      </main>
    </div>
  );
}

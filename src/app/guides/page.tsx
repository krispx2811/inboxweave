import type { Metadata } from "next";
import Link from "next/link";
import { IconSparkle, IconArrowLeft, IconWhatsApp, IconFacebook, IconInstagram } from "@/components/icons";
import { LogoFull } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Setup Guides — Connect WhatsApp, Instagram, Messenger, SMS & Email",
  description: "Step-by-step tutorials for connecting WhatsApp Business Cloud API, Instagram DMs, Facebook Messenger, Twilio SMS, and Email to InboxWeave. Free AI-powered customer messaging.",
  alternates: { canonical: "/guides" },
};

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{n}</div>
      <div className="text-sm text-slate-600 leading-relaxed pt-0.5">{children}</div>
    </div>
  );
}

export default function GuidesPage() {
  return (
    <div className="min-h-screen bg-white">
      <nav className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
        <Link href="/"><LogoFull /></Link>
        <Link href="/" className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
          <IconArrowLeft className="h-3 w-3" /> Home
        </Link>
      </nav>

      <main className="mx-auto max-w-4xl px-6 pb-20">
        <div className="mb-12 text-center">
          <h1 className="text-3xl font-extrabold tracking-tight">Setup Guides</h1>
          <p className="mt-3 text-slate-500 max-w-lg mx-auto">
            Step-by-step instructions to connect each messaging channel to InboxWeave. Most take under 10 minutes.
          </p>
        </div>

        {/* ── WhatsApp ─────────────────────────────────────────── */}
        <section id="whatsapp" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
              <IconWhatsApp className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">WhatsApp Business Cloud API</h2>
              <p className="text-sm text-slate-500">Free tier available &middot; ~15 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <strong>Prerequisites:</strong> A Meta Business account and a phone number that isn&apos;t already registered with WhatsApp.
            </div>

            <Step n={1}>
              <strong>Create a Meta Business account.</strong> Go to{" "}
              <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">business.facebook.com</span> and sign up or log in. Complete business verification if prompted.
            </Step>

            <Step n={2}>
              <strong>Create a Meta App.</strong> Go to{" "}
              <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">developers.facebook.com/apps</span> &rarr; <strong>Create App</strong> &rarr; select <strong>Business</strong> type &rarr; give it a name (e.g. &ldquo;InboxWeave&rdquo;).
            </Step>

            <Step n={3}>
              <strong>Add WhatsApp product.</strong> In your app dashboard, click <strong>Add Product</strong> &rarr; find <strong>WhatsApp</strong> &rarr; click <strong>Set Up</strong>. Select your Meta Business account when prompted.
            </Step>

            <Step n={4}>
              <strong>Get your Phone Number ID.</strong> In the WhatsApp section &rarr; <strong>API Setup</strong>, you&apos;ll see a test phone number. Copy the <strong>Phone number ID</strong> (a numeric string like <code className="text-xs bg-slate-100 rounded px-1">123456789012345</code>).
            </Step>

            <Step n={5}>
              <strong>Generate a permanent access token.</strong> Go to <strong>Business Settings</strong> &rarr; <strong>System Users</strong> &rarr; create a system user with <strong>Admin</strong> role &rarr; click <strong>Generate Token</strong> &rarr; select your app &rarr; check the <code className="text-xs bg-slate-100 rounded px-1">whatsapp_business_messaging</code> and <code className="text-xs bg-slate-100 rounded px-1">whatsapp_business_management</code> permissions &rarr; generate. <strong>Copy the token</strong> &mdash; you won&apos;t see it again.
            </Step>

            <Step n={6}>
              <strong>Configure the webhook.</strong> In your app &rarr; WhatsApp &rarr; <strong>Configuration</strong>:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Callback URL: <code className="text-xs bg-slate-100 rounded px-1">https://your-domain.com/api/webhooks/whatsapp</code></li>
                <li>Verify token: the value of <code className="text-xs bg-slate-100 rounded px-1">META_WEBHOOK_VERIFY_TOKEN</code> in your env</li>
                <li>Subscribe to: <strong>messages</strong></li>
              </ul>
            </Step>

            <Step n={7}>
              <strong>Paste into InboxWeave.</strong> Go to your org &rarr; <strong>Channels</strong> &rarr; enter the display name, Phone Number ID, and access token. Click <strong>Connect WhatsApp</strong>. Done!
            </Step>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <strong>Test it:</strong> Send a WhatsApp message to your business number. It should appear in your InboxWeave within seconds and get an AI reply.
            </div>
          </div>
        </section>

        {/* ── Instagram + Messenger ────────────────────────────── */}
        <section id="instagram-messenger" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex gap-2">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-pink-100">
                <IconInstagram className="h-6 w-6 text-pink-600" />
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-100">
                <IconFacebook className="h-6 w-6 text-blue-600" />
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold">Instagram DMs & Facebook Messenger</h2>
              <p className="text-sm text-slate-500">Same setup for both &middot; ~10 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <strong>Prerequisites:</strong> A Facebook Page (for Messenger) and/or an Instagram Business account linked to that Page (for Instagram DMs). A Meta developer app (same one from WhatsApp works).
            </div>

            <Step n={1}>
              <strong>Set env variables.</strong> Make sure <code className="text-xs bg-slate-100 rounded px-1">META_APP_ID</code> and <code className="text-xs bg-slate-100 rounded px-1">META_APP_SECRET</code> are set in your <code className="text-xs bg-slate-100 rounded px-1">.env</code> file. You find these in your Meta app&apos;s <strong>Settings &rarr; Basic</strong>.
            </Step>

            <Step n={2}>
              <strong>Add Facebook Login product.</strong> In your Meta app dashboard &rarr; <strong>Add Product</strong> &rarr; <strong>Facebook Login</strong> &rarr; <strong>Set Up</strong> &rarr; choose <strong>Web</strong> &rarr; enter your site URL.
            </Step>

            <Step n={3}>
              <strong>Add Messenger product.</strong> Also add the <strong>Messenger</strong> product to the same app. In Messenger Settings &rarr; <strong>Webhooks</strong>:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Callback URL: <code className="text-xs bg-slate-100 rounded px-1">https://your-domain.com/api/webhooks/messenger</code></li>
                <li>Verify token: same <code className="text-xs bg-slate-100 rounded px-1">META_WEBHOOK_VERIFY_TOKEN</code></li>
                <li>Subscribe to: <strong>messages, messaging_postbacks</strong></li>
              </ul>
            </Step>

            <Step n={4}>
              <strong>Add Instagram product</strong> (if using IG DMs). Add the <strong>Instagram</strong> product &rarr; configure webhook:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Callback URL: <code className="text-xs bg-slate-100 rounded px-1">https://your-domain.com/api/webhooks/instagram</code></li>
                <li>Subscribe to: <strong>messages</strong></li>
              </ul>
            </Step>

            <Step n={5}>
              <strong>Connect from InboxWeave.</strong> Go to your org &rarr; <strong>Channels</strong> &rarr; click <strong>Connect with Facebook</strong>. This opens Facebook Login. Select the Pages you want to connect. InboxWeave automatically detects which Pages have Instagram Business accounts linked and creates channels for both.
            </Step>

            <Step n={6}>
              <strong>App Review (for production).</strong> For development, you can test with your own accounts. To go live with other users, submit your app for Meta App Review and request the <code className="text-xs bg-slate-100 rounded px-1">pages_messaging</code> and <code className="text-xs bg-slate-100 rounded px-1">instagram_manage_messages</code> permissions.
            </Step>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <strong>Test it:</strong> Send a DM to your connected Facebook Page or Instagram account. It should appear in the InboxWeave and get an AI reply.
            </div>
          </div>
        </section>

        {/* ── SMS / Twilio ─────────────────────────────────────── */}
        <section id="sms" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-100 text-red-600 text-lg font-extrabold">
              SMS
            </div>
            <div>
              <h2 className="text-xl font-bold">SMS via Twilio</h2>
              <p className="text-sm text-slate-500">Pay-as-you-go pricing &middot; ~5 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <Step n={1}>
              <strong>Create a Twilio account.</strong> Sign up at{" "}
              <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">twilio.com</span>. The free trial gives you a phone number and credits to test.
            </Step>

            <Step n={2}>
              <strong>Get a phone number.</strong> In the Twilio Console &rarr; <strong>Phone Numbers</strong> &rarr; <strong>Buy a Number</strong>. Pick one with SMS capability. Note the number in E.164 format (e.g. <code className="text-xs bg-slate-100 rounded px-1">+14155551234</code>).
            </Step>

            <Step n={3}>
              <strong>Find your credentials.</strong> In the Twilio Console dashboard, copy your <strong>Account SID</strong> and <strong>Auth Token</strong>.
            </Step>

            <Step n={4}>
              <strong>Configure webhook.</strong> Go to your phone number&apos;s settings &rarr; <strong>Messaging</strong> &rarr; <strong>A MESSAGE COMES IN</strong> &rarr; set webhook to:
              <code className="mt-1 block text-xs bg-slate-100 rounded px-2 py-1">https://your-domain.com/api/webhooks/sms</code>
              Method: <strong>HTTP POST</strong>.
            </Step>

            <Step n={5}>
              <strong>Paste into InboxWeave.</strong> Go to your org &rarr; <strong>Channels</strong> &rarr; <strong>SMS</strong> tab (or navigate to <code className="text-xs bg-slate-100 rounded px-1">/channels/sms</code>) &rarr; enter Account SID, Auth Token, and phone number. Click <strong>Save</strong>. Done!
            </Step>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <strong>Test it:</strong> Text your Twilio number from any phone. The message appears in InboxWeave and gets an AI reply via SMS.
            </div>
          </div>
        </section>

        {/* ── Email ────────────────────────────────────────────── */}
        <section id="email" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 text-lg font-extrabold">
              @
            </div>
            <div>
              <h2 className="text-xl font-bold">Email (IMAP/SMTP)</h2>
              <p className="text-sm text-slate-500">Works with Gmail, Outlook, custom &middot; ~5 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <Step n={1}>
              <strong>Choose your email.</strong> You can use any email that supports IMAP/SMTP: Gmail, Outlook, custom domain email, etc.
            </Step>

            <Step n={2}>
              <strong>For Gmail:</strong> Go to your Google Account &rarr; <strong>Security</strong> &rarr; <strong>App passwords</strong> (requires 2FA enabled) &rarr; generate an app password for &ldquo;Mail&rdquo;. Use this instead of your regular password.
              <div className="mt-2 rounded bg-slate-50 p-2 text-xs">
                IMAP: <code>imap.gmail.com</code> port <code>993</code><br />
                SMTP: <code>smtp.gmail.com</code> port <code>587</code>
              </div>
            </Step>

            <Step n={3}>
              <strong>For Outlook/Office 365:</strong>
              <div className="mt-2 rounded bg-slate-50 p-2 text-xs">
                IMAP: <code>outlook.office365.com</code> port <code>993</code><br />
                SMTP: <code>smtp.office365.com</code> port <code>587</code>
              </div>
            </Step>

            <Step n={4}>
              <strong>Paste into InboxWeave.</strong> Go to your org &rarr; <strong>Channels</strong> &rarr; <strong>Email</strong> (or navigate to <code className="text-xs bg-slate-100 rounded px-1">/channels/email</code>) &rarr; enter your email, IMAP/SMTP hosts and ports, and app password. Click <strong>Save</strong>.
            </Step>

            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <strong>Note:</strong> Email polling requires a background job to check the IMAP inbox periodically. This is configured separately via a cron job or serverless function.
            </div>
          </div>
        </section>

        {/* ── OpenAI API Key ───────────────────────────────────── */}
        <section id="openai" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100">
              <IconSparkle className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">OpenAI API Key (Required)</h2>
              <p className="text-sm text-slate-500">Pay-as-you-go &middot; ~2 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <Step n={1}>
              <strong>Create an OpenAI account.</strong> Go to{" "}
              <span className="font-mono text-xs bg-slate-100 rounded px-1.5 py-0.5">platform.openai.com</span> and sign up.
            </Step>

            <Step n={2}>
              <strong>Add billing.</strong> Go to <strong>Settings &rarr; Billing</strong> &rarr; add a payment method and load a small amount ($5-10 is enough to start).
            </Step>

            <Step n={3}>
              <strong>Create an API key.</strong> Go to <strong>API Keys</strong> &rarr; <strong>Create new secret key</strong> &rarr; name it &ldquo;InboxWeave&rdquo; &rarr; copy the key (starts with <code className="text-xs bg-slate-100 rounded px-1">sk-</code>).
            </Step>

            <Step n={4}>
              <strong>Paste into InboxWeave.</strong> Go to your org &rarr; <strong>Settings</strong> &rarr; paste the key in the <strong>OpenAI API key</strong> field &rarr; click <strong>Save key</strong>. It&apos;s encrypted immediately and never shown again.
            </Step>

            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <strong>Cost:</strong> GPT-4o-mini costs about $0.15 per 1M input tokens. A typical small business uses $1-5/month. You can monitor usage in your org&apos;s <strong>Dashboard</strong>.
            </div>
          </div>
        </section>

        <div className="text-center">
          <Link href="/signup" className="btn px-8 py-3 text-base">
            Get started free &rarr;
          </Link>
          <p className="mt-3 text-xs text-slate-400">All guides assume you already have an InboxWeave account</p>
        </div>
      </main>
    </div>
  );
}

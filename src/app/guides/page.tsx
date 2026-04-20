import type { Metadata } from "next";
import Link from "next/link";
import { IconSparkle, IconArrowLeft, IconWhatsApp, IconFacebook, IconInstagram } from "@/components/icons";
import { LogoFull } from "@/components/Logo";

export const metadata: Metadata = {
  title: "Setup Guides — Connect WhatsApp, Instagram, Messenger, SMS & Email",
  description: "Step-by-step tutorials for connecting your own Meta app, WhatsApp, Instagram, Messenger, Twilio SMS, and Email to InboxWeave.",
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
            Step-by-step instructions to connect your channels. Each org brings their own Meta
            developer app (no business verification required).
          </p>
        </div>

        {/* ── Step 0: Create a Meta app ──────────────────────── */}
        <section id="meta-app" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100">
              <IconFacebook className="h-6 w-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Create your Meta developer app</h2>
              <p className="text-sm text-slate-500">Do this once, then you can use it for WhatsApp, Instagram, and Messenger.</p>
            </div>
          </div>

          <div className="card space-y-5">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <strong>No business verification needed.</strong> We use the <strong>Consumer</strong> app type which works immediately for testing and development.
            </div>

            <Step n={1}>
              Go to <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">developers.facebook.com/apps</a> and sign in with your Facebook account.
            </Step>

            <Step n={2}>
              Click <strong>Create App</strong> &rarr; choose <strong>Other</strong> as the use case &rarr; pick <strong>Consumer</strong> as the app type &rarr; click Next.
            </Step>

            <Step n={3}>
              Give it a name (e.g. &ldquo;My InboxWeave&rdquo;) &rarr; enter your email &rarr; click <strong>Create App</strong>. You might need to enter your Facebook password.
            </Step>

            <Step n={4}>
              From your app dashboard, click <strong>App Settings &rarr; Basic</strong> in the left sidebar. Copy these two values:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li><strong>App ID</strong> (visible at the top)</li>
                <li><strong>App Secret</strong> (click &ldquo;Show&rdquo; &rarr; enter password)</li>
              </ul>
            </Step>

            <Step n={5}>
              In InboxWeave, open <strong>Settings &rarr; Meta App</strong> and paste:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Your <strong>App ID</strong></li>
                <li>Your <strong>App Secret</strong></li>
                <li>A <strong>Verify Token</strong> — any random string you make up (you&apos;ll use it again below)</li>
              </ul>
              Click Save.
            </Step>

            <Step n={6}>
              Back on the Meta app dashboard &rarr; scroll down to <strong>App Domains</strong> &rarr; add your InboxWeave domain (e.g. <code className="text-xs bg-slate-100 rounded px-1">inboxweave.com</code>). Click Save Changes at the bottom.
            </Step>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              Now you&apos;re ready to add products (WhatsApp, Messenger, Instagram) to the app. Follow whichever channel(s) you need below.
            </div>
          </div>
        </section>

        {/* ── WhatsApp ─────────────────────────────────────────── */}
        <section id="whatsapp" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100">
              <IconWhatsApp className="h-6 w-6 text-emerald-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold">WhatsApp Cloud API</h2>
              <p className="text-sm text-slate-500">Free tier available &middot; ~10 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <Step n={1}>
              On your Meta app dashboard, click <strong>Add Product</strong> on the left sidebar &rarr; find <strong>WhatsApp</strong> &rarr; click <strong>Set Up</strong>. Select or create a Meta Business account.
            </Step>

            <Step n={2}>
              In the WhatsApp section &rarr; <strong>API Setup</strong>, you&apos;ll get a test phone number. Copy the <strong>Phone number ID</strong> (numeric string).
            </Step>

            <Step n={3}>
              On the same page, copy the <strong>Temporary access token</strong> (it expires in 24 hours but works for testing).
            </Step>

            <Step n={4}>
              Still in the WhatsApp section &rarr; <strong>Configuration</strong> &rarr; set webhook:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Callback URL: <code className="text-xs bg-slate-100 rounded px-1">https://inboxweave.com/api/webhooks/whatsapp</code></li>
                <li>Verify token: use the <strong>same verify token</strong> you saved in InboxWeave&apos;s Meta App settings</li>
                <li>Subscribe to: <strong>messages</strong></li>
              </ul>
            </Step>

            <Step n={5}>
              In InboxWeave &rarr; <strong>Channels</strong> &rarr; fill in the WhatsApp form with display name, Phone Number ID, and the access token. Click <strong>Connect WhatsApp</strong>.
            </Step>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <strong>Test it:</strong> Add your own phone to &ldquo;To&rdquo; recipients in the API Setup page first (Meta requires this for testing), then send a WhatsApp message to the test number. You&apos;ll get an AI reply.
            </div>
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <strong>For permanent tokens:</strong> Once you&apos;ve tested, create a System User in Business Settings &rarr; generate a permanent token with <code className="text-xs">whatsapp_business_messaging</code> permission &rarr; replace the temporary token in InboxWeave.
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
              <p className="text-sm text-slate-500">~10 minutes &middot; OAuth-based connection</p>
            </div>
          </div>

          <div className="card space-y-5">
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
              <strong>You need:</strong> A Facebook Page (create one at <a href="https://facebook.com/pages/create" target="_blank" rel="noopener noreferrer" className="underline">facebook.com/pages/create</a>). For Instagram DMs, the Page must be linked to an Instagram Business account.
            </div>

            <Step n={1}>
              On your Meta app dashboard &rarr; <strong>Add Product</strong> &rarr; add <strong>Facebook Login for Business</strong> (or the classic &ldquo;Facebook Login&rdquo;).
            </Step>

            <Step n={2}>
              In <strong>Facebook Login &rarr; Settings</strong>, add to <strong>Valid OAuth Redirect URIs</strong>:
              <code className="mt-1 block text-xs bg-slate-100 rounded px-2 py-1">https://inboxweave.com/api/meta/oauth/callback</code>
              Enable Client OAuth Login + Web OAuth Login. Save.
            </Step>

            <Step n={3}>
              <strong>Add Product</strong> &rarr; add <strong>Messenger</strong>. In Messenger Settings &rarr; <strong>Webhooks</strong>:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Callback URL: <code className="text-xs bg-slate-100 rounded px-1">https://inboxweave.com/api/webhooks/messenger</code></li>
                <li>Verify token: same as the one in InboxWeave settings</li>
                <li>Subscribe to: <strong>messages, messaging_postbacks</strong></li>
              </ul>
            </Step>

            <Step n={4}>
              If using Instagram DMs: <strong>Add Product</strong> &rarr; <strong>Instagram</strong> &rarr; configure webhook:
              <ul className="mt-2 ml-4 space-y-1 list-disc">
                <li>Callback URL: <code className="text-xs bg-slate-100 rounded px-1">https://inboxweave.com/api/webhooks/instagram</code></li>
                <li>Subscribe to: <strong>messages</strong></li>
              </ul>
            </Step>

            <Step n={5}>
              In InboxWeave &rarr; <strong>Channels</strong> &rarr; click <strong>Connect with Facebook</strong>. Approve the permissions prompt and select which Page(s) to connect. Done.
            </Step>

            <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-800">
              <strong>Your app is in Development Mode.</strong> This works fine for testing with yourself + any &ldquo;App Administrator/Developer/Tester&rdquo; you add in <strong>App Roles</strong>. For public use, you&apos;d need App Review (not required for personal / small-team use).
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
              <p className="text-sm text-slate-500">Pay-as-you-go &middot; ~5 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <Step n={1}>Sign up at <a href="https://twilio.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">twilio.com</a>. Free trial includes a phone number and credits.</Step>
            <Step n={2}>Console &rarr; <strong>Phone Numbers &rarr; Buy a Number</strong> &rarr; pick one with SMS capability. Note the E.164 format (e.g. <code className="text-xs">+14155551234</code>).</Step>
            <Step n={3}>From the Twilio Console dashboard, copy your <strong>Account SID</strong> and <strong>Auth Token</strong>.</Step>
            <Step n={4}>
              Your phone number&apos;s settings &rarr; <strong>Messaging</strong> &rarr; <strong>A MESSAGE COMES IN</strong> webhook:
              <code className="mt-1 block text-xs bg-slate-100 rounded px-2 py-1">https://inboxweave.com/api/webhooks/sms</code>
              Method: <strong>HTTP POST</strong>.
            </Step>
            <Step n={5}>In InboxWeave &rarr; <strong>Channels &rarr; SMS</strong> &rarr; paste Account SID, Auth Token, phone number. Save.</Step>
          </div>
        </section>

        {/* ── Email ────────────────────────────────────────────── */}
        <section id="email" className="mb-16">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 text-lg font-extrabold">@</div>
            <div>
              <h2 className="text-xl font-bold">Email (IMAP/SMTP)</h2>
              <p className="text-sm text-slate-500">Works with Gmail, Outlook, custom &middot; ~5 minutes</p>
            </div>
          </div>

          <div className="card space-y-5">
            <Step n={1}>For <strong>Gmail</strong>: enable 2FA &rarr; create an <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">App Password</a> for &ldquo;Mail&rdquo;. Use this instead of your regular password.</Step>
            <Step n={2}>
              Settings depending on provider:
              <div className="mt-2 rounded bg-slate-50 p-2 text-xs">
                <strong>Gmail:</strong> IMAP <code>imap.gmail.com:993</code>, SMTP <code>smtp.gmail.com:587</code><br />
                <strong>Outlook:</strong> IMAP <code>outlook.office365.com:993</code>, SMTP <code>smtp.office365.com:587</code>
              </div>
            </Step>
            <Step n={3}>In InboxWeave &rarr; <strong>Channels &rarr; Email</strong> &rarr; paste email, hosts, ports, and app password. Save.</Step>
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
            <Step n={1}>Sign up at <a href="https://platform.openai.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">platform.openai.com</a>.</Step>
            <Step n={2}>Settings &rarr; Billing &rarr; add a payment method and load $5-10.</Step>
            <Step n={3}>API Keys &rarr; Create new secret key &rarr; copy the <code className="text-xs">sk-...</code> key.</Step>
            <Step n={4}>In InboxWeave &rarr; <strong>Settings</strong> &rarr; paste into the OpenAI API key field &rarr; Save. It&apos;s encrypted immediately.</Step>

            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800">
              <strong>Cost:</strong> GPT-4o-mini is ~$0.15 per 1M input tokens. Typical small business: $1-5/month. Track usage in your Dashboard.
            </div>
          </div>
        </section>

        <div className="text-center">
          <Link href="/signup" className="btn px-8 py-3 text-base">Get started free &rarr;</Link>
        </div>
      </main>
    </div>
  );
}

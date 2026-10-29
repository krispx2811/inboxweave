import type { Metadata } from "next";
import Link from "next/link";
import { IconInstagram, IconSparkle, IconInbox, IconBolt, IconChart, IconGlobe, IconShield, IconUsers } from "@/components/icons";
import { LogoIcon, LogoFull } from "@/components/Logo";
import { AdSlot } from "@/components/AdSlot";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const SITE = "https://inboxweave.com";

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "InboxWeave",
  url: SITE,
  logo: `${SITE}/icon.svg`,
  areaServed: ["Oman", "GCC"],
  description:
    "InboxWeave is an AI customer messaging platform for businesses in Oman and the GCC. It answers Instagram direct messages in Arabic and English from the business's own knowledge base.",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "InboxWeave",
  url: SITE,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: ["en", "ar"],
  offers: {
    "@type": "Offer",
    price: "30",
    priceCurrency: "OMR",
    priceSpecification: {
      "@type": "UnitPriceSpecification",
      price: "30",
      priceCurrency: "OMR",
      billingDuration: "P1M",
      unitText: "month",
    },
    description: "One plan with every feature and support included. No setup fee.",
  },
  description:
    "AI auto-replies for Instagram direct messages. The AI replies in Arabic and English from your own knowledge base and current offers, with a shared team inbox. 30 OMR per month.",
  featureList: [
    "AI auto-replies in Arabic and English",
    "Instagram DM automation",
    "Answers from your own knowledge base (RAG with hybrid search)",
    "Time-limited offers the AI quotes automatically",
    "Hand-off to a human when the customer asks",
    "Shared team inbox with tags, notes and assignment",
    "Sentiment and analytics dashboard",
  ],
};

const FAQ: Array<{ q: string; a: string }> = [
  {
    q: "How much does InboxWeave cost?",
    a: "InboxWeave costs 30 OMR per month. That one plan includes every feature, Instagram direct messages, unlimited team members and support. There is no setup fee. AI usage is billed by OpenAI to your own OpenAI API key, so you only pay OpenAI for the messages the AI actually answers.",
  },
  {
    q: "Which messaging channels does InboxWeave support?",
    a: "InboxWeave answers Instagram direct messages. You connect your Instagram business account, and every DM arrives in one shared inbox where the AI replies and your team can step in.",
  },
  {
    q: "Does the AI reply in Arabic?",
    a: "Yes. The AI detects the customer's language and replies in the same language, including Arabic and English. Arabic questions are matched against English knowledge-base documents too, so you don't need to write everything twice.",
  },
  {
    q: "How does the AI know about my business?",
    a: "You upload your FAQs, price lists and policies to the knowledge base. For every customer message, InboxWeave finds the relevant parts using hybrid search (meaning-based vector search combined with exact keyword matching) and the AI answers from them. If the answer isn't in your knowledge base, the AI says it will check with your team instead of guessing.",
  },
  {
    q: "Can the AI tell customers about my current offers?",
    a: "Yes. Add an offer with its prices and an optional end date on the Offers page. While it runs, the AI quotes the offer instead of your regular price and lists it when customers ask about promotions. After the end date it goes back to your regular prices automatically, without editing your knowledge base.",
  },
  {
    q: "Can a human take over a conversation?",
    a: "Yes. Your team can reply from the inbox at any time, pause the AI for one conversation or for the whole account, and customers can type stop to switch the AI off for their chat.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }} />
      {/* ── Nav ──────────────────────────────────────────────── */}
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <LogoFull />
        <div className="flex items-center gap-3">
          <Link href="/guides" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            Guides
          </Link>
          <Link href="#pricing" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            Pricing
          </Link>
          <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            Sign in
          </Link>
          <Link href="/signup" className="btn btn-sm">
            Get started
          </Link>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-700">
          30 OMR per month &middot; No setup fee &middot; Arabic &amp; English
        </div>

        <h1 className="text-5xl font-extrabold tracking-tight text-slate-900 sm:text-6xl leading-[1.1]">
          AI auto-replies for<br />
          <span className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 bg-clip-text text-transparent">
            your Instagram DMs
          </span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500 leading-relaxed">
          InboxWeave answers your customers&apos; Instagram DMs in Arabic and English,
          using your own price list, policies and current offers, and hands off to your team when it matters.
        </p>

        <div className="mt-6 flex items-center justify-center gap-5">
          <IconInstagram className="h-7 w-7 text-pink-500 opacity-80" />
        </div>

        <div className="mt-10 flex items-center justify-center gap-4">
          <Link href="/signup" className="btn px-8 py-3.5 text-base shadow-lg shadow-indigo-200">
            Get started &rarr;
          </Link>
          <Link href="#pricing" className="btn-ghost px-6 py-3.5 text-base">
            See pricing
          </Link>
        </div>

        <p className="mt-4 text-xs text-slate-400">30 OMR per month &middot; Every feature and support included &middot; No setup fee</p>
      </section>

      {/* ── Ad slot 1 ────────────────────────────────────────── */}
      <AdSlot slot="1234567890" format="horizontal" className="mx-auto max-w-4xl px-6 mb-8" />

      {/* ── Mockup ───────────────────────────────────────────── */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-2xl shadow-slate-200/50">
          <div className="flex items-center gap-1.5 border-b border-slate-200 bg-white px-4 py-3">
            <div className="h-3 w-3 rounded-full bg-red-400" />
            <div className="h-3 w-3 rounded-full bg-amber-400" />
            <div className="h-3 w-3 rounded-full bg-emerald-400" />
            <span className="ml-3 text-xs text-slate-400">InboxWeave &mdash; My Company</span>
          </div>
          <div className="flex min-h-[340px]">
            {/* Sidebar mockup */}
            <div className="w-48 shrink-0 border-r border-slate-200 bg-white p-3 space-y-1">
              {["Dashboard", "Inbox", "Contacts", "Channels", "Knowledge", "Settings"].map((item, i) => (
                <div key={item} className={`rounded-lg px-3 py-2 text-xs font-medium ${i === 1 ? "bg-indigo-50 text-indigo-700" : "text-slate-500"}`}>
                  {item}
                </div>
              ))}
            </div>
            {/* Conversation list mockup */}
            <div className="w-56 shrink-0 border-r border-slate-100 p-2 space-y-1">
              {[
                { name: "Sarah M.", msg: "Thanks for the quick help!", platform: "instagram", time: "2m" },
                { name: "Ahmed K.", msg: "When will my order arrive?", platform: "instagram", time: "8m" },
                { name: "Lisa T.", msg: "Can I get a refund?", platform: "instagram", time: "1h" },
              ].map((c, i) => (
                <div key={i} className={`rounded-lg px-3 py-2.5 ${i === 0 ? "bg-indigo-50 border-l-2 border-indigo-600" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-800">{c.name}</span>
                    <span className="text-[10px] text-slate-400">{c.time}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate mt-0.5">{c.msg}</div>
                  <span className="mt-1 inline-block rounded-full bg-purple-50 px-1.5 py-0 text-[9px] font-medium text-purple-600">{c.platform}</span>
                </div>
              ))}
            </div>
            {/* Chat mockup */}
            <div className="flex-1 flex flex-col">
              <div className="border-b border-slate-100 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">SM</div>
                  <div>
                    <div className="text-xs font-semibold">Sarah M.</div>
                    <div className="text-[10px] text-emerald-500 flex items-center gap-1">
                      <IconSparkle className="h-3 w-3" /> AI active
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5">
                  <span className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] text-slate-500">Pause AI</span>
                  <span className="rounded-lg bg-emerald-600 px-2 py-1 text-[10px] text-white">Resolve</span>
                </div>
              </div>
              <div className="flex-1 p-4 space-y-3">
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-white border border-slate-100 px-3.5 py-2 text-xs text-slate-700 shadow-sm max-w-[75%]">
                    Hi! I need help with my recent order #4521
                  </div>
                </div>
                <div className="flex justify-end">
                  <div>
                    <div className="text-[10px] text-indigo-500 text-right mb-0.5">AI</div>
                    <div className="rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-xs text-white max-w-[75%]">
                      Hi Sarah! I can see order #4521 was shipped yesterday. It should arrive by Thursday. Would you like me to send the tracking link?
                    </div>
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-white border border-slate-100 px-3.5 py-2 text-xs text-slate-700 shadow-sm">
                    Yes please! Thanks for the quick help!
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Ad slot 2 ────────────────────────────────────────── */}
      <AdSlot slot="2345678901" format="horizontal" className="mx-auto max-w-4xl px-6 py-4" />

      {/* ── Feature 1: AI that actually knows your business ── */}
      <section id="features" className="border-t border-slate-100 bg-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-indigo-600 mb-3">Intelligent replies</p>
              <h2 className="text-3xl font-extrabold tracking-tight leading-tight">AI that actually knows<br />your business</h2>
              <p className="mt-4 text-slate-500 leading-relaxed">
                Upload your FAQs, product docs, or policies. The AI retrieves relevant context on
                every message and replies in your customer&apos;s language &mdash; Arabic, English, Spanish, or
                any of 50+ languages. No translation step, no config.
              </p>
              <ul className="mt-6 space-y-3">
                {["Retrieves from your knowledge base on every reply", "Auto-detects language and responds in kind", "Choose from OpenAI's latest GPT-5 models"].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            {/* Mini UI: knowledge upload + AI reply */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-500">Knowledge Base</div>
              <div className="p-4 space-y-2">
                {["Product FAQ.pdf", "Return Policy.md", "Pricing Guide.txt"].map((doc, i) => (
                  <div key={doc} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                    <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-[10px] font-bold ${i === 0 ? "bg-red-100 text-red-600" : i === 1 ? "bg-blue-100 text-blue-600" : "bg-amber-100 text-amber-600"}`}>
                      {doc.split(".")[1]!.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate">{doc}</div>
                      <div className="text-[10px] text-slate-400">Ready &middot; 24 chunks</div>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600">indexed</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-slate-100 px-5 py-3">
                <div className="text-[10px] text-slate-400 mb-2">Customer asks: &ldquo;What&apos;s your return policy?&rdquo;</div>
                <div className="rounded-xl bg-indigo-600 px-4 py-2.5 text-xs text-white leading-relaxed">
                  We offer a 30-day no-questions-asked return policy for all unused items. I can start the return process for you right now &mdash; just share your order number.
                  <div className="mt-1.5 flex items-center gap-1 text-indigo-200 text-[10px]">
                    <IconSparkle className="h-3 w-3" /> Retrieved from Return Policy.md
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 2: Sentiment + escalation ────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            {/* Mini UI: conversation with sentiment */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden order-2 lg:order-1">
              <div className="border-b border-slate-100 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center text-xs font-bold text-red-600">JD</div>
                  <div>
                    <div className="text-xs font-semibold">James D.</div>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">angry</span>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-medium text-red-600">Escalated</span>
                    </div>
                  </div>
                </div>
                <span className="rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white">AI paused</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-bl-md bg-slate-50 border border-slate-100 px-3.5 py-2 text-xs text-slate-700 max-w-[80%]">
                    This is the THIRD time I&apos;ve been charged incorrectly. I want a full refund and I&apos;m filing a complaint.
                  </div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-800">
                  <span className="font-bold">Auto-escalated:</span> Negative sentiment detected (score: -0.9). AI paused &mdash; a human agent needs to handle this.
                </div>
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-br-md bg-slate-800 px-3.5 py-2 text-xs text-white max-w-[80%]">
                    <div className="text-[10px] text-slate-400 mb-0.5">Sarah (agent)</div>
                    James, I&apos;m really sorry about this. I&apos;ve just processed a full refund for all three charges. You should see it within 2 business days.
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 lg:order-2">
              <p className="text-xs font-bold uppercase tracking-widest text-red-600 mb-3">Protect your brand</p>
              <h2 className="text-3xl font-extrabold tracking-tight leading-tight">Knows when to step back<br />and get a human</h2>
              <p className="mt-4 text-slate-500 leading-relaxed">
                Every message is scored for sentiment. When a customer is angry or frustrated,
                the AI automatically pauses and flags the conversation for your team. No more
                tone-deaf bot replies to upset customers.
              </p>
              <ul className="mt-6 space-y-3">
                {["Real-time sentiment scoring on every inbound message", "Auto-pauses AI and escalates on negative sentiment", "Agents see the full context + AI summary before replying"].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-sm text-slate-600">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 3: Analytics ─────────────────────────────── */}
      <section className="border-t border-slate-100 bg-slate-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-purple-600 mb-3">Measure everything</p>
              <h2 className="text-3xl font-extrabold tracking-tight leading-tight">Analytics that actually<br />tell you something</h2>
              <p className="mt-4 text-slate-500 leading-relaxed">
                See how your AI is performing at a glance. Track response times, resolution rates,
                customer satisfaction, and token costs. Know your busiest hours and which channels
                drive the most volume.
              </p>
            </div>
            {/* Mini UI: dashboard stats */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="border-b border-slate-100 px-5 py-3 text-xs font-semibold text-slate-500">Dashboard &middot; Last 30 days</div>
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {[
                    { value: "2,847", label: "Messages", change: "+12%" },
                    { value: "94%", label: "AI reply rate", change: "+3%" },
                    { value: "18s", label: "Avg first reply", change: "-40%" },
                    { value: "4.6/5", label: "CSAT score", change: "+0.2" },
                  ].map(({ value, label, change }) => (
                    <div key={label} className="rounded-lg bg-slate-50 px-3 py-2.5">
                      <div className="text-lg font-bold text-slate-900">{value}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-slate-500">{label}</span>
                        <span className="text-[10px] font-medium text-emerald-600">{change}</span>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Mini bar chart */}
                <div className="text-[10px] text-slate-400 mb-2">Daily volume</div>
                <div className="flex items-end gap-[3px] h-16">
                  {[30, 45, 38, 52, 61, 55, 48, 72, 65, 58, 43, 67, 78, 70].map((v, i) => (
                    <div key={i} className="flex-1 rounded-t bg-indigo-500 transition-all" style={{ height: `${(v / 78) * 100}%` }} />
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  {[
                    { label: "Instagram DMs", count: "1,417", color: "bg-purple-50 text-purple-700" },
                    { label: "Answered by AI", count: "1,203", color: "bg-indigo-50 text-indigo-700" },
                    { label: "By your team", count: "214", color: "bg-slate-100 text-slate-700" },
                  ].map(({ label, count, color }) => (
                    <div key={label} className={`flex-1 rounded-lg px-2 py-1.5 text-center ${color}`}>
                      <div className="text-xs font-bold">{count}</div>
                      <div className="text-[10px]">{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Feature 4: Team tools ────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-3">Built for teams</p>
            <h2 className="text-3xl font-extrabold tracking-tight">Everything agents need to move fast</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Canned replies mini */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Canned replies</div>
              <div className="space-y-1.5">
                {["Greeting", "Order status", "Refund process", "Business hours"].map((r) => (
                  <div key={r} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-200 hover:text-indigo-600 transition-colors cursor-default">
                    {r}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[10px] text-slate-400">Click to send instantly</div>
            </div>
            {/* AI suggestions mini */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">AI suggestions</div>
              <div className="space-y-1.5">
                {[
                  "I can check your order status right away.",
                  "Would you like me to process a refund?",
                  "Let me connect you with our specialist.",
                ].map((s, i) => (
                  <div key={i} className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] text-indigo-700">
                    {s}
                  </div>
                ))}
              </div>
              <div className="mt-3 text-[10px] text-indigo-500 flex items-center gap-1">
                <IconSparkle className="h-3 w-3" /> Generated from context
              </div>
            </div>
            {/* Tags + assign mini */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Organize</div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {[
                  { label: "urgent", color: "bg-red-50 text-red-600 border-red-200" },
                  { label: "vip", color: "bg-amber-50 text-amber-600 border-amber-200" },
                  { label: "sales", color: "bg-blue-50 text-blue-600 border-blue-200" },
                  { label: "refund", color: "bg-purple-50 text-purple-600 border-purple-200" },
                ].map(({ label, color }) => (
                  <span key={label} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${color}`}>{label}</span>
                ))}
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600 mb-2">
                <span className="text-[10px] text-slate-400">Assigned to </span>
                <span className="font-medium">Sarah K.</span>
              </div>
              <div className="flex gap-1.5">
                <span className="rounded-md bg-emerald-600 px-2 py-1 text-[10px] text-white">Resolve</span>
                <span className="rounded-md border border-slate-200 px-2 py-1 text-[10px] text-slate-500">Pin</span>
              </div>
              <div className="mt-3 text-[10px] text-slate-400">Tags, assignment, status</div>
            </div>
            {/* Internal notes mini */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Team notes</div>
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[10px] text-amber-500">Sarah &middot; 2h ago</div>
                  <div className="text-[11px] text-amber-900">Customer is a repeat buyer. Offer 15% discount to retain.</div>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <div className="text-[10px] text-amber-500">Ahmed &middot; 30m ago</div>
                  <div className="text-[11px] text-amber-900">Refund approved by manager. Processing now.</div>
                </div>
              </div>
              <div className="mt-3 text-[10px] text-slate-400">Visible only to your team</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Channels strip ───────────────────────────────────── */}
      <section className="border-t border-b border-slate-100 bg-slate-50 py-16">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <div className="flex flex-col items-center gap-3 text-pink-500">
            <IconInstagram className="h-10 w-10" />
            <h2 className="text-xl font-bold text-slate-900">Built for Instagram DMs</h2>
            <p className="max-w-md text-sm text-slate-500">
              Connect your Instagram business account and every direct message lands in one inbox,
              answered by AI in Arabic or English, with your team one click away.
            </p>
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────── */}
      <section id="pricing" className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-4 py-1.5 text-xs font-semibold text-indigo-700">
              Simple, transparent pricing
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight">One plan. 30 OMR per month.</h2>
            <p className="mt-4 text-slate-500 max-w-xl mx-auto">
              Every feature, every channel and support included. No setup fee and no add-ons to work out.
            </p>
          </div>

          <div className="mx-auto max-w-md">
            <div className="rounded-2xl border-2 border-indigo-600 bg-white p-8 shadow-xl shadow-indigo-100 relative overflow-hidden">
              <div className="absolute top-0 right-0 rounded-bl-xl bg-indigo-600 px-4 py-1.5 text-xs font-bold text-white">
                MONTHLY
              </div>
              <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wider mb-2">InboxWeave</div>
              <div className="mb-6">
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-extrabold">30</span>
                  <span className="text-slate-500 font-semibold">OMR</span>
                  <span className="text-slate-400 text-sm">/month</span>
                </div>
                <p className="mt-2 text-sm text-slate-500">Everything you need to answer customers automatically.</p>
              </div>
              <ul className="space-y-3 mb-2">
                {[
                  "Instagram DMs in one shared inbox",
                  "AI auto-replies in Arabic and English",
                  "Answers from your own knowledge base",
                  "Offers the AI quotes automatically until they end",
                  "Unlimited organizations and team members",
                  "Sentiment, analytics and canned replies",
                  "Onboarding, channel setup and ongoing support",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    {f}
                  </li>
                ))}
              </ul>
              <p className="mt-6 text-xs text-slate-400">
                AI usage is billed by OpenAI to your own OpenAI API key, so you only pay for the messages the AI answers.
              </p>
            </div>
          </div>

          <div className="mt-10 text-center">
            <Link href="/signup" className="btn px-10 py-4 text-base shadow-lg shadow-indigo-200">
              Get started &rarr;
            </Link>
            <p className="mt-3 text-xs text-slate-400">30 OMR per month &middot; No setup fee</p>
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section id="faq" className="border-t border-slate-100 py-20">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="mb-10 text-center text-3xl font-extrabold tracking-tight">Frequently asked questions</h2>
          <div className="space-y-6">
            {FAQ.map(({ q, a }) => (
              <div key={q}>
                <h3 className="font-semibold text-slate-900">{q}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Ad slot 3 ────────────────────────────────────────── */}
      <AdSlot slot="3456789012" format="horizontal" className="mx-auto max-w-4xl px-6 py-4" />

      {/* ── CTA ──────────────────────────────────────────────── */}
      <section className="border-t border-slate-100 bg-gradient-to-b from-indigo-50 to-white py-20">
        <div className="mx-auto max-w-2xl px-6 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight">Ready to automate your inbox?</h2>
          <p className="mt-3 text-slate-500">
            Join businesses using AI to respond faster, resolve more, and keep customers happy.
          </p>
          <Link href="/signup" className="btn mt-8 px-10 py-4 text-base shadow-lg shadow-indigo-200">
            Get started &rarr;
          </Link>
          <p className="mt-3 text-xs text-slate-400">30 OMR per month &middot; No setup fee</p>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="border-t border-slate-100 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-14">
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {/* Brand */}
            <div className="col-span-2 sm:col-span-1">
              <div className="mb-4">
                <LogoFull />
              </div>
              <p className="text-xs text-slate-500 leading-relaxed max-w-[200px]">
                AI-powered customer messaging for modern businesses.
              </p>
            </div>
            {/* Product */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Product</h4>
              <ul className="space-y-2.5 text-sm">
                <li><Link href="#features" className="text-slate-500 hover:text-slate-900 transition-colors">Features</Link></li>
                <li><Link href="#pricing" className="text-slate-500 hover:text-slate-900 transition-colors">Pricing</Link></li>
                <li><Link href="/guides" className="text-slate-500 hover:text-slate-900 transition-colors">Setup Guides</Link></li>
                <li><Link href="/login" className="text-slate-500 hover:text-slate-900 transition-colors">Sign in</Link></li>
                <li><Link href="/signup" className="text-slate-500 hover:text-slate-900 transition-colors">Get started</Link></li>
              </ul>
            </div>
            {/* Channels */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Channels</h4>
              <ul className="space-y-2.5 text-sm">
                <li><span className="text-slate-500">Instagram DMs</span></li>
              </ul>
            </div>
            {/* Legal */}
            <div>
              <h4 className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-4">Legal</h4>
              <ul className="space-y-2.5 text-sm">
                <li><Link href="/terms" className="text-slate-500 hover:text-slate-900 transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="text-slate-500 hover:text-slate-900 transition-colors">Privacy Policy</Link></li>
                <li><Link href="/dpa" className="text-slate-500 hover:text-slate-900 transition-colors">Data Processing</Link></li>
              </ul>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-100">
          <div className="mx-auto max-w-6xl px-6 py-5 flex flex-col items-center justify-between gap-3 sm:flex-row text-xs text-slate-400">
            <p>&copy; {new Date().getFullYear()} InboxWeave. All rights reserved.</p>
            <div className="flex items-center gap-4">
              <Link href="/terms" className="hover:text-slate-600 transition-colors">Terms</Link>
              <Link href="/privacy" className="hover:text-slate-600 transition-colors">Privacy</Link>
              <Link href="/dpa" className="hover:text-slate-600 transition-colors">DPA</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

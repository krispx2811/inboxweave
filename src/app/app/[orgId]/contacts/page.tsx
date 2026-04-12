import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { IconUser, IconSearch } from "@/components/icons";

export const dynamic = "force-dynamic";

function platformBadge(platform: string) {
  switch (platform) {
    case "whatsapp":  return "badge-green";
    case "instagram": return "badge-purple";
    case "messenger": return "badge-blue";
    default:          return "badge-gray";
  }
}

export default async function ContactsPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { orgId } = await params;
  const { q } = await searchParams;
  const admin = createSupabaseAdminClient();

  // Build contacts from conversations (contacts table may be empty initially).
  let query = admin
    .from("conversations")
    .select("id, contact_name, contact_external_id, ai_enabled, last_message_at, tags, status, assigned_user_id, language, channels(platform, display_name)")
    .eq("org_id", orgId)
    .order("last_message_at", { ascending: false })
    .limit(200);

  if (q) {
    query = query.or(`contact_name.ilike.%${q}%,contact_external_id.ilike.%${q}%`);
  }

  const { data: contacts } = await query;

  // Get message counts per conversation.
  const msgCounts = new Map<string, number>();
  if (contacts && contacts.length > 0) {
    for (const c of contacts.slice(0, 50)) {
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", c.id);
      msgCounts.set(c.id as string, count ?? 0);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <div className="page-header">
        <h1>Contacts</h1>
        <p>All customers who have messaged your organization</p>
      </div>

      <form className="mb-6">
        <div className="relative">
          <IconSearch className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            name="q"
            className="input !pl-10"
            placeholder="Search by name or phone number..."
            defaultValue={q ?? ""}
          />
        </div>
      </form>

      <div className="space-y-2">
        {(contacts ?? []).map((c) => {
          const ch = (c as unknown as { channels?: { platform: string; display_name: string } }).channels;
          const name = (c.contact_name as string) || (c.contact_external_id as string);
          const initial = name.charAt(0).toUpperCase();
          const tags = (c.tags as string[]) ?? [];
          return (
            <a
              key={c.id}
              href={`/app/${orgId}/inbox?c=${c.id}`}
              className="card-hover flex items-center gap-4"
            >
              <div className="avatar-md">{initial}</div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold truncate">{name}</div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500">
                  {ch?.platform && (
                    <span className={platformBadge(ch.platform)}>{ch.platform}</span>
                  )}
                  {c.language && <span className="badge-gray">{c.language}</span>}
                  {tags.map((t) => (
                    <span key={t} className="badge-blue">{t}</span>
                  ))}
                  <span>{msgCounts.get(c.id as string) ?? 0} messages</span>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs text-slate-400">
                  {new Date(c.last_message_at as string).toLocaleDateString()}
                </div>
                <div className={`text-[10px] ${c.status === "open" ? "text-emerald-600" : "text-slate-400"}`}>
                  {c.status as string}
                </div>
              </div>
            </a>
          );
        })}
        {contacts?.length === 0 && (
          <div className="card text-center py-12">
            <IconUser className="mx-auto h-8 w-8 text-slate-200" />
            <p className="mt-3 text-sm text-slate-400">
              {q ? `No contacts matching "${q}"` : "No contacts yet"}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

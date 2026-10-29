import Link from "next/link";
import { IconChannels, IconSearch, IconUser } from "@/components/icons";

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2";

/** Nobody has messaged the org yet: point to Channels. */
export function NoContacts({ orgId }: { orgId: string }) {
  return (
    <div className="card py-12 text-center">
      <span aria-hidden="true" className="inline-block text-slate-300"><IconUser className="h-8 w-8" /></span>
      <h2 className="mt-3 text-sm font-semibold text-slate-700">No contacts yet</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
        People appear here after they message one of your connected channels.
      </p>
      <Link href={`/app/${orgId}/channels`} className={`btn btn-sm mt-4 ${FOCUS}`}>
        <span aria-hidden="true"><IconChannels className="h-4 w-4" /></span>
        Connect a Channel
      </Link>
    </div>
  );
}

/** A search found nothing: repeat the query and offer to clear it. */
export function NoResults({ query, clearHref }: { query: string; clearHref: string }) {
  return (
    <div className="card py-12 text-center">
      <span aria-hidden="true" className="inline-block text-slate-300"><IconSearch className="h-8 w-8" /></span>
      <h2 className="mt-3 break-words text-sm font-semibold text-slate-700">
        No contacts match <span dir="auto">“{query}”</span>
      </h2>
      <p className="mt-1 text-sm text-slate-500">Check the spelling, or search by @username instead of name.</p>
      <Link href={clearHref} className={`btn-ghost btn-sm mt-4 ${FOCUS}`}>
        Clear Search
      </Link>
    </div>
  );
}

export function LoadError() {
  return (
    <div role="alert" className="card text-center">
      <p className="text-sm font-medium text-slate-700">Contacts couldn’t be loaded.</p>
      <p className="mt-1 text-sm text-slate-500">Refresh the page to try again. If it keeps happening, contact support.</p>
    </div>
  );
}

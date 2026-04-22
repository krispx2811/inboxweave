import "server-only";

/**
 * Fetch a contact's public profile from Instagram's Graph API.
 * Returns null on any failure — the enrichment is best-effort and
 * must never block the inbound pipeline.
 */
export async function fetchIgContactProfile(params: {
  accessToken: string;
  igUserId: string;
}): Promise<{ name?: string; username?: string; profilePicUrl?: string } | null> {
  const url = new URL(`https://graph.instagram.com/v21.0/${params.igUserId}`);
  url.searchParams.set("fields", "name,username,profile_pic");
  url.searchParams.set("access_token", params.accessToken);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const json = (await res.json()) as {
      name?: string;
      username?: string;
      profile_pic?: string;
    };
    return {
      name: json.name,
      username: json.username,
      profilePicUrl: json.profile_pic,
    };
  } catch {
    return null;
  }
}

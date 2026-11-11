/**
 * Manual checks for Comment-to-DM against a real Instagram test account.
 * Nothing here runs in production.
 *
 * Token: Meta dashboard → your app → Use cases → Instagram → API setup with
 * Instagram login → Generate token for a tester account. The use case must
 * include the instagram_business_manage_comments permission.
 *
 *   export IG_TOKEN=IGAA...
 *   node scripts/verify-comment-dm.mjs me
 *   node scripts/verify-comment-dm.mjs subscribe
 *   node scripts/verify-comment-dm.mjs subscribed
 *   node scripts/verify-comment-dm.mjs comments
 *   node scripts/verify-comment-dm.mjs public-reply <commentId> [body|query]
 *   node scripts/verify-comment-dm.mjs private-reply <commentId> [button|generic]
 *   node scripts/verify-comment-dm.mjs follow <igsid>
 *   node scripts/verify-comment-dm.mjs link <igsid> <https-url>
 */

const GRAPH = "https://graph.instagram.com/v21.0";
const token = process.env.IG_TOKEN;
if (!token) {
  console.error("Set IG_TOKEN first (see the comment at the top of this file).");
  process.exit(1);
}

async function call(method, path, { query = {}, body, tokenIn = method === "GET" ? "query" : "body" } = {}) {
  const url = new URL(`${GRAPH}/${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  if (tokenIn === "query") url.searchParams.set("access_token", token);
  const init = { method };
  if (method !== "GET") {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(tokenIn === "body" ? { ...body, access_token: token } : (body ?? {}));
  }
  const res = await fetch(url, init);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  console.log(text);
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function template(style, text, button) {
  if (style === "generic") {
    return { attachment: { type: "template", payload: { template_type: "generic", elements: [{ title: text.slice(0, 80), buttons: [button] }] } } };
  }
  return { attachment: { type: "template", payload: { template_type: "button", text, buttons: [button] } } };
}

const [cmd, a, b] = process.argv.slice(2);
switch (cmd) {
  case "me":
    await call("GET", "me", { query: { fields: "user_id,username" } });
    break;
  case "subscribe": {
    const me = await call("GET", "me", { query: { fields: "user_id" } });
    await call("POST", `${me.user_id}/subscribed_apps`, {
      query: { subscribed_fields: "messages,comments,messaging_postbacks" },
      tokenIn: "query",
    });
    break;
  }
  case "subscribed": {
    const me = await call("GET", "me", { query: { fields: "user_id" } });
    await call("GET", `${me.user_id}/subscribed_apps`);
    break;
  }
  case "comments": {
    const media = await call("GET", "me/media", { query: { fields: "id,caption,media_product_type,timestamp", limit: "3" } });
    for (const m of media.data ?? []) {
      await call("GET", `${m.id}/comments`, { query: { fields: "id,text,from,timestamp", limit: "5" } });
    }
    break;
  }
  case "public-reply":
    await call("POST", `${a}/replies`, { body: { message: "Sent you a DM 📩 (test)" }, tokenIn: b === "query" ? "query" : "body" });
    break;
  case "private-reply":
    await call("POST", "me/messages", {
      body: {
        recipient: { comment_id: a },
        message: template(b ?? "button", "Test: tap the button below.", {
          type: "postback",
          title: "Send me the link",
          payload: "cdm:00000000-0000-4000-8000-000000000000",
        }),
      },
    });
    break;
  case "follow":
    await call("GET", a, { query: { fields: "is_user_follow_business,username" } });
    break;
  case "link":
    await call("POST", "me/messages", {
      body: { recipient: { id: a }, message: template("button", "Here's your link 🎉 (test)", { type: "web_url", title: "Open link", url: b }) },
    });
    break;
  default:
    console.log("Commands: me, subscribe, subscribed, comments, public-reply, private-reply, follow, link");
}

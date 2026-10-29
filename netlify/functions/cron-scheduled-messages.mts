// Netlify scheduled function: sends due scheduled messages by calling the
// app's cron route with CRON_SECRET. Every 5 minutes keeps function usage
// low; a message scheduled for 10:02 goes out by 10:05.
export default async () => {
  const res = await fetch(`${process.env.URL}/api/cron/scheduled`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  const body = await res.text();
  console.log(`[cron] scheduled messages: HTTP ${res.status} ${body.slice(0, 200)}`);
  if (!res.ok) throw new Error(`scheduled messages cron failed: HTTP ${res.status}`);
};

export const config = { schedule: "*/5 * * * *" };

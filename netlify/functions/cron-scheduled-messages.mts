// Netlify scheduled function: sends due scheduled messages by calling the
// app's cron route with CRON_SECRET. Hourly, on the hour: a message
// scheduled for 9:05 goes out at 10:00.
export default async function sendScheduledMessages() {
  const res = await fetch(`${process.env.URL}/api/cron/scheduled`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  const body = await res.text();
  console.log(`[cron] scheduled messages: HTTP ${res.status} ${body.slice(0, 200)}`);
  if (!res.ok) throw new Error(`scheduled messages cron failed: HTTP ${res.status}`);
}

export const config = { schedule: "0 * * * *" };

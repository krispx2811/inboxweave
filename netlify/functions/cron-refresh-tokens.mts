// Netlify scheduled function: refreshes Instagram access tokens (valid 60
// days) once a day by calling the app's cron route with CRON_SECRET.
// 03:00 UTC is 07:00 in Oman, before the working day.
export default async function refreshTokens() {
  const res = await fetch(`${process.env.URL}/api/cron/refresh-tokens`, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  const body = await res.text();
  console.log(`[cron] refresh tokens: HTTP ${res.status} ${body.slice(0, 200)}`);
  if (!res.ok) throw new Error(`refresh tokens cron failed: HTTP ${res.status}`);
}

export const config = { schedule: "0 3 * * *" };

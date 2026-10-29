import "server-only";
import { timingSafeEqual } from "node:crypto";

/** Fail closed: true only when CRON_SECRET is set and sent as a Bearer token. */
export function isAuthorizedCron(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const theirs = Buffer.from(header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "", "utf8");
  const ours = Buffer.from(secret, "utf8");
  return theirs.length === ours.length && timingSafeEqual(theirs, ours);
}

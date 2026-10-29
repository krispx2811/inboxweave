import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * SSRF guards for outbound fetches to URLs that come from users or webhook
 * payloads. No "server-only" import so the pure helpers stay unit-testable.
 */

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => !Number.isInteger(n) || n > 255)) return null;
  return nums;
}

function isBlockedIPv4(ip: string): boolean {
  const o = parseIPv4(ip);
  if (!o) return true;
  const [a, b] = o as [number, number, number, number];
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 192 && b === 0 && o[2] === 0) return true; // 192.0.0.0/24 IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast
  return false;
}

/** Expand an IPv6 literal to 8 16-bit groups, or null if malformed. */
function parseIPv6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);

  // Trailing dotted-quad (e.g. ::ffff:127.0.0.1) → two hex groups.
  const lastColon = s.lastIndexOf(":");
  const tail = s.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    s =
      s.slice(0, lastColon + 1) +
      ((v4[0]! << 8) | v4[1]!).toString(16) +
      ":" +
      ((v4[2]! << 8) | v4[3]!).toString(16);
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (nums.length !== 8 || nums.some((n) => Number.isNaN(n))) return null;
  return nums;
}

function isBlockedIPv6(ip: string): boolean {
  const g = parseIPv6(ip);
  if (!g) return true;
  const embeddedV4 = () =>
    `${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`;

  if (g.every((x) => x === 0)) return true; // :: unspecified
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1 loopback
  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible)
  if (g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    return isBlockedIPv4(embeddedV4());
  }
  // 64:ff9b::/96 NAT64 — judge by the embedded IPv4.
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isBlockedIPv4(embeddedV4());
  }
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0]! & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0]! & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

/**
 * Pure check (no DNS): true when `ip` is an IP literal in a private,
 * loopback, link-local, CGNAT or otherwise non-public range. Malformed
 * input and non-IP strings return true (fail closed).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const bare = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  const family = isIP(bare.split("%")[0] ?? "");
  if (family === 4) return isBlockedIPv4(bare);
  if (family === 6) return isBlockedIPv6(bare);
  return true;
}

/**
 * Throws unless `url` is https and its host is (and resolves only to)
 * public addresses. Call right before every outbound fetch to a
 * user-supplied URL.
 */
export async function assertPublicHttpsUrl(url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }
  if (parsed.protocol !== "https:") throw new Error("URL must use https");
  if (parsed.username || parsed.password) throw new Error("URL must not contain credentials");

  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  host = host.replace(/\.+$/, "");
  if (!host) throw new Error("URL has no host");
  if (host === "localhost" || host.endsWith(".localhost")) {
    throw new Error("URL host is not allowed");
  }

  if (isIP(host)) {
    if (isPrivateOrReservedIp(host)) throw new Error("URL host is not a public address");
    return parsed;
  }

  let addrs: { address: string }[];
  try {
    addrs = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new Error("URL host does not resolve");
  }
  if (addrs.length === 0) throw new Error("URL host does not resolve");
  if (addrs.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new Error("URL host resolves to a non-public address");
  }
  return parsed;
}

const META_MEDIA_HOST_SUFFIXES = [".fbsbx.com", ".fbcdn.net", ".whatsapp.net", ".cdninstagram.com"];
const META_MEDIA_HOSTS = ["graph.facebook.com"];

/** Pure check: https URL on a Meta / WhatsApp / Facebook media CDN host. */
export function isMetaMediaUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) return false;
  if (parsed.port && parsed.port !== "443") return false;
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, "");
  return (
    META_MEDIA_HOSTS.includes(host) ||
    META_MEDIA_HOST_SUFFIXES.some((s) => host.endsWith(s))
  );
}

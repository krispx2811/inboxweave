/**
 * Deterministic avatar colors from a name or ID string.
 * Same string always gets the same color — no randomness.
 */

const PALETTE = [
  { bg: "bg-indigo-100", text: "text-indigo-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-purple-100", text: "text-purple-700" },
  { bg: "bg-cyan-100", text: "text-cyan-700" },
  { bg: "bg-pink-100", text: "text-pink-700" },
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-orange-100", text: "text-orange-700" },
  { bg: "bg-teal-100", text: "text-teal-700" },
  { bg: "bg-red-100", text: "text-red-700" },
  { bg: "bg-lime-100", text: "text-lime-700" },
];

function hashStr(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function avatarColor(name: string): { bg: string; text: string } {
  return PALETTE[hashStr(name) % PALETTE.length]!;
}

export function getInitials(name: string | null, fallback: string): string {
  if (name) {
    return name
      .split(" ")
      .map((w) => w[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }
  return fallback.slice(-2).toUpperCase();
}

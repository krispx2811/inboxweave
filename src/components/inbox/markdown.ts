/**
 * The AI writes a little Markdown (**bold**, "- bullets", "## headings").
 * Parse just that subset into plain data so a bubble can render it with
 * React elements: no HTML strings, so nothing in a message can inject markup.
 *
 * Pure and dependency-free so it can be unit-tested without a server context.
 */

export interface Inline {
  text: string;
  bold: boolean;
}

export type Block =
  | { kind: "p"; lines: Inline[][] }
  | { kind: "ul"; items: Inline[][] };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const HEADING = /^\s*#{1,6}\s+(.*)$/;
const STRONG = /\*\*(.+?)\*\*|__(.+?)__/g;

export function parseInline(line: string): Inline[] {
  // Links read fine as "label (url)" and the URL stays visible.
  const text = line.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, "$1 ($2)");
  const out: Inline[] = [];
  let last = 0;
  for (const match of text.matchAll(STRONG)) {
    const start = match.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), bold: false });
    out.push({ text: match[1] ?? match[2] ?? "", bold: true });
    last = start + match[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), bold: false });
  return out;
}

export function parseMarkdownLite(source: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      current = null;
      continue;
    }
    const bullet = BULLET.exec(raw);
    if (bullet) {
      if (current?.kind !== "ul") {
        current = { kind: "ul", items: [] };
        blocks.push(current);
      }
      current.items.push(parseInline(bullet[1] ?? ""));
      continue;
    }
    const heading = HEADING.exec(raw);
    const line = heading
      ? [{ text: (heading[1] ?? "").replace(/\*\*|__/g, ""), bold: true }]
      : parseInline(raw.trim());
    if (current?.kind !== "p") {
      current = { kind: "p", lines: [] };
      blocks.push(current);
    }
    current.lines.push(line);
  }
  return blocks;
}

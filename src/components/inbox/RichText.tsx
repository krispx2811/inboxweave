import { Fragment } from "react";
import { parseMarkdownLite, type Inline } from "./markdown";

function Line({ parts }: { parts: Inline[] }) {
  return parts.map((p, i) => (p.bold ? <strong key={i} className="font-semibold">{p.text}</strong> : <Fragment key={i}>{p.text}</Fragment>));
}

/**
 * A message body with bold, bullets and line breaks, rendered as React
 * elements (never as an HTML string). Each block picks its own direction so
 * an Arabic paragraph next to an English one both read correctly.
 */
export function RichText({ text }: { text: string }) {
  const blocks = parseMarkdownLite(text);
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-0.5 ps-5">
            {b.items.map((item, j) => (
              <li key={j} dir="auto">
                <Line parts={item} />
              </li>
            ))}
          </ul>
        ) : (
          <p key={i} dir="auto">
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Line parts={line} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}

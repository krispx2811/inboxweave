import { resolveTexts, TEXT_LABELS, TEXT_LIMITS, textFieldName } from "@/lib/comment-dm/texts";
import { TEXT_KEYS, type SavedTexts, type TextKey } from "@/lib/comment-dm/types";

// Button labels and the public reply are one line; the DMs get a textarea.
const ONE_LINE: ReadonlySet<TextKey> = new Set<TextKey>(["publicReply", "openingButton", "followedButton", "linkButton"]);

export function TextFields({ saved }: { saved: SavedTexts }) {
  const en = resolveTexts(saved, "en");
  const ar = resolveTexts(saved, "ar");
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold">Messages</h3>
        <p className="text-[10px] text-slate-400">
          People get the English or Arabic version, matching their comment. Clear a field to go back to the default.
        </p>
      </div>
      {TEXT_KEYS.map((key) => (
        <div key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Field label={`${TEXT_LABELS[key]} · English`} name={textFieldName("en", key)} value={en[key]} textKey={key} />
          <Field label={`${TEXT_LABELS[key]} · العربية`} name={textFieldName("ar", key)} value={ar[key]} textKey={key} rtl />
        </div>
      ))}
    </div>
  );
}

function Field({ label, name, value, textKey, rtl }: { label: string; name: string; value: string; textKey: TextKey; rtl?: boolean }) {
  const props = {
    className: ONE_LINE.has(textKey) ? "input" : "input min-h-[72px]",
    id: name,
    name,
    defaultValue: value,
    maxLength: TEXT_LIMITS[textKey],
    dir: rtl ? "rtl" : undefined,
  };
  return (
    <div>
      <label className="label" htmlFor={name}>{label}</label>
      {ONE_LINE.has(textKey) ? <input {...props} /> : <textarea {...props} />}
    </div>
  );
}

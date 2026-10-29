import { ImageResponse } from "next/og";

// Social preview for every page that doesn't define its own (Instagram, X,
// LinkedIn, iMessage link cards). Replaces /og-image.png, which never existed.
export const alt = "InboxWeave — AI auto-replies for Instagram DMs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #312e81 0%, #4f46e5 55%, #db2777 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700, opacity: 0.95 }}>InboxWeave</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1 }}>
            AI auto-replies for your Instagram DMs
          </div>
          <div style={{ display: "flex", fontSize: 32, opacity: 0.85 }}>
            Arabic & English · Your own prices and offers · Team inbox
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignSelf: "flex-start",
            fontSize: 30,
            fontWeight: 700,
            background: "rgba(255,255,255,0.16)",
            borderRadius: 999,
            padding: "12px 28px",
          }}
        >
          30 OMR / month · No setup fee
        </div>
      </div>
    ),
    size,
  );
}

import { ImageResponse } from "next/og";

// Social share preview (og:image / twitter:image). Reuses the identity spec v2
// mark geometry from apple-icon.tsx (translate 9.53 7.21, scale 0.9846) at
// 1200x630 — the standard OG canvas size most crawlers (Google, Facebook,
// X, LinkedIn, Slack, WhatsApp) expect.
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
          alignItems: "center",
          justifyContent: "center",
          background: "#0F172A",
        }}
      >
        <svg width={220} height={220} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
          <g transform="translate(9.53 7.21) scale(0.9846)">
            <path
              d="M26.78 8.24 A16 16 0 1 0 39.76 21.22"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={7}
            />
            <circle cx="37.44" cy="10.56" r="4.2" fill="#EA580C" />
          </g>
        </svg>
      </div>
    ),
    { ...size }
  );
}

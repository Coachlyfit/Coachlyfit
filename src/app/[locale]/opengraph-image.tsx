import { ImageResponse } from "next/og";

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
          alignItems: "center",
          justifyContent: "center",
          background: "#0F172A",
          gap: 32,
        }}
      >
        <svg width={140} height={140} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: "#FFFFFF",
              fontFamily: "sans-serif",
              letterSpacing: "-0.02em",
            }}
          >
            Coachlyfit
          </span>
          <span
            style={{
              fontSize: 22,
              color: "#94A3B8",
              fontFamily: "sans-serif",
            }}
          >
            Coach your clients your way
          </span>
        </div>
      </div>
    ),
    { ...size }
  );
}

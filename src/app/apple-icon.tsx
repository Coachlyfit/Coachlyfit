import { ImageResponse } from "next/og";

// apple-icon only accepts raster output (.png/.jpg) — see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md.
// Reproduces public/brand/app-icon.svg's identity spec v2 geometry (translate 9.53 7.21,
// scale 0.9846 — the published, measured optical centre; see brand id/README.md,
// "Optical centre") as ImageResponse JSX, since SVG isn't a valid apple-icon source.
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg width={64} height={64} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect width="64" height="64" rx="15" fill="#0F172A" />
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
    ),
    { ...size }
  );
}

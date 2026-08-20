import { IBM_Plex_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";

// One family for Arabic + Latin so there is no fallback seam where a
// decorative Latin face silently drops to a system Arabic font mid-heading.
export const fontSans = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

// Every numeral is mono, in both scripts — prices, weights, dates, counts,
// IDs, percentages, times. Arabic sans has no tabular figures worth the
// name, so a column of numbers needs this to stay aligned.
export const fontMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

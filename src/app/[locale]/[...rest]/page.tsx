import { notFound } from "next/navigation";

// Unknown localized routes land here so they render [locale]/not-found.tsx
// (inside the locale layout) instead of Next's default 404.
export default function CatchAll() {
  notFound();
}

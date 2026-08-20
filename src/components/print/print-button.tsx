"use client";

import { Printer } from "lucide-react";

/** print:hidden -- the button itself must not show up in the printed
 * output/PDF, only trigger it. No PDF library, no headless browser: the
 * browser's own print dialog (which offers "Save as PDF" on every major
 * platform) is the export, same as the roadmap's "lazy version" call. */
export function PrintButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden fixed end-4 top-4 flex items-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-black/80"
    >
      <Printer className="size-4" />
      {label}
    </button>
  );
}

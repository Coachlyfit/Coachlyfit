import type { ReactNode } from "react";

/** next-intl rich-text tag for numerals: every number on the client home is
 * IBM Plex Mono. dir="ltr" keeps signs and "%" from reordering in RTL. */
export const num = (chunks: ReactNode) => (
  <span dir="ltr" className="font-mono tabular-nums">
    {chunks}
  </span>
);

export const bold = (chunks: ReactNode) => <b className="font-semibold text-foreground">{chunks}</b>;

"use client";

import { useEffect } from "react";
import { usePageTitleStore } from "./page-title-store";

/** Drop at the top of any (coach)/(admin) page to put its heading in the
 * Topbar instead of rendering a content-area `<h1>`. Server pages that fetch
 * async data (a client's name, a program's title) still compute the string
 * server-side and pass it in as a prop — this component is the only client
 * boundary, so the page itself stays a server component. */
export function PageTitle({ title, subtitle }: { title: string; subtitle?: string | null }) {
  const set = usePageTitleStore((s) => s.set);

  useEffect(() => {
    set(title, subtitle);
    return () => set("", null);
  }, [title, subtitle, set]);

  return null;
}

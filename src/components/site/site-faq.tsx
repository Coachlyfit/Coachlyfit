"use client";

import { Accordion } from "@base-ui/react/accordion";
import { useTranslations } from "next-intl";
import type { SiteView } from "@/domain/sites/public-site";
import { PlusIcon } from "./icons";

/** Accordion (Base UI, the primitive under our shadcn Accordion) with the
 * site's 56px rows. Only entries with a question are shown. */
export function SiteFaq({ view }: { view: SiteView }) {
  const t = useTranslations("site.faq");
  const items = view.content.faq.filter((f) => f.q.trim() !== "");

  return (
    <section id="faq" className="cs-sec cs-faq">
      <h2 className="cs-h2 cs-reveal">{t("title")}</h2>
      <Accordion.Root className="cs-faq-list">
        {items.map((f, i) => (
          <Accordion.Item key={i} value={String(i)} className="cs-faq-item cs-reveal">
            <Accordion.Header render={<h3 style={{ margin: 0, font: "inherit" }} />}>
              <Accordion.Trigger className="cs-faq-trigger">
                {f.q}
                <PlusIcon />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Panel className="cs-faq-panel">
              <p>{f.a}</p>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}

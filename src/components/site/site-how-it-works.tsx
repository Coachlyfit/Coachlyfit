import { useTranslations } from "next-intl";
import type { SiteView } from "@/domain/sites/public-site";

export function SiteHowItWorks({ view }: { view: SiteView }) {
  const t = useTranslations("site.how");
  const defaults = [
    { title: t("defaults.step1Title"), text: t("defaults.step1Text") },
    { title: t("defaults.step2Title"), text: t("defaults.step2Text") },
    { title: t("defaults.step3Title"), text: t("defaults.step3Text") },
  ];
  // A step the coach left blank shows the stock wording; one they filled in
  // is shown exactly as written.
  const steps = view.content.how.map((s, i) => ({
    title: s.title.trim() || defaults[i].title,
    text: s.text.trim() || (s.title.trim() ? "" : defaults[i].text),
  }));

  return (
    <section id="how" className="cs-sec">
      <h2 className="cs-h2 cs-reveal">{t("title")}</h2>
      <ol className="cs-steps" style={{ listStyle: "none", padding: 0 }}>
        {steps.map((s, i) => (
          <li key={i} className="cs-step cs-reveal">
            <span className="cs-mono">{String(i + 1).padStart(2, "0")}</span>
            <h3>{s.title}</h3>
            {s.text && <p>{s.text}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

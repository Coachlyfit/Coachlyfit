import type { AppLocale } from "@/i18n/routing";
import type { LegalSlug } from "./constants";
import type { LegalDoc } from "./types";
import { terms as termsAr } from "./ar/terms";
import { privacy as privacyAr } from "./ar/privacy";
import { cookies as cookiesAr } from "./ar/cookies";
import { acceptableUse as acceptableUseAr } from "./ar/acceptable-use";
import { billing as billingAr } from "./ar/billing";
import { terms as termsEn } from "./en/terms";
import { privacy as privacyEn } from "./en/privacy";
import { cookies as cookiesEn } from "./en/cookies";
import { acceptableUse as acceptableUseEn } from "./en/acceptable-use";
import { billing as billingEn } from "./en/billing";

export { LEGAL_SLUGS, LEGAL_VERSION, LEGAL_CONTACT_EMAIL, isLegalSlug, type LegalSlug } from "./constants";
export type { LegalDoc, LegalSection } from "./types";

const DOCS: Record<AppLocale, Record<LegalSlug, LegalDoc>> = {
  ar: { terms: termsAr, privacy: privacyAr, cookies: cookiesAr, "acceptable-use": acceptableUseAr, billing: billingAr },
  en: { terms: termsEn, privacy: privacyEn, cookies: cookiesEn, "acceptable-use": acceptableUseEn, billing: billingEn },
};

export function getLegalDoc(slug: LegalSlug, locale: AppLocale): LegalDoc {
  return DOCS[locale][slug];
}

export const LEGAL_SLUGS = ["terms", "privacy", "cookies", "acceptable-use", "billing"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export function isLegalSlug(value: string): value is LegalSlug {
  return (LEGAL_SLUGS as readonly string[]).includes(value);
}

/** Date the legal pages last changed. Shown as "last updated" and stored on a
 * profile at signup (profiles.terms_version), so bump it on every edit. */
export const LEGAL_VERSION = "2026-10-13";

// TODO: the legal@ mailbox is not created yet.
export const LEGAL_CONTACT_EMAIL = "legal@coachlyfit.app";

export const LEGAL_DOMAIN = "coachlyfit.app";

export const LEGAL_OPERATOR = {
  name_ar: "معاذ عواجة",
  name_en: "Moath K. Awaja",
} as const;

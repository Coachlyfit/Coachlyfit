import { LEGAL_CONTACT_EMAIL } from "../constants";
import type { LegalDoc } from "../types";

export const acceptableUse: LegalDoc = {
  title: "Acceptable Use Policy",
  description: "What you may and may not do on Coachly Fit.",
  sections: [
    {
      id: "intro",
      heading: "1. Purpose",
      paragraphs: [
        "This policy applies to every admin, coach, client and team member. Breaking it can lead to suspension or closure of your account.",
        "If the Arabic and English versions differ, the Arabic version prevails.",
      ],
    },
    {
      id: "prohibited",
      heading: "2. You must not",
      items: [
        "Break the law or upload unlawful, abusive, hateful or sexually explicit content.",
        "Add a person's data, including health data or photos, without their consent (and a guardian's consent if they are under 18).",
        "Harass, threaten or impersonate anyone, or pretend to be Coachly Fit.",
        "Try to access another account or data that is not yours, or get around security, access limits or plan limits.",
        "Scrape, copy, reverse engineer or overload the service.",
        "Send spam or unsolicited bulk messages through the service.",
        "Share your login, or resell access to the service.",
        "Upload malware or anything that could harm the service or its users.",
      ],
    },
    {
      id: "medical",
      heading: "3. Health and safety content",
      paragraphs: [
        "Coaches must not present their programs or nutrition plans as medical treatment, or give advice they are not qualified to give.",
      ],
    },
    {
      id: "enforcement",
      heading: "4. Enforcement",
      paragraphs: [
        "We may remove content, suspend or close accounts, and report unlawful activity to the authorities. Where reasonable we will tell you why.",
      ],
    },
    {
      id: "report",
      heading: "5. Report a problem",
      paragraphs: [`Email ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
};

import { LEGAL_CONTACT_EMAIL, LEGAL_DOMAIN } from "../constants";
import type { LegalDoc } from "../types";

export const cookies: LegalDoc = {
  title: "Cookie Policy",
  description: "The cookies and browser storage Coachly Fit uses, and why no consent banner is needed.",
  sections: [
    {
      id: "summary",
      heading: "1. In short",
      paragraphs: [
        "Coachly Fit uses only the cookies and browser storage it needs to work and to remember your choices. We use no analytics, advertising or tracking scripts. Because of that we do not show a cookie consent banner.",
        "If the Arabic and English versions differ, the Arabic version prevails.",
      ],
    },
    {
      id: "necessary",
      heading: "2. Strictly necessary",
      items: [
        `Sign-in cookie (set by Supabase): keeps you signed in. It is shared across ${LEGAL_DOMAIN} and its subdomains.`,
        "impersonating: set only for platform admins who are supporting an account, to show a banner.",
      ],
    },
    {
      id: "preferences",
      heading: "3. Preferences you choose",
      items: [
        "NEXT_LOCALE (cookie): remembers your language.",
        "theme (browser storage): remembers light or dark mode.",
        "messages:context-panel (browser storage, coaches): remembers whether the inbox side panel is open.",
        "coachly:launch-sweep-played (session storage): plays the logo animation once per browser tab.",
      ],
    },
    {
      id: "push",
      heading: "4. Push notifications",
      paragraphs: [
        "If you opt in, your browser registers a push subscription with its own push service so we can send notifications. You can turn this off in your browser at any time.",
      ],
    },
    {
      id: "third-party",
      heading: "5. Third-party video",
      paragraphs: [
        "Exercise videos from YouTube or Vimeo play inside the app. We load them in privacy-enhanced mode (youtube-nocookie.com, and Vimeo's do-not-track setting). These providers may still receive your IP address when you play a video.",
      ],
    },
    {
      id: "control",
      heading: "6. Your control",
      paragraphs: [
        "You can delete cookies and site data in your browser settings. Doing so signs you out and resets the preferences above. If we ever add analytics or advertising we will ask for your consent first and update this page.",
      ],
    },
    {
      id: "contact",
      heading: "7. Contact",
      paragraphs: [`Questions: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
};

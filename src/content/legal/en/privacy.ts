import { LEGAL_CONTACT_EMAIL, LEGAL_OPERATOR } from "../constants";
import type { LegalDoc } from "../types";

export const privacy: LegalDoc = {
  title: "Privacy Policy",
  description:
    "What personal data Coachly Fit holds, why, who processes it, and the rights you have under Egyptian PDPL No. 151 of 2020.",
  sections: [
    {
      id: "who",
      heading: "1. Who we are",
      paragraphs: [
        `Coachly Fit is operated by ${LEGAL_OPERATOR.name_en}, an individual based in Egypt. This policy follows Egypt's Personal Data Protection Law No. 151 of 2020 (the "PDPL").`,
        "If the Arabic and English versions differ, the Arabic version prevails.",
      ],
    },
    {
      id: "roles",
      heading: "2. Our role: controller and processor",
      items: [
        "For coach and team-member data (account, subscription, billing and usage), Coachly Fit is the controller.",
        "For client data that a coach enters or collects, the coach decides why and how it is used and Coachly Fit is the processor, acting on the coach's behalf. A client who wants to exercise their rights over that data should first contact their coach.",
      ],
    },
    {
      id: "data",
      heading: "3. Data we hold",
      items: [
        "Account data: name, email address, phone number, language, and the role of the account.",
        "Subscription data: plan, trial and billing dates, and payment records kept for the service.",
        "Client data entered by coaches or clients: contact details, forms and check-in answers, workouts, nutrition logs, messages and voice notes.",
        "Health data: body weight, body measurements and progress photos.",
        "Usage data: when you were last active, and email delivery events such as bounces and unsubscribes.",
      ],
    },
    {
      id: "purposes",
      heading: "4. Why we use it",
      items: [
        "To provide the service: sign-in, programs, check-ins, messages, billing.",
        "To send service emails and notifications you have not turned off.",
        "To keep the service secure and prevent abuse.",
        "To meet legal obligations.",
      ],
    },
    {
      id: "health",
      heading: "5. Health data and consent",
      paragraphs: [
        "Health data is sensitive. The coach must get each client's explicit consent before collecting it, and a parent's or guardian's consent for a client under 18. Coaches under 18 are not allowed on the service. We use health data only to run the service for the coach and client concerned.",
      ],
    },
    {
      id: "processors",
      heading: "6. Who processes data for us",
      items: [
        "Supabase: database, sign-in and file storage. Our project is hosted in Ireland (eu-west-1).",
        "Vercel: hosting of the website and application.",
        "Brevo: sending email.",
        "YouTube and Vimeo: only when you play an exercise video that a coach has embedded. The browser push service of your device: only if you turn on push notifications.",
      ],
      paragraphs: [
        "These providers are located outside Egypt, so your data is transferred abroad to deliver the service. We do not sell personal data.",
      ],
    },
    {
      id: "retention",
      heading: "7. How long we keep it",
      items: [
        "Voice notes are deleted 30 days after they are sent. The message stays and shows as expired.",
        "Items a coach moves to the trash are permanently deleted 30 days later.",
        "Other data is kept while the account exists. When you ask us to delete your account we delete your personal data, except what the law requires us to keep.",
      ],
    },
    {
      id: "rights",
      heading: "8. Your rights",
      paragraphs: [
        `Under the PDPL you may ask to access, correct or delete your data, to restrict or object to its use, and to withdraw consent. There is no self-service button for deletion or export yet, so email ${LEGAL_CONTACT_EMAIL} and we will reply as soon as we can. You may also complain to Egypt's Personal Data Protection Center.`,
      ],
    },
    {
      id: "security",
      heading: "9. Security",
      paragraphs: [
        "Access to each coach's data is restricted at database level so one coach cannot see another's. Voice notes are stored privately and played through short-lived links. No system is perfectly secure, and we will notify you of a breach as the law requires.",
      ],
    },
    {
      id: "email",
      heading: "10. Email and unsubscribing",
      paragraphs: [
        "Coaches can turn off notification emails in Settings > Account. Outreach emails carry an unsubscribe link. Essential service emails, such as password resets and billing notices, cannot be turned off.",
      ],
    },
    {
      id: "changes",
      heading: "11. Changes",
      paragraphs: ["We will update this policy when our practices change. The date at the top shows the latest version."],
    },
    {
      id: "contact",
      heading: "12. Contact",
      paragraphs: [`Privacy questions and requests: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
};

import { LEGAL_CONTACT_EMAIL, LEGAL_DOMAIN, LEGAL_OPERATOR } from "../constants";
import type { LegalDoc } from "../types";

export const terms: LegalDoc = {
  title: "Terms of Service",
  description: "The rules for using Coachly Fit: accounts, roles, responsibilities, and governing law.",
  sections: [
    {
      id: "operator",
      heading: "1. Who we are",
      paragraphs: [
        `Coachly Fit (${LEGAL_DOMAIN}) is operated by ${LEGAL_OPERATOR.name_en}, an individual based in Egypt ("we", "us"). By creating an account or using the service you agree to these Terms, the Privacy Policy, the Cookie Policy, the Acceptable Use Policy and the Billing & Refund Policy.`,
        "If the Arabic and English versions of these documents differ, the Arabic version prevails.",
      ],
    },
    {
      id: "roles",
      heading: "2. Account types",
      items: [
        "Admin: platform staff who operate and support the service.",
        "Coach: a paying customer who uses Coachly Fit to manage their own clients.",
        "Client: a person invited by a coach to follow that coach's programs and check-ins.",
        "Team member: a person a coach invites to help run their account. Team members depend on the coach's plan.",
      ],
    },
    {
      id: "eligibility",
      heading: "3. Eligibility",
      items: [
        "Coaches and team members must be at least 18 years old.",
        "A client under 18 may be invited only with the consent of a parent or legal guardian, which the coach must obtain before sending the invitation.",
      ],
    },
    {
      id: "accounts",
      heading: "4. Your account",
      paragraphs: [
        "Give accurate information and keep your password secure. You are responsible for activity under your account. Tell us at once if you suspect unauthorised access.",
      ],
    },
    {
      id: "coach-responsibilities",
      heading: "5. Coach responsibilities",
      items: [
        "You decide what client data to collect and why. You are responsible for getting every client's consent, including consent for health data such as weight, body measurements and progress photos, and a guardian's consent for clients under 18.",
        "You are responsible for the accuracy of what you enter and for the programs, nutrition plans and advice you give. Coachly Fit is a management tool. Neither Coachly Fit nor its content provides medical advice.",
        "You are responsible for the team members you invite and for what they do in your account.",
        "Payments between you and your clients that you record in the app are between you and them. We are not a party to them and are not responsible for them.",
      ],
    },
    {
      id: "subscription",
      heading: "6. Subscription and payment",
      paragraphs: ["Plans, renewal, cancellation and refunds are described in the Billing & Refund Policy."],
    },
    {
      id: "acceptable-use",
      heading: "7. Acceptable use",
      paragraphs: ["You must follow the Acceptable Use Policy."],
    },
    {
      id: "content",
      heading: "8. Your content",
      paragraphs: [
        "You keep ownership of the content and data you add. You give us permission to store, process and display it only as needed to run the service for you and your clients.",
      ],
    },
    {
      id: "suspension",
      heading: "9. Suspension and termination",
      paragraphs: [
        "You can stop using the service at any time. We may suspend or close an account that breaks these Terms, puts other users at risk, or has an unpaid subscription. Where reasonable we will tell you why.",
      ],
    },
    {
      id: "availability",
      heading: "10. Availability",
      paragraphs: [
        "We work to keep the service available but do not guarantee it will be uninterrupted. We may put the service into maintenance mode from time to time.",
      ],
    },
    {
      id: "liability",
      heading: "11. Limitation of liability",
      paragraphs: [
        "The service is provided as is. To the extent Egyptian law allows, we are not liable for indirect or consequential loss, for loss of data caused by something outside our reasonable control, or for any harm resulting from fitness, nutrition or health advice given by a coach.",
      ],
    },
    {
      id: "changes",
      heading: "12. Changes to these Terms",
      paragraphs: [
        "We may update these Terms. The date at the top shows the latest version. If a change is significant we will tell you through the service or by email. Continuing to use the service after a change means you accept it.",
      ],
    },
    {
      id: "law",
      heading: "13. Governing law and courts",
      paragraphs: [
        "These Terms are governed by the laws of Egypt. The courts of Cairo have jurisdiction over any dispute.",
      ],
    },
    {
      id: "contact",
      heading: "14. Contact",
      paragraphs: [`Questions about these Terms: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
};

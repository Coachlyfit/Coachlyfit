import { LEGAL_CONTACT_EMAIL } from "../constants";
import type { LegalDoc } from "../types";

export const billing: LegalDoc = {
  title: "Billing & Refund Policy",
  description: "Plans, renewal, cancellation and refunds for Coachly Fit subscriptions.",
  sections: [
    {
      id: "plans",
      heading: "1. Plans",
      paragraphs: [
        "Coachly Fit is sold as a subscription for coaches on the Starter, Pro and Studio plans. Prices, client limits and included features are shown on the pricing page and in the app. A free trial, if offered, is shown when you sign up.",
        "If the Arabic and English versions differ, the Arabic version prevails.",
      ],
    },
    {
      id: "payment",
      heading: "2. Payment",
      paragraphs: [
        "You pay using the payment methods available at checkout. Your subscription renews at the end of each billing period until you cancel.",
      ],
    },
    {
      id: "unpaid",
      heading: "3. Unpaid subscriptions",
      paragraphs: [
        "If a renewal is not paid, your account moves to past due and keeps working for a grace period of 7 days. After that the subscription is cancelled and access to your account is restricted to the subscription page until you reactivate. Your data is not deleted because of non-payment alone.",
      ],
    },
    {
      id: "cancel",
      heading: "4. Cancelling",
      paragraphs: [
        "You can cancel at any time from Settings > Subscription. Your plan stays active until the end of the period you already paid for, then it stops and does not renew.",
      ],
    },
    {
      id: "refunds",
      heading: "5. Refunds",
      paragraphs: ["Payments are not refundable, including for unused time in a billing period."],
      items: [
        `Exception: if you were charged twice for the same period, or charged after you cancelled, we will refund the extra charge. Request it within 14 days of the charge by emailing ${LEGAL_CONTACT_EMAIL}.`,
      ],
    },
    {
      id: "changes",
      heading: "6. Changing plans",
      paragraphs: ["You can ask to change plan from Settings > Subscription."],
    },
    {
      id: "client-payments",
      heading: "7. Payments between coaches and clients",
      paragraphs: [
        "Coachly Fit lets a coach record what a client owes and has paid. These payments are between the coach and the client. We do not process them, and we are not responsible for them, for any dispute about them, or for any refund.",
      ],
    },
    {
      id: "contact",
      heading: "8. Contact",
      paragraphs: [`Billing questions: ${LEGAL_CONTACT_EMAIL}.`],
    },
  ],
};

import { z } from "zod";
import { RECIPIENT_FILTERS } from "@/domain/emails/recipients";

/** Outreach goes out one email at a time, so a single send stays small. */
export const MAX_LEADS_PER_SEND = 50;

const contentSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  direction: z.enum(["rtl", "ltr"]),
});

/** What "Send test to me" needs: the content only, the recipient is the
 * signed-in admin. `audience` picks the sender and footer the test goes out with. */
export const testEmailSchema = contentSchema.extend({ audience: z.enum(["coaches", "leads"]).optional() });
export type TestEmailInput = z.infer<typeof testEmailSchema>;

// Coach ids, never addresses: the send action looks the emails up itself.
export const campaignSchema = contentSchema
  .extend({
    filter: z.enum(RECIPIENT_FILTERS),
    coachIds: z.array(z.string().uuid()).max(500),
  })
  .refine((value) => value.filter !== "selected" || value.coachIds.length > 0, { path: ["coachIds"] });
export type CampaignInput = z.infer<typeof campaignSchema>;

// The cap is checked in the action, which answers with its own error code.
export const leadSendSchema = contentSchema.extend({ leadIds: z.array(z.string().uuid()).min(1).max(500) });

/** The composer form: the coach campaign fields plus the leads audience. On
 * send it is split into a campaignSchema or a leadSendSchema payload. */
export const composeSchema = contentSchema
  .extend({
    filter: z.enum([...RECIPIENT_FILTERS, "leads"]),
    coachIds: z.array(z.string().uuid()).max(500),
    leadIds: z.array(z.string().uuid()).max(500),
  })
  .refine((value) => value.filter !== "selected" || value.coachIds.length > 0, { path: ["coachIds"] })
  .refine((value) => value.filter !== "leads" || (value.leadIds.length > 0 && value.leadIds.length <= MAX_LEADS_PER_SEND), {
    path: ["leadIds"],
  });
export type ComposeInput = z.infer<typeof composeSchema>;

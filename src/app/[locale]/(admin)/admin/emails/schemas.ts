import { z } from "zod";
import { RECIPIENT_FILTERS } from "@/domain/emails/recipients";

const contentSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20000),
  direction: z.enum(["rtl", "ltr"]),
});

/** What "Send test to me" needs: the content only, the recipient is the
 * signed-in admin. */
export const testEmailSchema = contentSchema;
export type TestEmailInput = z.infer<typeof testEmailSchema>;

// Coach ids, never addresses: the send action looks the emails up itself.
export const campaignSchema = contentSchema
  .extend({
    filter: z.enum(RECIPIENT_FILTERS),
    coachIds: z.array(z.string().uuid()).max(500),
  })
  .refine((value) => value.filter !== "selected" || value.coachIds.length > 0, { path: ["coachIds"] });
export type CampaignInput = z.infer<typeof campaignSchema>;

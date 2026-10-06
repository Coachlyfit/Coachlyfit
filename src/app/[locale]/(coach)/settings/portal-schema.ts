import { z } from "zod";
import { SLUG_PATTERN } from "@/lib/tenant/portal-slug";

/** The portal tab's scalar fields. Saved by two existing actions
 * (updateSlugAction, updateDefaultCheckinTemplateAction), one per dirty field. */
export const portalSchema = z.object({
  slug: z.string().regex(SLUG_PATTERN),
  default_checkin_template_id: z.string().nullable(),
});

export type PortalFormInput = z.input<typeof portalSchema>;

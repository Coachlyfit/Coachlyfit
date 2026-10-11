import { z } from "zod";

// "" = use the Coachlyfit default for that slot.
const brandColor = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^#[0-9a-f]{6}$/)
  .or(z.literal(""));

/** Brand tab (Studio only). Shared by BrandFields and updateBrandingAction. */
export const brandSchema = z.object({
  brand_primary: brandColor,
  brand_accent: brandColor,
});

export type BrandFormInput = z.input<typeof brandSchema>;

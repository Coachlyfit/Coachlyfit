import { z } from "zod";
import { INVOICE_CURRENCIES } from "@/domain/billing/invoices";

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

/** Invoice header fields on coaches (20260929000001_invoices.sql). Shared by
 * BusinessProfileCard's form and updateBusinessProfileAction. */
export const businessProfileSchema = z.object({
  business_name: z.string().trim().min(1).max(120),
  address: optionalText(500),
  tax_number: optionalText(50),
  contact_phone: optionalText(30),
  contact_email: z.string().trim().email().optional().or(z.literal("")),
  default_currency: z.enum(INVOICE_CURRENCIES),
  default_tax_rate: z.coerce.number().min(0).max(100),
  logo_path: z.string().max(300).nullable(),
});

export type BusinessProfileFormInput = z.input<typeof businessProfileSchema>;

/** wa.me link from an E.164 number ("+201001234567"), with optional prefilled text. */
export function waLink(e164: string, text?: string): string {
  const digits = e164.replace(/\D/g, "");
  const query = text ? `?text=${encodeURIComponent(text)}` : "";
  return `https://wa.me/${digits}${query}`;
}

import { timingSafeEqual } from "node:crypto";

/** `Authorization: Bearer <CRON_SECRET>`, compared in constant time. An unset
 * secret never authorizes (the older cron routes would accept "Bearer
 * undefined"). */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

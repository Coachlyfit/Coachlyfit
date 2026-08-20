// Shared by the login action and every route-group layout guard, so the
// role -> home mapping lives in exactly one place.
export function roleHome(locale: string, role: string | undefined) {
  if (role === "admin") return `/${locale}/admin`;
  if (role === "client") return `/${locale}/c`;
  return `/${locale}/dashboard`;
}

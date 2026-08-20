/** Postgres error codes the library surfaces to the user, mapped to
 * `library.errors.*` i18n keys. Shared by the coach and admin actions so a
 * failed delete says why instead of silently reporting success. */
export function libraryErrorKey(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  // 23503 foreign_key_violation — program_items.exercise_id has no ON DELETE
  // clause (NO ACTION), so deleting an exercise used in a plan raises this.
  if (code === "23503") return "in_use";
  // 42501 insufficient_privilege — raised by the admin_* definer functions.
  if (code === "42501") return "forbidden";
  // 22023 invalid_parameter_value — "already global" / "not found" from the
  // promote functions.
  if (code === "22023") return "already_global";
  return "unknown";
}

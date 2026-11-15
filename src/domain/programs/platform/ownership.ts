/** Platform templates are the only program rows with `coach_id IS NULL`
 * (see 20261118000001_platform_templates.sql). Every write path that spreads a
 * parent's coach_id onto a child row goes through this, so an edit that
 * reaches a platform row fails loudly instead of inserting an ownerless
 * child. Coaches can't reach one anyway (RLS), but the type is `string | null`
 * and this is what narrows it. */
export function requireCoachId(row: { coach_id: string | null }): string {
  if (row.coach_id == null) throw new Error("platform_template_read_only");
  return row.coach_id;
}

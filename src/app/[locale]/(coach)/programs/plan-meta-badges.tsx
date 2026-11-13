import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { asPlanGoal, asPlanLevel, asPlanType } from "@/domain/programs/plan-meta";

/** Read-only chips for a program's type / goal / level. Equipment is left to
 * the detail view's edit dialog — on a card it is noise. Renders nothing for a
 * program with no metadata (every program that predates the columns). */
export function PlanMetaBadges({
  planType,
  goal,
  level,
}: {
  planType: string | null;
  goal: string | null;
  level: string | null;
}) {
  const tTypes = useTranslations("programs.planTypes");
  const tGoals = useTranslations("programs.goals");
  const tLevels = useTranslations("programs.levels");
  const type = asPlanType(planType);
  const g = asPlanGoal(goal);
  const l = asPlanLevel(level);
  if (!type && !g && !l) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {type && <Badge variant="secondary">{tTypes(type)}</Badge>}
      {g && <Badge variant="outline">{tGoals(g)}</Badge>}
      {l && <Badge variant="outline">{tLevels(l)}</Badge>}
    </div>
  );
}

import { daysWithSessions } from "@/domain/programs/day-sessions";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService, type ProgramTree } from "@/domain/programs/programs.service";
import { isAssisted, measurementFields } from "@/domain/library/measurement";
import { formatSetMeasures, measuresFromRow } from "@/domain/workouts/set-measures";
import { sortItemsBySections } from "@/domain/programs/day-sections";
import { pickLocale, type AppLocale } from "@/domain/locale";
import { formatDate } from "@/lib/format";
import { PrintButton } from "@/components/print/print-button";

export default async function PrintProgramPage({
  params,
}: {
  params: Promise<{ locale: AppLocale; programId: string }>;
}) {
  const { locale, programId } = await params;
  const t = await getTranslations("print");
  const tPrograms = await getTranslations("programs");
  const tBuilder = await getTranslations("programs.builder");
  const tMeasure = await getTranslations("measure");
  const supabase = await createClient();

  const tree = await new ProgramsService(supabase).getTree(programId);
  if (!tree) notFound();

  const clientName = tree.client_id
    ? (await supabase.from("clients").select("display_name").eq("id", tree.client_id).single()).data
        ?.display_name
    : null;

  const tActivity = await getTranslations("programs.activityDialog");
  const tNutrition = await getTranslations("programs.nutrition");
  const tRehab = await getTranslations("programs.rehab");
  const variantById = new Map(tree.diet_variants.map((v) => [v.id, v]));

  type PrintItem = ProgramTree["program_days"][number]["program_items"][number];
  /** The two value cells of a set row: what is measured (reps, a hold, a
   * distance...) and the load, if the exercise has one. */
  const setCells = (item: PrintItem, set: PrintItem["program_item_sets"][number]) => {
    const type = item.exercises.measurement_type;
    const fields = measurementFields(type, item.block);
    const measure =
      fields.includes("reps") && set.reps != null
        ? set.reps
        : formatSetMeasures(type, item.block, { ...measuresFromRow(set), weight: null }, tMeasure);
    const load = !fields.includes("weight")
      ? "—"
      : set.weight == null
        ? tBuilder("bodyweight")
        : isAssisted(type)
          ? tMeasure("assist", { value: Math.abs(set.weight) })
          : `${set.weight}kg`;
    return { measure, load };
  };

  return (
    <>
      <PrintButton label={t("button")} />

      <header className="mb-6 border-b border-black pb-4">
        <h1 className="text-2xl font-bold">{pickLocale(tree, locale)}</h1>
        <p className="mt-1 text-sm text-gray-700">
          {clientName ? t("preparedFor", { name: clientName }) : tPrograms("template")}
        </p>
        <p className="text-sm text-gray-700">
          {tree.end_date
            ? tPrograms("dateRange", { start: formatDate(tree.start_date, locale), end: formatDate(tree.end_date, locale) })
            : `${formatDate(tree.start_date, locale)} · ${tPrograms("ongoing")}`}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {daysWithSessions(tree.program_days).map((day) => {
          const orderedItems = sortItemsBySections(day.program_items, day.section_order);
          return (
          <section key={day.id} className={day.parent_day_id ? "ms-6 break-inside-avoid" : "break-inside-avoid"}>
            <h2 className="text-lg font-semibold">
              {day.parent_day_id ? tBuilder("sessionN", { n: day.day_index }) : tBuilder("dayN", { n: day.day_index })}
              {(day.label_ar || day.label_en) && (
                <span className="font-normal text-gray-700"> — {pickLocale(day, locale, "label")}</span>
              )}
            </h2>
            {day.program_items.length === 0 ? (
              <p className="mt-1 text-sm text-gray-500">{tBuilder("noItems")}</p>
            ) : (
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-400 text-start">
                    <th className="py-1 text-start font-medium">{tPrograms("itemDialog.exercise")}</th>
                    <th className="py-1 text-start font-medium">{t("set")}</th>
                    <th className="py-1 text-start font-medium">{t("reps")}</th>
                    <th className="py-1 text-start font-medium">{t("weight")}</th>
                    <th className="py-1 text-start font-medium">{t("rest")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    // Consecutive items sharing group_key get an A1/A2-style
                    // label — reorderItems already guarantees a group's
                    // members are contiguous, so a running letter per new
                    // group_key encountered is sufficient here too (same
                    // logic as the client workout screen's itemGroups).
                    const groupLetterByKey = new Map<string, string>();
                    let nextLetterIndex = 0;
                    const groupCounts = new Map<string, number>();
                    return orderedItems.map((item) => {
                      let label: string | null = null;
                      if (item.group_key) {
                        let letter = groupLetterByKey.get(item.group_key);
                        if (!letter) {
                          letter = String.fromCharCode(65 + nextLetterIndex);
                          nextLetterIndex++;
                          groupLetterByKey.set(item.group_key, letter);
                        }
                        const position = (groupCounts.get(item.group_key) ?? 0) + 1;
                        groupCounts.set(item.group_key, position);
                        label = `${letter}${position}`;
                      }
                      const exerciseCell = (
                        <>
                          {label && <span className="me-1 font-mono text-xs font-bold">{label}</span>}
                          {pickLocale(item.exercises, locale)}
                        </>
                      );
                      return item.program_item_sets.length === 0 ? (
                        <tr key={item.id} className="border-b border-gray-200">
                          <td className="py-1.5">{exerciseCell}</td>
                          <td colSpan={4} className="py-1.5 text-gray-500">
                            —
                          </td>
                        </tr>
                      ) : (
                        item.program_item_sets.map((set, i) => (
                          <tr key={set.id} className="border-b border-gray-200">
                            {i === 0 && (
                              <td className="py-1.5 align-top" rowSpan={item.program_item_sets.length}>
                                {exerciseCell}
                              </td>
                            )}
                            <td className="py-1.5 tabular-nums">{set.set_index}</td>
                            <td className="py-1.5 tabular-nums">
                              {setCells(item, set).measure}
                            </td>
                            <td className="py-1.5 tabular-nums">
                              {setCells(item, set).load}
                            </td>
                            <td className="py-1.5 tabular-nums">{set.rest_seconds ? `${set.rest_seconds}s` : "—"}</td>
                          </tr>
                        ))
                      );
                    });
                  })()}
                </tbody>
              </table>
            )}

            {day.program_activities.length > 0 && (
              <ul className="mt-2 flex flex-col gap-0.5 text-sm">
                {day.program_activities.map((activity) => (
                  <li key={activity.id}>
                    {tActivity(activity.kind === "cardio" ? "kindCardio" : "kindRecovery")}
                    {" — "}
                    {tActivity(`modalities.${activity.modality}`)}
                    {activity.duration_min ? ` · ${activity.duration_min}${tActivity("minShort")}` : ""}
                    {activity.distance_km ? ` · ${activity.distance_km}km` : ""}
                  </li>
                ))}
              </ul>
            )}

            {day.diet_plan_id && variantById.get(day.diet_plan_id) && (
              <p className="mt-1 text-sm text-gray-700">
                {tNutrition("title")}: {pickLocale(variantById.get(day.diet_plan_id), locale)}
              </p>
            )}

            {(day.notes_ar || day.notes_en) && (
              <p className="mt-1 text-sm italic text-gray-700">{pickLocale(day, locale, "notes")}</p>
            )}
          </section>
          );
        })}
      </div>

      {tree.rehab_protocols.length > 0 && (
        <div className="mt-6 flex flex-col gap-4 border-t border-black pt-4">
          <h2 className="text-lg font-semibold">{tRehab("title")}</h2>
          {tree.rehab_protocols.map((protocol) => (
            <section key={protocol.id} className="break-inside-avoid text-sm">
              <p className="font-medium">{protocol.body_area}</p>
              {(protocol.injury_ar || protocol.injury_en) && (
                <p className="text-gray-700">{pickLocale(protocol, locale, "injury")}</p>
              )}
              {(protocol.restrictions_ar || protocol.restrictions_en) && (
                <p className="text-gray-700">{pickLocale(protocol, locale, "restrictions")}</p>
              )}
              {protocol.rehab_phases.length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5">
                  {protocol.rehab_phases.map((phase) => (
                    <li key={phase.id}>
                      {pickLocale(phase, locale)} — {tRehab("fromWeek")} {phase.from_week} {tRehab("toWeek")} {phase.to_week}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

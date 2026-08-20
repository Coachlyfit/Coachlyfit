import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { ProgramsService } from "@/domain/programs/programs.service";
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
  const supabase = await createClient();

  const tree = await new ProgramsService(supabase).getTree(programId);
  if (!tree) notFound();

  const clientName = tree.client_id
    ? (await supabase.from("clients").select("display_name").eq("id", tree.client_id).single()).data
        ?.display_name
    : null;

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
        {tree.program_days.map((day) => (
          <section key={day.id} className="break-inside-avoid">
            <h2 className="text-lg font-semibold">
              {tBuilder("dayN", { n: day.day_index })}
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
                  {day.program_items.map((item) =>
                    item.program_item_sets.length === 0 ? (
                      <tr key={item.id} className="border-b border-gray-200">
                        <td className="py-1.5">{pickLocale(item.exercises, locale)}</td>
                        <td colSpan={4} className="py-1.5 text-gray-500">
                          —
                        </td>
                      </tr>
                    ) : (
                      item.program_item_sets.map((set, i) => (
                        <tr key={set.id} className="border-b border-gray-200">
                          {i === 0 && (
                            <td className="py-1.5 align-top" rowSpan={item.program_item_sets.length}>
                              {pickLocale(item.exercises, locale)}
                            </td>
                          )}
                          <td className="py-1.5 tabular-nums">{set.set_index}</td>
                          <td className="py-1.5 tabular-nums">{set.reps}</td>
                          <td className="py-1.5 tabular-nums">
                            {set.weight != null ? `${set.weight}kg` : tBuilder("bodyweight")}
                          </td>
                          <td className="py-1.5 tabular-nums">{set.rest_seconds ? `${set.rest_seconds}s` : "—"}</td>
                        </tr>
                      ))
                    )
                  )}
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

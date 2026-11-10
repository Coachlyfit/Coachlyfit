import { getTranslations } from "next-intl/server";

// The list itself lives in forms/layout.tsx so it stays mounted beside an
// open form on desktop. This is the empty right-hand pane (lg only; on mobile
// the list is the whole screen).
export default async function ClientFormsPage() {
  const t = await getTranslations("forms.clientList");
  return (
    <div className="hidden min-h-64 items-center justify-center rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground lg:flex">
      {t("pickForm")}
    </div>
  );
}

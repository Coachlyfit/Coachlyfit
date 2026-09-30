import { getTranslations } from "next-intl/server";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("common.notFound");

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
      <div className="flex flex-col gap-1.5">
        <p className="text-lg font-semibold">{t("title")}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Link href="/" className={buttonVariants()}>
        {t("backHome")}
      </Link>
    </div>
  );
}

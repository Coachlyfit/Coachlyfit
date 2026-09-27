import { ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";

export function ScrollToBottomPill({
  show,
  count,
  onClick,
}: {
  show: boolean;
  count: number;
  onClick: () => void;
}) {
  const t = useTranslations("inbox");
  if (!show) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
      <button
        type="button"
        onClick={onClick}
        className="pointer-events-auto flex items-center gap-1.5 rounded-full bg-sidebar px-3 py-1.5 text-xs font-medium text-sidebar-foreground shadow-lg transition-transform hover:scale-105"
      >
        <ArrowDown className="size-3.5" aria-hidden="true" />
        {t("newMessages", { count })}
      </button>
    </div>
  );
}

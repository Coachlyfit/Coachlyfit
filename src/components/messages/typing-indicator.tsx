import { useTranslations } from "next-intl";

export function TypingIndicator({ show }: { show: boolean }) {
  const t = useTranslations("inbox");
  if (!show) return null;

  return (
    <div className="flex items-center gap-1.5 px-1 pb-1 text-xs text-muted-foreground" aria-live="polite">
      <span className="flex items-center gap-0.5">
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
        <span className="size-1 animate-bounce rounded-full bg-muted-foreground" />
      </span>
      {t("typing")}
    </div>
  );
}

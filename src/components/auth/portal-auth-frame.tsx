import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand/coach-brand";

/** What a client sees around the auth card on a coach's branded subdomain:
 * the coach's logo (Studio) and business name above, "powered by" below. Shared by the (auth)
 * layout and the settings live preview so the two can't drift. */
export function PortalAuthFrame({
  businessName,
  logoUrl,
  className,
  children,
}: {
  businessName: string;
  logoUrl?: string | null;
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("auth");

  return (
    <div className={cn("flex flex-col items-center gap-4", className)}>
      <div className="flex flex-col items-center gap-2 text-center">
        {logoUrl && <BrandLogo src={logoUrl} name={businessName} className="p-1.5" imgClassName="h-14 max-w-48" />}
        <p className="text-xl font-semibold tracking-tight">{businessName}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="text-xs text-muted-foreground">{t("poweredBy")}</p>
    </div>
  );
}

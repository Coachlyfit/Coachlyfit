import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AppLocale } from "@/domain/locale";
import { FormsListData } from "./forms-list-data";

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-36 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
      <Skeleton className="h-16 w-full rounded-2xl" />
    </div>
  );
}

export default async function ClientFormsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: AppLocale }>;
}) {
  const { locale } = await params;
  return (
    // data-wide: lets the client layout widen <main> on lg for the two-column view.
    <div data-wide className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <Suspense fallback={<ListSkeleton />}>
        <FormsListData locale={locale} />
      </Suspense>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

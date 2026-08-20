import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors ProgressSection's real layout — 4 KPI tiles + 2 charts — so the
 * Suspense fallback doesn't jump the page around when it resolves. */
export function ProgressSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

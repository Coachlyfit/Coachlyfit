import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors BillingSection's real layout — a subscription card plus a short
 * transaction list — so the Suspense fallback doesn't jump the page around
 * when it resolves. Same reasoning as WorkoutSkeleton/ProgressSkeleton. */
export function BillingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-28 w-full" />
      <Skeleton className="h-14 w-full" />
      <Skeleton className="h-14 w-full" />
    </div>
  );
}

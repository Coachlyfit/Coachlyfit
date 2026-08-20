import { Skeleton } from "@/components/ui/skeleton";

// Mirrors ClientProgressPage's real layout — hero card, checkin form, metric
// chart, photo row — so the fallback doesn't jump the page around when the
// four awaited Supabase calls in the page resolve.
export default function ClientProgressLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-36 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-64 w-full" />
      <div className="flex gap-2">
        <Skeleton className="h-20 flex-1" />
        <Skeleton className="h-20 flex-1" />
      </div>
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the client home: header card, weight card, stats, Today rows.
export default function Loading() {
  return (
    <div data-wide data-slot="client-home-skeleton" className="flex flex-col gap-4">
      <Skeleton className="h-56 w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <Skeleton className="h-72 w-full rounded-xl" />
        <div className="grid grid-cols-3 gap-2 lg:grid-cols-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-[14px] lg:h-14" />
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-[68px] w-full rounded-[14px]" />
          <Skeleton className="h-[84px] w-full rounded-[14px]" />
        </div>
      </div>
    </div>
  );
}

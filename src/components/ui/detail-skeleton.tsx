import { Skeleton } from "@/components/ui/skeleton";

export function DetailSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div data-slot="detail-skeleton" className="flex flex-col gap-6">
      <div data-slot="detail-skeleton-header" className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      {Array.from({ length: sections }).map((_, i) => (
        <Skeleton key={i} data-slot="detail-skeleton-section" className="h-40 w-full" />
      ))}
    </div>
  );
}

import { Skeleton } from "@/components/ui/skeleton";

export function DashboardSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <div data-slot="dashboard-skeleton" className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: stats }).map((_, i) => (
          <Skeleton key={i} data-slot="dashboard-skeleton-stat" className="h-24 w-full" />
        ))}
      </div>
      <Skeleton data-slot="dashboard-skeleton-chart" className="h-72 w-full" />
    </div>
  );
}

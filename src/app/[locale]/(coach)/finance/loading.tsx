import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-6 w-72 max-w-full" />
        </div>
        <div className="hidden gap-2 md:flex">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-36" />
        </div>
      </div>
      <Skeleton className="h-44 rounded-xl md:hidden" />
      <div className="hidden grid-cols-2 gap-4 md:grid xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-12 rounded-xl md:hidden" />
      <Card className="p-4">
        <TableSkeleton rows={6} columns={6} />
      </Card>
    </div>
  );
}

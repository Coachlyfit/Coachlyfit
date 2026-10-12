import { Skeleton } from "@/components/ui/skeleton";
import { TableSkeleton } from "@/components/ui/table-skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="flex gap-1.5 overflow-hidden md:gap-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 shrink-0 rounded-full md:h-8 md:rounded-md" />
        ))}
      </div>
      <div className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
        <TableSkeleton rows={5} columns={3} />
      </div>
    </div>
  );
}

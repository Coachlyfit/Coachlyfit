import { Skeleton } from "@/components/ui/skeleton";

function CardGrid({ count, min, height }: { count: number; min: string; height: string }) {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-7 w-32" />
      <div className={`grid gap-4 ${min}`}>
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className={`rounded-xl ${height}`} />
        ))}
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="size-10" />
          <Skeleton className="h-10 w-32" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-11 w-72 rounded-xl" />
        <Skeleton className="h-10 w-72" />
      </div>
      <CardGrid count={6} min="grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]" height="h-56" />
      <CardGrid count={3} min="grid-cols-[repeat(auto-fill,minmax(min(260px,100%),1fr))]" height="h-36" />
    </div>
  );
}

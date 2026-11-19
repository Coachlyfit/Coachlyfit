import { Skeleton } from "@/components/ui/skeleton";

// Skeleton rows on the editing side and a skeleton preview, matching the
// editor's two-column layout.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <div className="flex flex-wrap items-center gap-3">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-6 w-20" />
        <Skeleton className="ms-auto h-11.5 w-40" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[520px_minmax(0,1fr)]">
        <div className="flex flex-col gap-2">
          {Array.from({ length: 9 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-[640px] w-full rounded-2xl" />
      </div>
    </div>
  );
}

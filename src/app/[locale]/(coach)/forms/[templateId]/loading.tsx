import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-17 w-full rounded-xl" />
      <div className="flex items-start gap-4">
        <Skeleton className="h-96 w-60 shrink-0 rounded-xl max-lg:hidden" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 lg:mx-auto lg:max-w-160">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl lg:h-28" />
          ))}
        </div>
        <Skeleton className="h-96 w-80 shrink-0 rounded-xl max-lg:hidden" />
      </div>
    </div>
  );
}

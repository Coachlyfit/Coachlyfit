import { Skeleton } from "@/components/ui/skeleton";

export function ObservationsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  );
}

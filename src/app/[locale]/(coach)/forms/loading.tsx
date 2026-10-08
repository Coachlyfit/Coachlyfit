import { CardGridSkeleton } from "@/components/ui/card-grid-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <Skeleton className="h-9.5 w-full max-w-xl rounded-full" />
      <CardGridSkeleton />
    </div>
  );
}

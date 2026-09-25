import { Skeleton } from "@/components/ui/skeleton";

export function DecisionsSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

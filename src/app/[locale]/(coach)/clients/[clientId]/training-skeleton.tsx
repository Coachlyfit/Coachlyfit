import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Mirrors TrainingCard/NutritionCard's populated shape — title, a couple
 * of detail lines, action row — so the Suspense fallback doesn't jump the
 * two-column grid around when it resolves. */
export function TrainingSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-1/3" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

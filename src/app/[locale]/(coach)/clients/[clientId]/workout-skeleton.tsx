import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors WorkoutSection's real layout — a short list of session rows —
 * so the Suspense fallback doesn't jump the page around when it resolves. */
export function WorkoutSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </div>
  );
}

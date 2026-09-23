import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

/** Page-shaped, not the clients-list TableSkeleton it used to inherit —
 * this route has its own header/cards/tabs layout now, so the fallback
 * should look like that, not a table. */
export default function ClientDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent className="flex items-center gap-3">
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-9 w-full rounded-xl" />
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
      <Skeleton className="h-8 w-64 rounded-lg" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function HeaderActionsSkeleton() {
  return (
    <div className="flex flex-wrap gap-2">
      <Skeleton className="h-11.5 w-32" />
      <Skeleton className="h-11.5 w-32" />
    </div>
  );
}

export function AttentionSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-44 w-full rounded-xl" />
      ))}
    </div>
  );
}

function RowsSkeleton({ rows, className }: { rows: number; className?: string }) {
  return (
    <div className={className}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-10 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-8.5 w-16" />
        </div>
      ))}
    </div>
  );
}

export function InboxRowsSkeleton() {
  return <RowsSkeleton rows={6} className="flex flex-col gap-5 px-5 py-4" />;
}

export function SideCardSkeleton() {
  return (
    <Card className="gap-4 p-5">
      <Skeleton className="h-6 w-1/2" />
      <RowsSkeleton rows={3} className="flex flex-col gap-4" />
    </Card>
  );
}

export function HomeSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-5 w-56" />
        </div>
        <HeaderActionsSkeleton />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-48" />
        <AttentionSkeleton />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <Card className="gap-0 py-0">
          <div className="border-b border-border px-5 py-4">
            <Skeleton className="h-7 w-40" />
          </div>
          <InboxRowsSkeleton />
        </Card>
        <div className="flex flex-col gap-6">
          <SideCardSkeleton />
          <SideCardSkeleton />
        </div>
      </div>
    </div>
  );
}

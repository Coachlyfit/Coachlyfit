import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-295 flex-wrap items-start gap-8">
      <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-7">
        <Skeleton className="h-8 w-72 max-w-full" />
        <div className="grid gap-3 md:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl md:h-40" />
          ))}
        </div>
        <Skeleton className="h-11 w-full" />
      </div>
      <Skeleton className="h-80 min-w-0 flex-[2_1_320px] rounded-[18px]" />
    </div>
  );
}

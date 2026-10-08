import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Same frame as ConversationPane (full screen below lg, a column from lg up)
// so the header and composer don't jump when the thread arrives.
export default function Loading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background lg:static lg:z-auto lg:h-full">
      <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 px-3 py-4 lg:px-6">
        {["w-40", "w-56 self-end", "w-28 self-end", "w-48", "w-36 self-end"].map((shape, i) => (
          <Skeleton key={i} className={cn("h-11 rounded-2xl", shape)} />
        ))}
      </div>
      <div className="border-t border-border bg-card px-3 py-3 lg:px-4">
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}

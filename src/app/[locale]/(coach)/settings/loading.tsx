import { Skeleton } from "@/components/ui/skeleton";

// Mirrors the settings shell: tab row, then edit panel beside the preview.
export default function Loading() {
  return (
    <div className="flex flex-col gap-4 md:gap-5">
      <Skeleton className="h-10 w-72 max-w-full" />
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full max-md:hidden" />
      </div>
    </div>
  );
}

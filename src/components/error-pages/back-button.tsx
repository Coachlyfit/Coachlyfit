"use client";

import { useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

/** router.back(), rendered only when there is history to go back to. Starts
 * hidden so server and first client render match. */
export function BackButton({ label }: { label: string }) {
  const router = useRouter();
  const canGoBack = useSyncExternalStore(
    () => () => {},
    () => window.history.length > 1,
    () => false,
  );

  if (!canGoBack) return null;
  return (
    <Button type="button" variant="secondary" className="h-12 px-5 text-base" onClick={() => router.back()}>
      {label}
    </Button>
  );
}

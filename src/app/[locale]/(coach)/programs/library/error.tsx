"use client";

import { ErrorBoundaryFallback } from "@/components/error-boundary-fallback";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorBoundaryFallback error={error} reset={reset} />;
}

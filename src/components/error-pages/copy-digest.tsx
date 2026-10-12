"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyDigest({ value, copyLabel, copiedLabel }: { value: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-9"
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => setCopied(true), () => {});
      }}
    >
      <span aria-live="polite">{copied ? copiedLabel : copyLabel}</span>
    </Button>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { SiteDraft } from "@/domain/sites/site-content";

export type SaveState = "saved" | "saving" | "error";

export const AUTOSAVE_DELAY_MS = 800;

/** Debounced autosave for the draft. The edit is already applied locally (the
 * editor and the preview render from local state), so this is optimistic by
 * construction: `schedule()` only tells the server later. A failed save leaves
 * the local draft untouched and `retry()` sends the latest version again.
 * Edits made while a save is in flight are sent right after it settles. */
export function useAutosave(save: (content: SiteDraft) => Promise<{ error: string } | void>) {
  const [state, setState] = useState<SaveState>("saved");
  const latest = useRef<SiteDraft | null>(null);
  const sent = useRef<SiteDraft | null>(null);
  const inflight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});

  const mutation = useMutation({
    mutationFn: async (content: SiteDraft) => {
      const result = await save(content);
      if (result && "error" in result) throw new Error(result.error);
    },
    onSuccess: () => {
      if (latest.current === sent.current) setState("saved");
    },
    onError: () => setState("error"),
    onSettled: (_data, error) => {
      inflight.current = false;
      // Something changed while we were saving: send the newest version.
      if (!error && latest.current !== sent.current) flushRef.current();
    },
  });
  const { mutate } = mutation;

  useEffect(() => {
    flushRef.current = () => {
      const content = latest.current;
      if (!content || inflight.current) return;
      inflight.current = true;
      sent.current = content;
      mutate(content);
    };
  }, [mutate]);

  function schedule(content: SiteDraft) {
    latest.current = content;
    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      flushRef.current();
    }, AUTOSAVE_DELAY_MS);
  }

  function retry() {
    setState("saving");
    flushRef.current();
  }

  // Leaving the page mid-debounce shouldn't drop the last edit.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        flushRef.current();
      }
    },
    []
  );

  return { state, schedule, retry };
}

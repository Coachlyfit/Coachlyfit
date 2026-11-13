import { create } from "zustand";

export type HistoryView = "session" | "exercise" | "table";

// Lives outside the history tab's Suspense subtree: a filter change remounts
// that subtree (new key in page.tsx), and the coach's chosen view should
// survive it rather than snap back to "By session".
export const useHistoryViewStore = create<{ view: HistoryView; setView: (view: HistoryView) => void }>((set) => ({
  view: "session",
  setView: (view) => set({ view }),
}));

import { create } from "zustand";

type PageTitleState = {
  title: string | null;
  subtitle: string | null;
  set: (title: string, subtitle?: string | null) => void;
};

// Client-only title, set by each page via <PageTitle> after mount. Global
// singleton (not per-route state) is fine here: exactly one page is ever
// mounted under (coach)/layout.tsx at a time, and PageTitle's own effect
// clears the title on unmount so a stale title never survives a navigation
// that lands on a page which doesn't set one.
export const usePageTitleStore = create<PageTitleState>((set) => ({
  title: null,
  subtitle: null,
  set: (title, subtitle = null) => set({ title, subtitle }),
}));

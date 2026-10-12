import { create } from "zustand";
import type { AppLocale } from "@/domain/locale";

export type PreviewDevice = "desktop" | "mobile";

// Editor UI state only. The draft itself is server data and lives in the
// TanStack Query cache (see site-editor.tsx), never here.
type EditorState = {
  selectedId: string | null;
  previewLocale: AppLocale;
  device: PreviewDevice;
  select: (id: string | null) => void;
  setPreviewLocale: (locale: AppLocale) => void;
  setDevice: (device: PreviewDevice) => void;
};

export const useEditorStore = create<EditorState>((set) => ({
  selectedId: null,
  previewLocale: "ar",
  device: "desktop",
  select: (selectedId) => set({ selectedId }),
  setPreviewLocale: (previewLocale) => set({ previewLocale }),
  setDevice: (device) => set({ device }),
}));

import { create } from "zustand";
import type { FormField, FieldType } from "@/domain/forms/schema";

function newFieldId() {
  return `f_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultFieldFor(type: FieldType): FormField {
  const base = {
    id: newFieldId(),
    type,
    label: { ar: "", en: "" },
    required: false,
  };
  if (type === "select" || type === "multiselect" || type === "radio") {
    return {
      ...base,
      options: [
        { value: "option_1", label: { ar: "اختيار 1", en: "Option 1" } },
        { value: "option_2", label: { ar: "اختيار 2", en: "Option 2" } },
      ],
    } as FormField;
  }
  if (type === "scale") {
    return { ...base, min: 1, max: 5, step: 1 } as FormField;
  }
  return base as FormField;
}

type BuilderState = {
  fields: FormField[];
  selectedId: string | null;
  load: (fields: FormField[]) => void;
  addField: (type: FieldType) => void;
  updateField: (id: string, patch: Partial<FormField>) => void;
  removeField: (id: string) => void;
  reorder: (fromIndex: number, toIndex: number) => void;
  /** One step up (-1) or down (1); a no-op at either end. */
  moveField: (id: string, delta: -1 | 1) => void;
  select: (id: string | null) => void;
};

// Canvas state only — persistence (localStorage autosave, publish) lives in
// the page/component that owns a given template, not here, so this store
// stays reusable for both "new template" and "edit existing" without
// knowing which templateId it belongs to.
export const useBuilderStore = create<BuilderState>((set) => ({
  fields: [],
  selectedId: null,
  load: (fields) => set({ fields, selectedId: null }),
  addField: (type) =>
    set((state) => {
      const field = defaultFieldFor(type);
      return { fields: [...state.fields, field], selectedId: field.id };
    }),
  updateField: (id, patch) =>
    set((state) => ({
      fields: state.fields.map((f) => (f.id === id ? ({ ...f, ...patch } as FormField) : f)),
    })),
  removeField: (id) =>
    set((state) => ({
      fields: state.fields.filter((f) => f.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),
  reorder: (fromIndex, toIndex) =>
    set((state) => {
      const fields = [...state.fields];
      const [moved] = fields.splice(fromIndex, 1);
      fields.splice(toIndex, 0, moved);
      return { fields };
    }),
  moveField: (id, delta) =>
    set((state) => {
      const from = state.fields.findIndex((f) => f.id === id);
      const to = from + delta;
      if (from === -1 || to < 0 || to >= state.fields.length) return state;
      const fields = [...state.fields];
      [fields[from], fields[to]] = [fields[to], fields[from]];
      return { fields };
    }),
  select: (id) => set({ selectedId: id }),
}));

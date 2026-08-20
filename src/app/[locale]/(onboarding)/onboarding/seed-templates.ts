import type { FormKind, FormTemplateSchema } from "@/domain/forms/schema";

export type SeedTemplateKey = "intake" | "checkin" | "diet";

type SeedTemplate = {
  kind: FormKind;
  name_ar: string;
  name_en: string;
  schema: FormTemplateSchema;
};

const bilingual = (ar: string, en: string) => ({ ar, en });

/** The design's three starter templates (step 4). Real, publishable
 * form_template_versions schemas, not placeholders — a coach who picks one
 * gets something immediately usable, matching the design's "never show an
 * empty builder" note. */
export const SEED_TEMPLATES: Record<SeedTemplateKey, SeedTemplate> = {
  intake: {
    kind: "intake",
    name_ar: "نموذج الاشتراك",
    name_en: "Intake form",
    schema: {
      version: 1,
      fields: [
        { id: "primary_goal", type: "text", label: bilingual("الهدف الأساسي", "Primary goal"), required: true },
        { id: "medical_history", type: "textarea", label: bilingual("التاريخ المرضي", "Medical history"), required: false },
        { id: "injuries", type: "textarea", label: bilingual("الإصابات", "Injuries"), required: false },
        { id: "training_days", type: "number", label: bilingual("أيام التمرين المتاحة", "Available training days"), required: true, min: 0, max: 7 },
        { id: "height", type: "number", label: bilingual("الطول", "Height"), required: false, unit: "cm" },
        { id: "weight", type: "number", label: bilingual("الوزن الحالي", "Current weight"), required: false, unit: "kg" },
        { id: "equipment", type: "text", label: bilingual("المعدات المتاحة", "Available equipment"), required: false },
        { id: "sleep_hours", type: "number", label: bilingual("ساعات النوم", "Sleep hours"), required: false },
        { id: "notes", type: "textarea", label: bilingual("ملاحظات إضافية", "Additional notes"), required: false },
      ],
    },
  },
  checkin: {
    kind: "checkin",
    name_ar: "المتابعة الأسبوعية",
    name_en: "Weekly check-in",
    schema: {
      version: 1,
      fields: [
        { id: "weight", type: "number", label: bilingual("الوزن الحالي", "Current weight"), required: true, unit: "kg" },
        { id: "adherence", type: "scale", label: bilingual("الالتزام بالنظام", "Adherence to the plan"), required: true, min: 1, max: 10 },
        { id: "sleep_hours", type: "number", label: bilingual("ساعات النوم", "Sleep hours"), required: false },
        { id: "energy", type: "scale", label: bilingual("مستوى الطاقة", "Energy level"), required: false, min: 1, max: 5 },
        { id: "progress_photos", type: "photo", label: bilingual("صور التقدّم", "Progress photos"), required: false },
      ],
    },
  },
  diet: {
    kind: "diet",
    name_ar: "اليوميات الغذائية",
    name_en: "Diet diary",
    schema: {
      version: 1,
      fields: [
        { id: "meals_today", type: "textarea", label: bilingual("وجبات اليوم", "Today's meals"), required: true },
        { id: "water_liters", type: "number", label: bilingual("المياه", "Water"), required: false, unit: "L" },
        { id: "hunger", type: "scale", label: bilingual("الجوع من ١٠", "Hunger (out of 10)"), required: false, min: 1, max: 10 },
        { id: "food_photos", type: "photo", label: bilingual("صور الأكل", "Food photos"), required: false },
        { id: "cravings", type: "text", label: bilingual("رغبة شديدة في أكل معين", "Cravings"), required: false },
        { id: "notes", type: "textarea", label: bilingual("ملاحظات", "Notes"), required: false },
      ],
    },
  },
};

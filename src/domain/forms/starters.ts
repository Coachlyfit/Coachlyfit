import type { FormField, FormKind } from "./schema";

const text = (ar: string, en: string) => ({ ar, en });
const option = (value: string, ar: string, en: string) => ({ value, label: text(ar, en) });

/** What the "new form" page prefills per kind: a default name and the
 * suggested questions a coach can start from instead of an empty builder.
 * Static on purpose -- these are a starting point the coach edits, not data.
 * Only field types the builder already supports. */
export const FORM_STARTERS: Record<FormKind, { name: { ar: string; en: string }; fields: FormField[] }> = {
  intake: {
    name: text("استمارة التسجيل", "Onboarding form"),
    fields: [
      {
        id: "goal",
        type: "radio",
        label: text("الهدف الأساسي", "Primary goal"),
        required: true,
        options: [
          option("fat_loss", "خسارة دهون", "Fat loss"),
          option("muscle_gain", "بناء عضل", "Muscle gain"),
          option("general_fitness", "لياقة عامة", "General fitness"),
        ],
      },
      { id: "weight", type: "number", label: text("الوزن الحالي", "Current weight"), required: true, unit: "kg" },
      { id: "injuries", type: "textarea", label: text("إصابات أو أمراض؟", "Any injuries or conditions?"), required: false },
      {
        id: "training_days",
        type: "multiselect",
        label: text("أيام التمرين المتاحة", "Available training days"),
        required: true,
        options: [
          option("sat", "السبت", "Saturday"),
          option("sun", "الأحد", "Sunday"),
          option("mon", "الاثنين", "Monday"),
          option("tue", "الثلاثاء", "Tuesday"),
          option("wed", "الأربعاء", "Wednesday"),
          option("thu", "الخميس", "Thursday"),
          option("fri", "الجمعة", "Friday"),
        ],
      },
    ],
  },
  checkin: {
    name: text("المتابعة اليومية", "Daily check-in"),
    fields: [
      { id: "weight", type: "number", label: text("الوزن الصبح", "Morning weight"), required: false, unit: "kg" },
      { id: "sleep_hours", type: "number", label: text("ساعات النوم", "Hours of sleep"), required: true },
      { id: "energy", type: "scale", label: text("مستوى الطاقة", "Energy level"), required: true, min: 1, max: 5, step: 1 },
      {
        id: "meals_adherence",
        type: "radio",
        label: text("التزمت بالأكل النهارده؟", "Did you stick to your meals today?"),
        required: true,
        options: [
          option("full", "أيوه بالكامل", "Yes, fully"),
          option("partial", "جزئياً", "Partly"),
          option("no", "لأ", "No"),
        ],
      },
    ],
  },
  workout: {
    name: text("تقييم التمرين", "Workout feedback"),
    fields: [
      { id: "difficulty", type: "scale", label: text("صعوبة التمرين", "Workout difficulty"), required: true, min: 1, max: 5, step: 1 },
      {
        id: "pain",
        type: "radio",
        label: text("فيه ألم؟", "Any pain?"),
        required: true,
        options: [
          option("none", "لأ", "No"),
          option("mild", "ألم بسيط", "Mild"),
          option("yes", "أيوه", "Yes"),
        ],
      },
      { id: "notes", type: "textarea", label: text("ملاحظات", "Notes"), required: false },
    ],
  },
  diet: {
    name: text("استبيان التغذية", "Nutrition survey"),
    fields: [
      { id: "meals_per_day", type: "number", label: text("عدد الوجبات في اليوم", "Meals per day"), required: true },
      { id: "disliked_foods", type: "textarea", label: text("أطعمة مش بتحبها", "Foods you dislike"), required: false },
      {
        id: "allergies",
        type: "multiselect",
        label: text("حساسية من أطعمة؟", "Any food allergies?"),
        required: true,
        options: [
          option("none", "مفيش", "None"),
          option("dairy", "ألبان", "Dairy"),
          option("gluten", "جلوتين", "Gluten"),
          option("nuts", "مكسرات", "Nuts"),
          option("eggs", "بيض", "Eggs"),
          option("seafood", "مأكولات بحرية", "Seafood"),
        ],
      },
    ],
  },
  custom: { name: text("نموذج جديد", ""), fields: [] },
};

// Seeded demo site: "Coach Ahmed" with 3 services, 6 results, 5 reviews, in
// Arabic and English. Used by the dev-only preview route and by tests.
// This is fixture data for development, never shown on a real coach's site.
import type { SiteView } from "./public-site";
import { defaultDraft, type SiteContent } from "./site-content";
import { guardColors } from "./theme";

type Lang = "ar" | "en";

const COPY = {
  ar: {
    name: "كوتشي أحمد",
    title: "مدرب قوة وتغذية أونلاين",
    intro: "أساعدك تبني قوة حقيقية وعادات أكل تقدر تكمل عليها، بخطة مكتوبة لك ومتابعة كل أسبوع.",
    bio: "مدرب معتمد بقالي 7 سنين بشتغل مع ناس عندهم شغل وبيت ومواعيد صعبة. بركز على تمارين القوة الأساسية وأكل واقعي من البيت المصري، ومتابعة أسبوعية تخليك مكمل.",
    certs: ["NASM-CPT", "PN Level 1", "إسعافات أولية"],
    services: [
      { title: "تدريب شخصي أونلاين", description: "برنامج تدريب وتغذية مخصص لك، متابعة أسبوعية، وتواصل مباشر معايا.", price: 1500, unit: "month" as const, contactForPrice: false },
      { title: "خطة تغذية", description: "خطة أكل حسب هدفك وجدولك، فيها بدائل من الأكل اللي في بيتك.", price: 800, unit: "once" as const, contactForPrice: false },
      { title: "برنامج تدريب فقط", description: "برنامج 8 أسابيع جاهز تتابعه بنفسك من التطبيق.", price: null, unit: "once" as const, contactForPrice: true },
    ],
    how: [
      { title: "راسلني على واتساب", text: "احكيلي عن هدفك ومواعيدك وأي إصابات قديمة." },
      { title: "أكتب لك خطتك", text: "برنامج تدريب وأكل حسب هدفك والأدوات اللي عندك." },
      { title: "متابعة كل أسبوع", text: "تبعت تقدمك من التطبيق ونعدل الخطة مع بعض." },
    ],
    faq: [
      { q: "هل التدريب أونلاين بالكامل؟", a: "أيوه. الخطة والمتابعة والتواصل كلها من التطبيق وواتساب." },
      { q: "محتاج أشترك في جيم؟", a: "لا. أقدر أكتب برنامج للبيت بأدوات بسيطة أو برنامج للجيم." },
      { q: "إمتى هشوف نتيجة؟", a: "بيختلف من شخص لشخص. بنحط أهداف واقعية ونتابعها كل أسبوع." },
      { q: "إيه طرق الدفع؟", a: "تحويل بنكي، إنستاباي، أو فودافون كاش." },
      { q: "أقدر أوقف الاشتراك؟", a: "أيوه، تقدر توقفه قبل بداية الشهر الجديد." },
    ],
    reviews: [
      ["سارة م.", 5, "أول مرة ألتزم بخطة أكتر من شهر. المتابعة الأسبوعية فرقت معايا جدًا."],
      ["محمد ع.", 5, "البرنامج واضح ومناسب لمواعيد شغلي. بقيت أرفع أوزان ما كنتش متخيلها."],
      ["نور هـ.", 4, "الخطة مرنة وفيها أكل من بيتنا. كنت أتمنى مكالمات أكتر، بس الرد دايمًا سريع."],
      ["كريم س.", 5, "بيشرح السبب ورا كل تمرين، وده خلاني أفهم جسمي أكتر."],
      ["ليلى ف.", 5, "بعد سنين من البدايات اللي ما بتكملش، أخيرًا عندي روتين ثابت."],
    ] as const,
  },
  en: {
    name: "Coach Ahmed",
    title: "Online strength & nutrition coach",
    intro: "I help you build real strength and eating habits you can keep, with a plan written for you and a check-in every week.",
    bio: "Certified coach for 7 years, working with people who have jobs, families and tight schedules. I focus on core strength work, realistic home food and a weekly check-in that keeps you going.",
    certs: ["NASM-CPT", "PN Level 1", "First aid"],
    services: [
      { title: "1:1 online coaching", description: "Training and nutrition built for you, weekly check-ins and direct messages with me.", price: 1500, unit: "month" as const, contactForPrice: false },
      { title: "Nutrition plan", description: "A meal plan around your goal and schedule, with swaps from food you already eat.", price: 800, unit: "once" as const, contactForPrice: false },
      { title: "Program only", description: "An 8-week program you follow on your own in the app.", price: null, unit: "once" as const, contactForPrice: true },
    ],
    how: [
      { title: "Message me on WhatsApp", text: "Tell me your goal, your schedule and any old injuries." },
      { title: "I write your plan", text: "Training and nutrition built around your goal and the equipment you have." },
      { title: "Check in every week", text: "Send your progress in the app and we adjust the plan together." },
    ],
    faq: [
      { q: "Is coaching fully online?", a: "Yes. Your plan, check-ins and messages all happen in the app and on WhatsApp." },
      { q: "Do I need a gym?", a: "No. I can write a home program with simple equipment, or a gym program." },
      { q: "When will I see results?", a: "It depends on the person. We set realistic goals and track them every week." },
      { q: "How do I pay?", a: "Bank transfer, InstaPay or Vodafone Cash." },
      { q: "Can I pause?", a: "Yes, you can pause before the next month starts." },
    ],
    reviews: [
      ["Sara M.", 5, "First time I've stuck with a plan for more than a month. The weekly check-ins made the difference."],
      ["Mohamed A.", 5, "The program is clear and fits my work hours. I'm lifting weights I didn't think I could."],
      ["Nour H.", 4, "The plan is flexible and uses food we eat at home. I'd like more calls, but replies are always quick."],
      ["Karim S.", 5, "He explains the reason behind every exercise, so I understand my body better."],
      ["Laila F.", 5, "After years of false starts, I finally have a routine I keep."],
    ] as const,
  },
};

// weeks → days, kg change
const RESULTS: [number, number | null][] = [
  [12, -6],
  [8, -4],
  [16, 3],
  [10, null],
  [24, -12],
  [12, -5],
];

export type SampleOptions = {
  results?: number;
  reviews?: number;
  services?: number;
  longName?: boolean;
  noPhoto?: boolean;
  primary?: string;
  accent?: string;
};

export function sampleContent(lang: Lang, opts: SampleOptions = {}): SiteContent {
  const c = COPY[lang];
  const d = defaultDraft();
  d.hero = { title: c.title, intro: c.intro, mainButton: "whatsapp", whatsapp: "+201001234567", secondaryLabel: "" };
  d.about = { photoPath: null, bio: c.bio, certs: c.certs, years: 7, clients: 120 };
  d.services = c.services.slice(0, Math.max(1, Math.min(4, opts.services ?? 3)));
  d.how = c.how;
  d.faq = c.faq;
  d.socials = { instagram: "https://instagram.com/", tiktok: "https://tiktok.com/", youtube: "https://youtube.com/" };
  return d;
}

export function sampleView(lang: Lang, opts: SampleOptions = {}): SiteView {
  const c = COPY[lang];
  const name = opts.longName
    ? lang === "ar"
      ? "الكابتن عبد الرحمن محمد عبد العزيز الشناوي"
      : "Coach Abdelrahman Mohamed Abdelaziz El-Shennawy"
    : c.name;
  return {
    coachName: name,
    logoUrl: null,
    colors: guardColors(opts.primary, opts.accent),
    domain: "coachahmed.fit",
    content: sampleContent(lang, opts),
    photoUrl: null,
    usePlaceholderPhoto: !opts.noPhoto,
    results: RESULTS.slice(0, opts.results ?? 6).map(([weeks, kg], i) => ({
      id: `sample-result-${i}`,
      beforeUrl: null,
      afterUrl: null,
      durationDays: weeks * 7,
      weightDelta: kg,
    })),
    reviews: c.reviews.slice(0, opts.reviews ?? 5).map(([n, rating, text], i) => ({ id: `sample-review-${i}`, name: n, rating, text })),
  };
}

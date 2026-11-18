-- Landing page copy refresh, DRAFT ONLY.
--
-- Rewrites the draft in marketing_sections so the home page matches what the
-- app does today (see the audit in the PR / task notes). It never touches
-- marketing_page_versions, so the public page keeps showing the last
-- published version until an admin reviews this draft at /admin/site and
-- presses Publish.
--
-- Idempotent: re-running overwrites the same sections with the same copy.
-- It replaces the current draft content of every section it touches, so any
-- unpublished edits made in /admin/site beforehand are lost.
--
-- Order after this migration: hero, app_preview, stats (hidden), pain_points,
-- features, how_it_works, arabic_first, testimonials (hidden), pricing, faq,
-- final_cta. Stats and testimonials are hidden, not deleted: the numbers and
-- quotes in them had no source, and an admin can re-fill and show them.

-- hero ---------------------------------------------------------------------
update public.marketing_sections s
set
  content_ar = $j${"badge":"","title":"شغّل تدريبك زي البيزنس، مش زي جروب واتساب.","subtitle":"عملاء، نماذج متابعة، برامج تمرين ودايت، مواعيد وفواتير — في مكان واحد وبالعربي. وعميلك بيتابع كل ده من موبايله على بوابة ويب، من غير ما ينزّل تطبيق.","cta":"جرّب ١٤ يوم مجانًا","ctaSecondary":"شوف اللوحة","trialNote":"من غير كارت · بتلغي في أي وقت"}$j$::jsonb,
  content_en = $j${"badge":"","title":"Run your coaching like a business, not a WhatsApp group.","subtitle":"Clients, check-in forms, training and diet plans, appointments and invoices — in one place, in Arabic. Your clients follow it all from their phone on a web portal, with no app to download.","cta":"Start 14 days free","ctaSecondary":"See the dashboard","trialNote":"No card · cancel anytime"}$j$::jsonb,
  position = 1, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'hero';

-- app_preview: copy lives in messages (marketing.preview); only its place --
update public.marketing_sections s
set position = 2, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'app_preview';

-- stats: hidden (no real numbers to show) ----------------------------------
update public.marketing_sections s
set position = 3, is_visible = false, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'stats';

-- pain_points --------------------------------------------------------------
update public.marketing_sections s
set
  content_ar = $j${"eyebrow":"المشكلة","title":"شغلك متفرق على كذا حاجة مش متكلمين مع بعض.","subtitle":"وكل ما العملاء يزيدوا، الوقت اللي بيروح في التنسيق بيزيد أسرع من الفلوس.","cards":[{"label":"EXCEL","title":"شيت البرامج والأوزان","body":"نسخة لكل عميل، وكل تعديل بتعمله في عشر أماكن. ومحدش بيفتحه من الموبايل."},{"label":"WHATSAPP","title":"صور ومقاسات وأرقام","body":"مدفونة في شات من ٣٠٠ رسالة. عايز تقارن صورة الأسبوع ده بالشهر اللي فات؟ بالتوفيق."},{"label":"NOTES","title":"مين دفع ومين لأ","body":"في نوتة أو في دماغك. وبتكتشف الاشتراك اللي خلص بعد شهرين من غير ما تاخد بالك."},{"label":"DIET","title":"الدايت في ملف والتمرين في ملف","body":"خطة الأكل في PDF وبرنامج التمرين في شيت تاني، والعميل مش عارف يرجع لأنهي واحد."},{"label":"REVIEW","title":"متابعات من كل ناحية","body":"ردود الأسبوع جاية على الواتساب والإيميل والمكالمات، ومفيش مكان واحد تشوف منه مين محتاج تدخّل."},{"label":"CALENDAR","title":"مواعيد في كل حتة","body":"جلسات متفرقة بين الشات وتقويم الموبايل، وعميل بيحجز في وقت إنت مشغول فيه."}]}$j$::jsonb,
  content_en = $j${"eyebrow":"The problem","title":"Your work is split across several tools that don't talk to each other.","subtitle":"And the more clients you take on, the faster admin time grows compared to what you earn.","cards":[{"label":"EXCEL","title":"The program spreadsheet","body":"A copy per client, and every edit has to be made in ten places. Nobody opens it on a phone."},{"label":"WHATSAPP","title":"Photos, measurements, numbers","body":"Buried in a 300-message thread. Try comparing this week's photo to last month's — good luck."},{"label":"NOTES","title":"Who paid and who didn't","body":"In a notebook, or in your head. You find the lapsed subscription two months after it expired."},{"label":"DIET","title":"Diet in one file, training in another","body":"The meal plan is a PDF and the program is another sheet, and your client can't tell which one is current."},{"label":"REVIEW","title":"Check-ins from every direction","body":"Weekly replies arrive over WhatsApp, email and calls, and there is no single place to see who needs you."},{"label":"CALENDAR","title":"Appointments everywhere","body":"Sessions scattered across chats and your phone calendar, and a client booking a time you're already busy."}]}$j$::jsonb,
  position = 4, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'pain_points';

-- features: rows 1-3 keep their mock-ups (forms, progress, invoices); rows
-- 4-7 render as text only.
update public.marketing_sections s
set
  content_ar = $j${"rows":[
{"eyebrow":"النماذج","title":"ابني نموذج المتابعة مرة، وابعته لأي عميل.","body":"اسحب الحقول اللي عايزها — أرقام، مقياس التزام، صور تقدّم، تواريخ، وأسئلة اختيار. العميل بيفتح النموذج من موبايله جوه بوابته، والرد بيوصلك في صندوق المتابعات.","bullets":[{"text":"أسئلة بتظهر حسب إجابة العميل"},{"text":"قوالب جاهزة لاستمارة العميل الجديد والتمرين والدايت والمتابعة"},{"text":"ميعاد تسليم لكل نموذج بتبعته"},{"text":"مسودة ونسخة منشورة، فتعدّل من غير ما تبوّظ اللي اتبعت"}]},
{"eyebrow":"المتابعة","title":"تشوف مين ماشي كويس ومين محتاجك — من غير ما تسأل.","body":"كل متابعة أسبوعية بتوصلك في طابور مراجعة: تغيّر الوزن، الالتزام، النوم، التمارين اللي اتعملت، وأقدم وأحدث صورة تقدّم جنب بعض. وبعدها تختار: كمّل، عدّل، أو كلّمه — وتكتب ردّك للعميل.","bullets":[{"text":"وزن ومقاسات مخصصة وصور على خط زمني واحد"},{"text":"أرقام قياسية (PRs) بتتحسب من تمارين العميل"},{"text":"إشارات تلقائية زي ألم بيتكرر أو تكرارات ناقصة"},{"text":"سجل قراراتك بيوريك النتيجة بعدها"}]},
{"eyebrow":"الفواتير","title":"فاتورة محترمة بالعربي، ومتابعة واضحة للمدفوعات.","body":"اعمل باقات واشتراكات للعملاء، وسجّل كل دفعة وارفع إثبات التحويل، وأصدر فاتورة بالجنيه أو الريال أو الدرهم وابعتها على الإيميل. إنت اللي بتسجّل المدفوعات — إحنا مش بنعالج الدفع.","bullets":[{"text":"فاتورة عليها اسمك ولوجوك وبيانات الضريبة، وتتطبع أو تتحفظ PDF من المتصفح"},{"text":"وسائل دفع بتحددها إنت، زي إنستاباي أو كاش"},{"text":"اشتراكات العملاء: تجميد وإلغاء وتاريخ انتهاء"},{"text":"ملخص مالي بالشهر وبالعميل"}]},
{"eyebrow":"البرامج والتمارين","title":"ابني البرنامج بالسحب، والعميل يسجّل من موبايله.","body":"كوّن أيام البرنامج وتمارينه بالسحب والإفلات، وحدد المجموعات والتكرارات والوزن أو شدّة الجهد، وزوّد الأحمال أسبوع ورا أسبوع. والعميل بيسجّل كل مجموعة ويشغّل مؤقت الراحة، وبياناته بتتحفظ لو النت قطع وتتبعت لما يرجع.","bullets":[{"text":"سوبر سيت ودوائر وAMRAP وEMOM وتاباتا"},{"text":"تقدّم الأحمال وأسابيع تخفيف (Deload)"},{"text":"قوالب تحفظها وتوزعها على العملاء وتحدّثها منها"},{"text":"بدائل لكل تمرين لو العميل مش لاقي الجهاز"}]},
{"eyebrow":"التمارين والتغذية","title":"مكتبة تمارين وأكل، وخطة دايت بتفرّق بين يوم التمرين ويوم الراحة.","body":"مكتبة تمارين جاهزة تضيف عليها تمارينك وفيديو من لينك، ومكتبة أطعمة ووصفات. وابني خطة الدايت بأيام تمرين وراحة وأيام مخصصة، وحدد أنهي يوم في الأسبوع بيمشي بأنهي نظام، واحسب أهداف السعرات والماكروز.","bullets":[{"text":"وجبات بالسعرات والماكروز لكل يوم"},{"text":"وصفات بصورة وخطوات وقيم غذائية محسوبة"},{"text":"العميل بيسجّل وجباته وبيبلّغ لو أكل برّه الخطة"},{"text":"طباعة الخطة"}]},
{"eyebrow":"المواعيد","title":"جلسات ومواعيد من غير رسايل رايحة جاية.","body":"حدد مواعيد إتاحتك وأيام الإجازة، والعميل يطلب ميعاد من الأوقات الفاضية. وربط Google Calendar بيزامن الجلسات في الاتجاهين وبيمنع حجز أوقات إنت مشغول فيها. المواعيد متاحة على الباقات اللي فيها الميزة دي.","bullets":[{"text":"تذكيرات قبل الجلسة"},{"text":"اشتراك تقويم (ICS) بيظهر في تقويم موبايلك"},{"text":"تغيير الميعاد من Google بيوصلك كطلب إعادة جدولة توافق عليه"}]},
{"eyebrow":"الفريق والتواصل","title":"فريقك وعملاؤك على نفس الصفحة.","body":"ضيف أعضاء لفريقك ووزّع العملاء عليهم ونظّم الشغل في لوحة مهام. وتواصل مع عملائك بشات جوه المنصة بما فيه الرسايل الصوتية، والإشعارات بتوصلك على الإيميل والموبايل.","bullets":[{"text":"عدد مقاعد الفريق حسب الباقة"},{"text":"كل عضو بيشوف العملاء اللي اتوزعوا عليه"},{"text":"ألوانك ولوجوك ورابطك الخاص على الباقات اللي فيها الهوية المخصصة"}]}
]}$j$::jsonb,
  content_en = $j${"rows":[
{"eyebrow":"Forms","title":"Build the check-in form once, send it to any client.","body":"Drag in the fields you want — numbers, an adherence scale, progress photos, dates and multiple-choice questions. Your client opens the form on their phone inside their portal, and the response lands in your check-in inbox.","bullets":[{"text":"Questions that appear based on the client's answer"},{"text":"Ready-made templates for new-client intake, training, diet and check-ins"},{"text":"A due date on every form you send"},{"text":"Draft and published versions, so you can edit without breaking what was already sent"}]},
{"eyebrow":"Progress","title":"See who's on track and who needs you — without asking.","body":"Every weekly check-in arrives in a review queue: change in weight, adherence, sleep, workouts completed, and the first and latest progress photos side by side. Then you decide — keep going, adjust, or call them — and write your reply to the client.","bullets":[{"text":"Weight, custom measurements and photos on one timeline"},{"text":"Personal records (PRs) calculated from the client's workouts"},{"text":"Automatic signals like repeated pain or missed reps"},{"text":"A log of your decisions that shows how each one turned out"}]},
{"eyebrow":"Invoices","title":"A proper invoice, and clear tracking of what's paid.","body":"Set up packages and subscriptions for clients, record each payment and attach the transfer proof, then issue an invoice in pounds, riyals or dirhams and email it. You record the payments — we don't process them.","bullets":[{"text":"Invoices with your name, logo and tax details, printed or saved as PDF from the browser"},{"text":"Payment methods you define, like InstaPay or cash"},{"text":"Client subscriptions: freeze, cancel and end dates"},{"text":"A monthly finance summary by client"}]},
{"eyebrow":"Programs and workouts","title":"Build the program by drag and drop; clients log from their phone.","body":"Lay out the program's days and exercises by dragging, set sets, reps, weight or effort, and progress loads week over week. Your client logs every set and runs the rest timer, and their entries are kept if the connection drops and sent when it returns.","bullets":[{"text":"Supersets, circuits, AMRAP, EMOM and Tabata"},{"text":"Load progression and deload weeks"},{"text":"Templates you save, assign to clients and update from"},{"text":"Alternatives for each exercise when equipment isn't available"}]},
{"eyebrow":"Exercises and nutrition","title":"An exercise and food library, and diet plans that tell training days from rest days.","body":"A ready exercise library you can add your own exercises and video links to, plus a food and recipe library. Build a diet plan with training, rest and custom days, choose which weekday follows which, and calculate calorie and macro targets.","bullets":[{"text":"Meals with calories and macros for every day"},{"text":"Recipes with a photo, steps and calculated nutrition"},{"text":"Clients log their meals and report when they eat off the plan"},{"text":"Print the plan"}]},
{"eyebrow":"Appointments","title":"Sessions and appointments without the back-and-forth.","body":"Set your availability and days off, and clients request a time from the open slots. Google Calendar sync keeps sessions in step both ways and blocks times you're already busy. Appointments are available on the plans that include them.","bullets":[{"text":"Reminders before each session"},{"text":"A calendar feed (ICS) that shows up in your phone's calendar"},{"text":"A change made in Google reaches you as a reschedule request you approve"}]},
{"eyebrow":"Team and messaging","title":"Your team and your clients on the same page.","body":"Add team members, assign clients to them and organize the work on a task board. Talk to your clients in chat inside the platform, voice notes included, and get notifications by email and on your phone.","bullets":[{"text":"Team seats depend on the plan"},{"text":"Each member sees the clients assigned to them"},{"text":"Your colors, logo and own client link on the plans that include custom branding"}]}
]}$j$::jsonb,
  position = 5, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'features';

-- how_it_works: new section (update if an admin already added one, else insert)
update public.marketing_sections s
set
  content_ar = $j${"title":"إزاي بتشتغل: من الدعوة للفاتورة","steps":[{"title":"ادعُ عميلك","body":"اعمل لينك دعوة وابعته بنسخ أو واتساب. العميل بيسجّل بإيميل أو بحساب جوجل ويدخل بوابته."},{"title":"ابني الخطة","body":"برنامج تمرين، خطة دايت، ونماذج متابعة — من قوالب جاهزة أو من الصفر."},{"title":"العميل بيتدرّب","body":"بيفتح بوابته من الموبايل، يسجّل المجموعات والوجبات، ويرفع صور التقدّم. وتقدر يثبّتها على الشاشة الرئيسية."},{"title":"راجع المتابعات","body":"متابعات الأسبوع في طابور واحد. إنت بتقرر وبتردّ، والقرار بيتسجّل."},{"title":"نسّق المواعيد","body":"جلسات متزامنة مع Google Calendar، على الباقات اللي فيها الميزة دي."},{"title":"تابع الفلوس","body":"سجّل المدفوعات، وأصدر الفواتير، وراقب اشتراكات عملائك."}]}$j$::jsonb,
  content_en = $j${"title":"How it works: from invite to invoice","steps":[{"title":"Invite your client","body":"Create an invite link and share it by copy or WhatsApp. Your client signs up with email or a Google account and lands in their portal."},{"title":"Build the plan","body":"A training program, a diet plan and check-in forms — from ready templates or from scratch."},{"title":"Your client trains","body":"They open their portal on their phone, log sets and meals, and upload progress photos. They can install it on their home screen."},{"title":"Review the check-ins","body":"The week's check-ins sit in one queue. You decide and reply, and the decision is recorded."},{"title":"Coordinate appointments","body":"Sessions stay in sync with Google Calendar, on the plans that include it."},{"title":"Track the money","body":"Record payments, issue invoices and keep an eye on your clients' subscriptions."}]}$j$::jsonb,
  position = 6, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'how_it_works';

insert into public.marketing_sections (page_id, type, position, is_visible, content_ar, content_en, settings)
select
  p.id, 'how_it_works', 6, true,
  $j${"title":"إزاي بتشتغل: من الدعوة للفاتورة","steps":[{"title":"ادعُ عميلك","body":"اعمل لينك دعوة وابعته بنسخ أو واتساب. العميل بيسجّل بإيميل أو بحساب جوجل ويدخل بوابته."},{"title":"ابني الخطة","body":"برنامج تمرين، خطة دايت، ونماذج متابعة — من قوالب جاهزة أو من الصفر."},{"title":"العميل بيتدرّب","body":"بيفتح بوابته من الموبايل، يسجّل المجموعات والوجبات، ويرفع صور التقدّم. وتقدر يثبّتها على الشاشة الرئيسية."},{"title":"راجع المتابعات","body":"متابعات الأسبوع في طابور واحد. إنت بتقرر وبتردّ، والقرار بيتسجّل."},{"title":"نسّق المواعيد","body":"جلسات متزامنة مع Google Calendar، على الباقات اللي فيها الميزة دي."},{"title":"تابع الفلوس","body":"سجّل المدفوعات، وأصدر الفواتير، وراقب اشتراكات عملائك."}]}$j$::jsonb,
  $j${"title":"How it works: from invite to invoice","steps":[{"title":"Invite your client","body":"Create an invite link and share it by copy or WhatsApp. Your client signs up with email or a Google account and lands in their portal."},{"title":"Build the plan","body":"A training program, a diet plan and check-in forms — from ready templates or from scratch."},{"title":"Your client trains","body":"They open their portal on their phone, log sets and meals, and upload progress photos. They can install it on their home screen."},{"title":"Review the check-ins","body":"The week's check-ins sit in one queue. You decide and reply, and the decision is recorded."},{"title":"Coordinate appointments","body":"Sessions stay in sync with Google Calendar, on the plans that include it."},{"title":"Track the money","body":"Record payments, issue invoices and keep an eye on your clients' subscriptions."}]}$j$::jsonb,
  $j${"background":"muted","image_position":"side"}$j$::jsonb
from public.marketing_pages p
where p.slug = 'home'
  and not exists (
    select 1 from public.marketing_sections x where x.page_id = p.id and x.type = 'how_it_works'
  );

-- arabic_first -------------------------------------------------------------
update public.marketing_sections s
set
  content_ar = $j${"eyebrow":"اتبني عربي من الأول","title":"مش أداة أجنبية اتترجمت.","subtitle":"الاتجاه من اليمين، الأرقام والتواريخ بتتكتب صح، والنماذج بتتقري زي ما بتتكلم. عملاؤك مش هيحسّوا إنهم بيملوا استمارة مترجمة.","cards":[{"title":"RTL","body":"تخطيط عربي أصلي، مش معكوس بالغصب"},{"title":"ج.م ر.س د.إ","body":"فواتير بالجنيه والريال والدرهم"},{"title":"على الموبايل","body":"بوابة العميل بتتثبّت على الشاشة الرئيسية، وشاشة التمرين بتكمّل شغل حتى لو النت قطع"},{"title":"EN","body":"إنجليزي كامل لو عميلك بيفضّله"}]}$j$::jsonb,
  content_en = $j${"eyebrow":"Arabic from the start","title":"Not a foreign tool that got translated.","subtitle":"Right-to-left layout, numbers and dates written correctly, and forms that read the way you actually speak. Your clients won't feel like they're filling in a translated document.","cards":[{"title":"RTL","body":"A native Arabic layout, not one mirrored under protest"},{"title":"EGP SAR AED","body":"Invoices in pounds, riyals and dirhams"},{"title":"On the phone","body":"The client portal installs on the home screen, and the workout screen keeps working if the connection drops"},{"title":"EN","body":"Full English whenever your client prefers it"}]}$j$::jsonb,
  position = 7, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'arabic_first';

-- testimonials: hidden (the quotes had no real source) ----------------------
update public.marketing_sections s
set position = 8, is_visible = false, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'testimonials';

-- pricing: heading copy only; cards come from subscription_tiers ------------
update public.marketing_sections s
set
  content_ar = $j${"title":"أسعار واضحة، بالجنيه.","subtitle":"١٤ يوم تجربة مجانًا من غير كارت. وتقدر تطلب تغيير باقتك من حسابك في أي وقت.","cta":"ابدأ التجربة"}$j$::jsonb,
  content_en = $j${"title":"Clear pricing, in EGP.","subtitle":"A 14-day free trial, no card required. You can request a plan change from your account at any time.","cta":"Start the trial"}$j$::jsonb,
  position = 9, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'pricing';

-- faq ----------------------------------------------------------------------
update public.marketing_sections s
set
  content_ar = $j${"title":"أسئلة بتتسأل كتير","items":[
{"q":"عميلي محتاج ينزّل تطبيق؟","a":"لأ، مفيش تطبيق لازم يتنزّل من المتجر. العميل بيدخل بوابة ويب من متصفح موبايله، وتقدر يثبّتها على الشاشة الرئيسية. بس هيعمل حساب بإيميل أو بحساب جوجل من لينك الدعوة اللي هتبعتهوله."},
{"q":"إزاي بدعو عميل؟","a":"بتعمل لينك دعوة من صفحة العملاء وتنسخه أو تبعته على واتساب. العميل بيسجّل بإيميل أو بحساب جوجل وبيتربط بحسابك على طول. اللينك لمرة واحدة وبينتهي بعد ١٤ يوم."},
{"q":"أقدر أنقل عملائي من الإكسيل؟","a":"أيوه. ارفع ملف إكسيل أو CSV أو الصق الجدول، وبنحاول نطابق الأعمدة لوحدنا، وبتشوف النتيجة قبل ما تأكّد الاستيراد."},
{"q":"الدفع بيتم إزاي؟","a":"كوتشلي فت مش بتعالج المدفوعات. إنت بتتفق مع عميلك على وسيلة الدفع اللي تناسبكم، وبتسجّل الدفعة وإثبات التحويل عندنا وتصدر فاتورة. ومفيش نسبة بتتاخد من اللي عملاؤك بيدفعوه."},
{"q":"المواعيد وGoogle Calendar متاحين على كل الباقات؟","a":"لأ، المواعيد وربط Google Calendar متاحين على الباقات اللي فيها الميزة دي — شوف تفاصيل كل باقة في قسم الأسعار."},
{"q":"لو عندي عملاء أكتر من حد الباقة؟","a":"كل باقة ليها حد أقصى للعملاء، ولما توصله مش هتقدر تضيف عملاء جداد. تقدر تبعت طلب لتغيير الباقة من صفحة الاشتراك، وفريقنا بيراجعه."},
{"q":"أقدر أشتغل مع فريق؟","a":"أيوه. بتدعو أعضاء فريق بالإيميل، وعدد المقاعد حسب الباقة. بتوزّع العملاء على الأعضاء، وكل عضو بيشوف العملاء اللي اتوزعوا عليه، وفي لوحة مهام للفريق."},
{"q":"الأداة بالعربي فعلًا؟","a":"أيوه، العربي هو الأساس بواجهة من اليمين لليسار، والإنجليزي متاح بضغطة. والفواتير بالجنيه والريال والدرهم."},
{"q":"إيه اللي بيحصل لما التجربة تخلص؟","a":"لو التجربة خلصت من غير اشتراك، بتدخل فترة سماح قصيرة وبعدها الحساب بيتوقف. تقدر تطلب تفعيل اشتراك من حسابك، وفريقنا بيتواصل معاك."}
]}$j$::jsonb,
  content_en = $j${"title":"Frequently asked questions","items":[
{"q":"Does my client need to install an app?","a":"No, there's nothing to download from a store. Your client opens a web portal in their phone's browser, and can install it on their home screen. They do create an account, with email or a Google account, from the invite link you send them."},
{"q":"How do I invite a client?","a":"Create an invite link from the Clients page and copy it or send it over WhatsApp. Your client signs up with email or a Google account and is linked to you straight away. The link works once and expires after 14 days."},
{"q":"Can I move my clients over from a spreadsheet?","a":"Yes. Upload an Excel or CSV file, or paste the table. We try to match the columns for you, and you see the result before you confirm the import."},
{"q":"How does payment work?","a":"Coachlyfit doesn't process payments. You agree a payment method with your client, record the payment and the transfer proof with us, and issue an invoice. We don't take a cut of what your clients pay you."},
{"q":"Are appointments and Google Calendar on every plan?","a":"No. Appointments and Google Calendar sync are on the plans that include them — see each plan's details in the pricing section."},
{"q":"What if I have more clients than my plan allows?","a":"Each plan has a client limit, and once you reach it you can't add new clients. You can send a plan-change request from your subscription page and our team reviews it."},
{"q":"Can I work with a team?","a":"Yes. You invite team members by email, and the number of seats depends on your plan. You assign clients to members, each member sees the clients assigned to them, and there's a task board for the team."},
{"q":"Is it really in Arabic?","a":"Yes. Arabic is the default, with a right-to-left interface, and English is a click away. Invoices come in pounds, riyals and dirhams."},
{"q":"What happens when the trial ends?","a":"If the trial ends without a subscription, you get a short grace period and then the account is paused. You can request a subscription from your account and our team gets in touch."}
]}$j$::jsonb,
  position = 10, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'faq';

-- final_cta ----------------------------------------------------------------
update public.marketing_sections s
set
  content_ar = $j${"title":"جرّب كوتشلي فت مع عملاءك الحقيقيين.","subtitle":"ادعُ أول عميل، ابني له برنامج، واستلم أول متابعة. ١٤ يوم مجانًا من غير كارت.","cta":"جرّب ١٤ يوم مجانًا"}$j$::jsonb,
  content_en = $j${"title":"Try Coachlyfit with your real clients.","subtitle":"Invite your first client, build them a program and receive their first check-in. 14 days free, no card required.","cta":"Start 14 days free"}$j$::jsonb,
  position = 11, is_visible = true, updated_at = now()
from public.marketing_pages p
where p.id = s.page_id and p.slug = 'home' and s.type = 'final_cta';

update public.marketing_pages set updated_at = now() where slug = 'home';

-- Marketing page CMS: the landing page's sections move out of the message
-- files and into the database so an admin can edit them at /admin/site.
--
-- Draft and published are kept apart. marketing_sections is the draft the
-- editor autosaves into; publishing writes one immutable snapshot row to
-- marketing_page_versions, and the public page only ever reads the newest
-- snapshot. Section content is jsonb validated app-side with zod
-- (src/domain/marketing/sections.schema.ts), same as platform_settings.
--
-- Admin only for everything except reading a published snapshot. Rows are
-- written through the admin's own session (RLS), not the service_role client.

create type public.marketing_section_type as enum (
  'hero',
  'app_preview',
  'stats',
  'pain_points',
  'features',
  'arabic_first',
  'testimonials',
  'how_it_works',
  'pricing',
  'faq',
  'final_cta'
);

create table public.marketing_pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{1,60}$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

create table public.marketing_sections (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.marketing_pages (id) on delete cascade,
  type public.marketing_section_type not null,
  position integer not null,
  is_visible boolean not null default true,
  content_ar jsonb not null default '{}'::jsonb,
  content_en jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create index marketing_sections_page_position_idx on public.marketing_sections (page_id, position);

-- snapshot is { "sections": [ { id, type, position, is_visible, content_ar,
-- content_en, settings } ] }. Hidden sections are included so that restoring
-- a version brings back exactly the draft that was published; the renderer
-- skips them.
create table public.marketing_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.marketing_pages (id) on delete cascade,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null
);

create index marketing_page_versions_page_published_idx
  on public.marketing_page_versions (page_id, published_at desc);

alter table public.marketing_pages enable row level security;
alter table public.marketing_sections enable row level security;
alter table public.marketing_page_versions enable row level security;

-- The public page resolves slug -> newest version, so anyone can read a
-- page's id and slug and every published snapshot. Nothing else is readable
-- without the admin role.
create policy pages_read on public.marketing_pages for select to anon, authenticated
  using (true);
create policy pages_admin_insert on public.marketing_pages for insert to authenticated
  with check ((select private.is_admin()));
create policy pages_admin_update on public.marketing_pages for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy sections_admin_all on public.marketing_sections for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy versions_read on public.marketing_page_versions for select to anon, authenticated
  using (true);
create policy versions_admin_insert on public.marketing_page_versions for insert to authenticated
  with check ((select private.is_admin()) and published_by = (select auth.uid()));

-- A published version can't be changed or removed by anyone but service_role:
-- there is no update or delete grant, and no policy for either.
revoke all on public.marketing_pages from anon, authenticated;
revoke all on public.marketing_sections from anon, authenticated;
revoke all on public.marketing_page_versions from anon, authenticated;
grant select (id, slug) on public.marketing_pages to anon;
grant select, insert, update on public.marketing_pages to authenticated;
grant select, insert, update, delete on public.marketing_sections to authenticated;
grant select on public.marketing_page_versions to anon, authenticated;
grant insert on public.marketing_page_versions to authenticated;
grant select, insert, update, delete on public.marketing_pages to service_role;
grant select, insert, update, delete on public.marketing_sections to service_role;
grant select, insert, update, delete on public.marketing_page_versions to service_role;

-- Both functions are security invoker: the policies above still decide what
-- the caller may touch. They exist so a reorder or a restore is one
-- transaction instead of a row-by-row loop from the app. The explicit admin
-- check is only there to give a non-admin a clear 42501 instead of a silent
-- zero-row update.
create function public.reorder_marketing_sections(p_page_id uuid, p_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  update public.marketing_sections s
  set position = o.ord, updated_at = now()
  from unnest(p_ids) with ordinality as o (id, ord)
  where s.id = o.id and s.page_id = p_page_id;
end;
$$;

-- Replaces the page's draft with a published snapshot. Section ids are kept,
-- so restoring twice gives the same rows.
create function public.restore_marketing_version(p_version_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_page_id uuid;
  v_snapshot jsonb;
begin
  if not private.is_admin() then
    raise exception 'Admin only.' using errcode = '42501';
  end if;

  select page_id, snapshot into v_page_id, v_snapshot
  from public.marketing_page_versions
  where id = p_version_id;

  if v_page_id is null then
    raise exception 'Version not found.' using errcode = 'P0002';
  end if;

  delete from public.marketing_sections where page_id = v_page_id;

  insert into public.marketing_sections (id, page_id, type, position, is_visible, content_ar, content_en, settings)
  select
    (s->>'id')::uuid,
    v_page_id,
    (s->>'type')::public.marketing_section_type,
    (s->>'position')::integer,
    (s->>'is_visible')::boolean,
    s->'content_ar',
    s->'content_en',
    s->'settings'
  from jsonb_array_elements(v_snapshot->'sections') as s;

  update public.marketing_pages
  set updated_at = now(), updated_by = (select auth.uid())
  where id = v_page_id;
end;
$$;

revoke execute on function public.reorder_marketing_sections(uuid, uuid[]) from public, anon;
revoke execute on function public.restore_marketing_version(uuid) from public, anon;
grant execute on function public.reorder_marketing_sections(uuid, uuid[]) to authenticated;
grant execute on function public.restore_marketing_version(uuid) to authenticated;

-- Images used by marketing sections. Public bucket, same as coach-logos: the
-- landing page is public, so its images are too. Only an admin can write.
insert into storage.buckets (id, name, public)
values ('marketing', 'marketing', true);

create policy marketing_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'marketing' and (select private.is_admin()));

create policy marketing_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'marketing' and (select private.is_admin()));

create policy marketing_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'marketing' and (select private.is_admin()))
  with check (bucket_id = 'marketing' and (select private.is_admin()));

create policy marketing_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'marketing' and (select private.is_admin()));

-- Seed: the "home" page with the copy that was in messages/{ar,en}.json
-- under marketing.* when this migration was written, in the order the page
-- rendered it. how_it_works is a new type and is not seeded.

with page as (
  insert into public.marketing_pages (slug) values ('home') returning id
)
insert into public.marketing_sections (page_id, type, position, content_ar, content_en, settings)
select page.id, v.type::public.marketing_section_type, v.position, v.content_ar, v.content_en, v.settings
from page, (
  values
    ('hero', 1, $j${"badge":"١,٤٠٠+ مدرب في مصر والخليج","title":"شغّل تدريبك زي البيزنس، مش زي جروب واتساب.","subtitle":"نماذج، برامج، متابعة، وفواتير — في مكان واحد، بالعربي. وعميلك مش محتاج يعمل حساب ولا ينزّل تطبيق.","cta":"جرّب ١٤ يوم مجانًا","ctaSecondary":"شوف اللوحة","trialNote":"من غير كارت · بتلغي في أي وقت · دعم بالعربي"}$j$::jsonb, $j${"badge":"1,400+ coaches across Egypt and the Gulf","title":"Run your coaching like a business, not a WhatsApp group.","subtitle":"Forms, programs, check-ins and invoices in one place — in Arabic. And your client never has to create an account or install an app.","cta":"Start 14 days free","ctaSecondary":"See the dashboard","trialNote":"No card · cancel anytime · support in Arabic"}$j$::jsonb, $j${"background":"white","image_position":"side"}$j$::jsonb),
    ('app_preview', 2, $j${}$j$::jsonb, $j${}$j$::jsonb, $j${"background":"white","image_position":"side"}$j$::jsonb),
    ('stats', 3, $j${"items":[{"value":"١,٤٠٠+","label":"مدرب مشترك"},{"value":"٣٨,٠٠٠","label":"عميل بيتابع شهريًا"},{"value":"٦","label":"دول في المنطقة"},{"value":"٤ دقايق","label":"من التسجيل لأول رد"}]}$j$::jsonb, $j${"items":[{"value":"1,400+","label":"coaches on the platform"},{"value":"38,000","label":"clients checking in monthly"},{"value":"6","label":"countries across the region"},{"value":"4 min","label":"from signup to first reply"}]}$j$::jsonb, $j${"background":"navy","image_position":"side"}$j$::jsonb),
    ('pain_points', 4, $j${"eyebrow":"المشكلة","title":"شغلك متفرق على تلات حاجات مش متكلمين مع بعض.","subtitle":"وكل ما العملاء يزيدوا، الوقت اللي بيروح في التنسيق بيزيد أسرع من الفلوس.","cards":[{"label":"EXCEL","title":"شيت البرامج والأوزان","body":"نسخة لكل عميل، وكل تعديل بتعمله في عشر أماكن. ومحدش بيفتحه من الموبايل."},{"label":"WHATSAPP","title":"صور ومقاسات وأرقام","body":"مدفونة في شات من ٣٠٠ رسالة. عايز تقارن صورة الأسبوع ده بالشهر اللي فات؟ بالتوفيق."},{"label":"NOTES","title":"مين دفع ومين لأ","body":"في نوتة أو في دماغك. وبتكتشف الاشتراك اللي خلص بعد شهرين من غير ما تاخد بالك."}]}$j$::jsonb, $j${"eyebrow":"The problem","title":"Your work is split across three tools that don't talk to each other.","subtitle":"And the more clients you take on, the faster admin time grows compared to what you earn.","cards":[{"label":"EXCEL","title":"The program spreadsheet","body":"A copy per client, and every edit has to be made in ten places. Nobody opens it on a phone."},{"label":"WHATSAPP","title":"Photos, measurements, numbers","body":"Buried in a 300-message thread. Try comparing this week's photo to last month's — good luck."},{"label":"NOTES","title":"Who paid and who didn't","body":"In a notebook, or in your head. You find the lapsed subscription two months after it expired."}]}$j$::jsonb, $j${"background":"muted","image_position":"side"}$j$::jsonb),
    ('features', 5, $j${"rows":[{"eyebrow":"النماذج","title":"ابني النموذج مرة، وابعته لأي عدد.","body":"اسحب الحقول اللي عايزها — وزن، مقياس التزام، صور تقدّم، أي سؤال. العميل بيفتح لينك على موبايله، بيرد في دقيقتين، والرد بيوصلك على طول.","bullets":[{"text":"من غير حساب ومن غير تطبيق للعميل"},{"text":"صور التقدّم بتتصف جنب بعض أوتوماتيك"},{"text":"قوالب جاهزة للاشتراك والمتابعة والدايت"}]},{"eyebrow":"المتابعة","title":"تشوف مين ماشي كويس ومين محتاجك — من غير ما تسأل.","body":"كل رد بيتحوّل لرقم على الجراف. العميل اللي فوّت أسبوعين بيطلع لوحده فوق، والباقي بيمشي من غير ما تتابعه.","bullets":[{"text":"وزن ومقاسات وصور على خط زمني واحد"},{"text":"تنبيه لما حد يتأخر — قبل ما يزهق ويسيب"},{"text":"ملاحظات خاصة بيك على كل عميل"}]},{"eyebrow":"الفواتير","title":"فاتورة محترمة بالعربي، ومتنساش حد.","body":"اشتراكات شهرية بتتجدد لوحدها، وتذكير بيروح على واتساب. بالجنيه المصري والريال والدرهم.","bullets":[{"text":"فاتورة PDF عليها اسمك ولوجوك"},{"text":"إنستاباي وفوري وفيزا"},{"text":"تقرير دخل شهري جاهز للمحاسب"}]}]}$j$::jsonb, $j${"rows":[{"eyebrow":"Forms","title":"Build the form once, send it to anyone.","body":"Drag in the fields you want — weight, an adherence scale, progress photos, any question at all. Your client opens a link on their phone, answers in two minutes, and the response lands with you straight away.","bullets":[{"text":"No account and no app for the client"},{"text":"Progress photos line up side by side automatically"},{"text":"Ready-made templates for intake, check-ins and diet"}]},{"eyebrow":"Progress","title":"See who's on track and who needs you — without asking.","body":"Every answer becomes a point on the chart. The client who missed two weeks rises to the top on their own, and everyone else keeps moving without you chasing them.","bullets":[{"text":"Weight, measurements and photos on one timeline"},{"text":"An alert when someone falls behind — before they drop off"},{"text":"Private notes on every client, visible only to you"}]},{"eyebrow":"Invoices","title":"A proper invoice, and nobody slips through.","body":"Monthly subscriptions that renew themselves, with reminders sent over WhatsApp. In Egyptian pounds, Saudi riyals and dirhams.","bullets":[{"text":"PDF invoices with your name and logo on them"},{"text":"InstaPay, Fawry and Visa"},{"text":"A monthly income report your accountant can use"}]}]}$j$::jsonb, $j${"background":"white","image_position":"side"}$j$::jsonb),
    ('arabic_first', 6, $j${"eyebrow":"اتبني عربي من الأول","title":"مش أداة أجنبية اتترجمت.","subtitle":"الاتجاه من اليمين، الأرقام والتواريخ بتتكتب صح، والنماذج بتتقري زي ما بتتكلم. عملاؤك مش هيحسّوا إنهم بيملوا استمارة مترجمة.","cards":[{"title":"RTL","body":"تخطيط عربي أصلي، مش معكوس بالغصب"},{"title":"ج.م ر.س د.إ","body":"عملات المنطقة وطرق دفعها"},{"title":"واتساب","body":"كل حاجة بتوصل على القناة اللي عملاؤك عليها فعلًا"},{"title":"EN","body":"إنجليزي كامل لو عميلك بيفضّله"}]}$j$::jsonb, $j${"eyebrow":"Arabic from the start","title":"Not a foreign tool that got translated.","subtitle":"Right-to-left layout, numbers and dates written correctly, and forms that read the way you actually speak. Your clients won't feel like they're filling in a translated document.","cards":[{"title":"RTL","body":"A native Arabic layout, not one mirrored under protest"},{"title":"EGP SAR AED","body":"Regional currencies and the ways people pay with them"},{"title":"WhatsApp","body":"Everything arrives on the channel your clients are already on"},{"title":"EN","body":"Full English whenever your client prefers it"}]}$j$::jsonb, $j${"background":"navy","image_position":"side"}$j$::jsonb),
    ('testimonials', 7, $j${"title":"مدربين سابوا الشيتات.","items":[{"quote":"كنت بضيّع سبت كامل كل أسبوع في تجميع ردود العملاء من الواتساب. دلوقتي بفتح اللوحة الصبح ولاقي كل حاجة مترتبة. رجعتلي يوم في الأسبوع.","initial":"م","name":"كابتن مروان حسن","meta":"القاهرة · ٤٢ عميل"},{"quote":"أهم حاجة إن العميلة مش محتاجة تنزّل تطبيق. بتفتح اللينك وبترد. جربت قبل كده تطبيقات وكل مرة نص العملاء ميسجلوش أصلًا.","initial":"د","name":"كابتن دينا صبري","meta":"جدة · ٢٨ عميلة"}]}$j$::jsonb, $j${"title":"Coaches who left the spreadsheets behind.","items":[{"quote":"I used to lose a whole Saturday every week collecting client replies from WhatsApp. Now I open the dashboard in the morning and everything's already organized. I got a full day back.","initial":"M","name":"Coach Marwan Hassan","meta":"Cairo · 42 clients"},{"quote":"The big thing is my clients don't need to install an app. They open the link and reply. I've tried apps before and half the clients never even signed up.","initial":"D","name":"Coach Dina Sabry","meta":"Jeddah · 28 clients"}]}$j$::jsonb, $j${"background":"muted","image_position":"side"}$j$::jsonb),
    ('pricing', 8, $j${"title":"سعر واضح، بالجنيه.","subtitle":"١٤ يوم مجانًا على أي باقة. من غير كارت.","cta":"ابدأ التجربة"}$j$::jsonb, $j${"title":"Clear pricing, in EGP.","subtitle":"14 days free on any plan. No card required.","cta":"Start the trial"}$j$::jsonb, $j${"background":"white","image_position":"side"}$j$::jsonb),
    ('faq', 9, $j${"title":"أسئلة بتتسأل كتير","items":[{"q":"عميلي محتاج ينزّل تطبيق؟","a":"لأ. بيوصله لينك على واتساب، بيفتحه في المتصفح، وبيرد. من غير حساب ومن غير تنزيل — وده أهم سبب إن نسبة الرد عندنا عالية."},{"q":"أقدر أنقل عملائي من الإكسيل؟","a":"أيوه. الصق اللستة زي ما هي — بتفاصيلها الناقصة والأعمدة المختلطة — وإحنا بنطابق الأعمدة ونوريك النتيجة قبل ما تستورد."},{"q":"الفلوس بتوصلني إزاي؟","a":"إنستاباي، فوري، أو فيزا. بتتحوّل على حسابك مباشرة، وإحنا مش بناخد نسبة من اشتراكات عملائك."},{"q":"لو عندي عملاء أكتر من حد الباقة؟","a":"تقدر تطلع للباقة اللي فوقها في أي وقت، والفرق بيتحسب بالأيام المتبقية. ولو الاستوديو أكبر من كده كلّمنا."},{"q":"صور العملاء بتتخزن فين؟","a":"مشفّرة، وإنت الوحيد اللي بتشوفها. العميل يقدر يطلب مسحها في أي وقت، وبتتمسح فعلًا خلال ٢٤ ساعة."}]}$j$::jsonb, $j${"title":"Frequently asked questions","items":[{"q":"Does my client need to install an app?","a":"No. They get a link over WhatsApp, open it in their browser, and answer. No account, no download — which is the single biggest reason our response rates are high."},{"q":"Can I move my clients over from a spreadsheet?","a":"Yes. Paste the list exactly as it is — missing details, mixed-up columns and all — and we'll match the columns and show you the result before anything is imported."},{"q":"How do I get paid?","a":"InstaPay, Fawry or Visa. Money goes straight to your account, and we don't take a cut of what your clients pay you."},{"q":"What if I have more clients than my plan allows?","a":"You can move up a plan at any time and the difference is prorated across the remaining days. If your studio is bigger than the top plan, talk to us."},{"q":"Where are client photos stored?","a":"Encrypted, and visible only to you. A client can ask for them to be deleted at any time, and they really are deleted within 24 hours."}]}$j$::jsonb, $j${"background":"muted","image_position":"side"}$j$::jsonb),
    ('final_cta', 10, $j${"title":"أول عميل بيرد خلال أربع دقايق.","subtitle":"الصق لستة عملائك، اختار نموذج، ابعت. من غير كارت ومن غير تدريب.","cta":"جرّب ١٤ يوم مجانًا"}$j$::jsonb, $j${"title":"Your first client replies within four minutes.","subtitle":"Paste in your client list, pick a form, hit send. No card required, no training.","cta":"Start 14 days free"}$j$::jsonb, $j${"background":"navy","image_position":"side"}$j$::jsonb)
) as v (type, position, content_ar, content_en, settings);

-- First published version, so the public page has something to render the
-- moment this migration lands. No author: it wasn't published by anyone.
insert into public.marketing_page_versions (page_id, snapshot)
select
  p.id,
  jsonb_build_object(
    'sections',
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', s.id,
          'type', s.type,
          'position', s.position,
          'is_visible', s.is_visible,
          'content_ar', s.content_ar,
          'content_en', s.content_en,
          'settings', s.settings
        )
        order by s.position
      )
      from public.marketing_sections s
      where s.page_id = p.id
    )
  )
from public.marketing_pages p
where p.slug = 'home';

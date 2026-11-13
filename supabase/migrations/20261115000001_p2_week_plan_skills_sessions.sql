-- P2 of the training-plan-type audit. Columns on existing tables only, so the
-- existing RLS policies already cover them.

-- 1. Authored week plan (periodization) ----------------------------------------
-- Per-week modifiers applied on top of week 1's base sets and the item's
-- progression rule. Keyed by week number as text:
--   { "2": { "label": "Accumulation", "load_pct": 105, "reps_delta": 0, "deload": false },
--     "4": { "label": "Deload", "load_pct": 60, "deload": true } }
-- null = the legacy behaviour (every 4th week is a deload reset). Shape is
-- validated by weekPlanSchema in the app; the DB only guards the type.
alter table public.programs
  add column week_plan jsonb
    check (week_plan is null or jsonb_typeof(week_plan) = 'object');

-- 2. Calisthenics skill ladders -----------------------------------------------
-- An exercise can be one rung of a ladder ("planche": tuck 2, straddle 4, ...).
-- The athlete's level in a ladder is the highest rung they have logged.
alter table public.exercises
  add column skill_group text
    check (skill_group in (
      'push_up', 'pull_up', 'muscle_up', 'planche', 'front_lever', 'handstand', 'pistol_squat', 'l_sit'
    )),
  add column skill_level smallint check (skill_level between 1 and 10),
  add constraint exercises_skill_pair check ((skill_group is null) = (skill_level is null));

-- 3. Extra sessions in a day ---------------------------------------------------
-- A second (third, ...) session on the same calendar day is a program_day whose
-- parent_day_id points at the day it belongs to. It has no schedule position of
-- its own (the parent's day_index / weekday place it on the calendar), so every
-- schedule calculation keeps working on parent-less days only.
alter table public.program_days
  add column parent_day_id uuid references public.program_days(id) on delete cascade,
  add constraint program_days_not_own_parent check (parent_day_id is null or parent_day_id <> id);

create index program_days_parent_idx on public.program_days (parent_day_id) where parent_day_id is not null;

-- 4. Skill-ladder exercises ----------------------------------------------------
-- Missing rungs are added to the platform library (idempotent on lower(name_en),
-- like 20261113000002 / 20261114000002); then every rung is stamped, including
-- ones the library already had.
insert into public.exercises
  (name_ar, name_en, muscle_group, equipment, measurement_type, instructions_ar, instructions_en, difficulty)
select v.name_ar, v.name_en, v.muscle_group, v.equipment, v.measurement_type, v.instructions_ar, v.instructions_en, v.difficulty
from (values
  ('ضغط على الحائط', 'Wall Push-Up', 'chest', 'body weight', 'bodyweight_reps',
   'قف أمام الحائط وادفع جسمك بعيداً عنه بذراعين ممدودتين.', 'Stand facing a wall and press your body away with straight arms.', 'beginner'),
  ('ضغط مائل', 'Incline Push-Up', 'chest', 'body weight', 'bodyweight_reps',
   'ضع يديك على سطح مرتفع وأبقِ الجسم مستقيماً أثناء الضغط.', 'Hands on a raised surface, body in one line as you press.', 'beginner'),
  ('ضغط الماس', 'Diamond Push-Up', 'arms', 'body weight', 'bodyweight_reps',
   'ضع يديك قريبتين على شكل ماسة وانزل بالصدر نحوهما.', 'Hands close together in a diamond and lower your chest to them.', 'intermediate'),
  ('ضغط القوس', 'Archer Push-Up', 'chest', 'body weight', 'bodyweight_reps',
   'باعد اليدين وانزل نحو يد واحدة مع إبقاء الذراع الأخرى ممدودة.', 'Hands wide; lower toward one hand while the other arm stays straight.', 'advanced'),
  ('ضغط بذراع واحدة', 'One-Arm Push-Up', 'chest', 'body weight', 'bodyweight_reps',
   'اضغط بذراع واحدة مع قدمين متباعدتين لتثبيت الجسم.', 'Press with one arm, feet wide for balance.', 'advanced'),
  ('سحب أسترالي', 'Australian Row', 'back', 'body weight', 'bodyweight_reps',
   'تدلَّ تحت بار منخفض واسحب صدرك إليه بجسم مستقيم.', 'Hang under a low bar and pull your chest to it with a straight body.', 'beginner'),
  ('عقلة القوس', 'Archer Pull-Up', 'back', 'body weight', 'bodyweight_reps',
   'اسحب نحو يد واحدة مع إبقاء الذراع الأخرى ممدودة.', 'Pull toward one hand while the other arm stays straight.', 'advanced'),
  ('عقلة بذراع واحدة', 'One-Arm Pull-Up', 'back', 'body weight', 'bodyweight_reps',
   'اسحب نفسك للأعلى بذراع واحدة.', 'Pull yourself up with one arm.', 'advanced'),
  ('عقلة انفجارية', 'Explosive Pull-Up', 'back', 'body weight', 'bodyweight_reps',
   'اسحب بقوة لتصل بصدرك إلى مستوى البار.', 'Pull hard enough to bring your chest to bar height.', 'intermediate'),
  ('صعود البار', 'Bar Muscle-Up', 'full_body', 'body weight', 'bodyweight_reps',
   'اسحب فوق البار ثم ادفع للأعلى حتى تصبح ذراعاك ممدودتين.', 'Pull over the bar, then press out to straight arms on top.', 'advanced'),
  ('صعود الحلقات', 'Ring Muscle-Up', 'full_body', 'rope', 'bodyweight_reps',
   'اسحب فوق الحلقات ثم ادفع للأعلى مع ثبات الحلقات.', 'Pull over the rings, then press out while keeping them steady.', 'advanced'),
  ('ميل بلانش', 'Planche Lean', 'shoulders', 'body weight', 'duration',
   'في وضع الضغط، مِل بالكتفين للأمام فوق اليدين وثبّت.', 'In a push-up position, lean your shoulders forward past your hands and hold.', 'intermediate'),
  ('بلانش مطوي', 'Tuck Planche', 'shoulders', 'body weight', 'duration',
   'ارفع جسمك عن الأرض بركبتين مطويتين وثبّت.', 'Lift your body off the floor with knees tucked and hold.', 'advanced'),
  ('بلانش مطوي متقدم', 'Advanced Tuck Planche', 'shoulders', 'body weight', 'duration',
   'مدّ الوركين للخلف مع بقاء الركبتين مطويتين وثبّت.', 'Extend the hips back with knees still tucked and hold.', 'advanced'),
  ('بلانش متباعد', 'Straddle Planche', 'shoulders', 'body weight', 'duration',
   'ثبّت الجسم أفقياً بساقين متباعدتين.', 'Hold the body horizontal with legs apart.', 'advanced'),
  ('بلانش كامل', 'Full Planche', 'shoulders', 'body weight', 'duration',
   'ثبّت الجسم أفقياً بساقين مضمومتين وممدودتين.', 'Hold the body horizontal with legs together and straight.', 'advanced'),
  ('فرونت ليفر مطوي', 'Tuck Front Lever', 'back', 'body weight', 'duration',
   'تدلَّ من البار وارفع الوركين بركبتين مطويتين حتى يصبح الظهر أفقياً.', 'Hang from the bar and raise the hips with knees tucked until the back is horizontal.', 'advanced'),
  ('فرونت ليفر مطوي متقدم', 'Advanced Tuck Front Lever', 'back', 'body weight', 'duration',
   'افتح الوركين مع بقاء الركبتين مطويتين وثبّت.', 'Open the hips with knees still tucked and hold.', 'advanced'),
  ('فرونت ليفر متباعد', 'Straddle Front Lever', 'back', 'body weight', 'duration',
   'ثبّت الجسم أفقياً بساقين متباعدتين.', 'Hold the body horizontal with legs apart.', 'advanced'),
  ('فرونت ليفر كامل', 'Full Front Lever', 'back', 'body weight', 'duration',
   'ثبّت الجسم أفقياً بساقين مضمومتين وممدودتين.', 'Hold the body horizontal with legs together and straight.', 'advanced'),
  ('وقفة يدين على الحائط', 'Wall Handstand Hold', 'shoulders', 'body weight', 'duration',
   'ارفع جسمك على اليدين مستنداً إلى الحائط وثبّت.', 'Kick up into a handstand against the wall and hold.', 'beginner'),
  ('وقفة يدين حرة', 'Freestanding Handstand Hold', 'shoulders', 'body weight', 'duration',
   'ثبّت وقفة اليدين من دون مساندة.', 'Hold a handstand with no support.', 'advanced'),
  ('سكوات وزن الجسم', 'Bodyweight Squat', 'legs', 'body weight', 'bodyweight_reps',
   'انزل حتى توازي الفخذين الأرض ثم قف.', 'Lower until your thighs are parallel to the floor, then stand.', 'beginner'),
  ('بيستول سكوات بمساعدة', 'Assisted Pistol Squat', 'legs', 'body weight', 'bodyweight_reps',
   'انزل على ساق واحدة مع الإمساك بشيء للمساعدة.', 'Squat on one leg while holding something for help.', 'intermediate'),
  ('بيستول سكوات', 'Pistol Squat', 'legs', 'body weight', 'bodyweight_reps',
   'انزل على ساق واحدة حتى الأسفل والأخرى ممدودة أمامك.', 'Squat all the way down on one leg with the other extended in front.', 'advanced'),
  ('جلوس L مطوي', 'Tuck L-Sit', 'core', 'body weight', 'duration',
   'ادعم جسمك بذراعيك وارفع ركبتيك مطويتين.', 'Support yourself on your arms with knees tucked up.', 'intermediate'),
  ('جلوس V', 'V-Sit', 'core', 'body weight', 'duration',
   'ارفع الساقين فوق مستوى الوركين وأنت مدعوم بذراعيك.', 'Raise the legs above hip level while supported on your arms.', 'advanced')
) as v(name_ar, name_en, muscle_group, equipment, measurement_type, instructions_ar, instructions_en, difficulty)
where not exists (
  select 1 from public.exercises x where x.coach_id is null and lower(x.name_en) = lower(v.name_en)
);

update public.exercises e
set skill_group = l.grp, skill_level = l.lvl
from (values
  ('push_up', 1, 'wall push-up'), ('push_up', 2, 'incline push-up'), ('push_up', 3, 'push-up'),
  ('push_up', 4, 'diamond push-up'), ('push_up', 5, 'archer push-up'), ('push_up', 6, 'one-arm push-up'),
  ('pull_up', 1, 'dead hang'), ('pull_up', 2, 'australian row'), ('pull_up', 3, 'pull-up'),
  ('pull_up', 4, 'archer pull-up'), ('pull_up', 5, 'one-arm pull-up'),
  ('muscle_up', 1, 'explosive pull-up'), ('muscle_up', 2, 'bar muscle-up'), ('muscle_up', 3, 'ring muscle-up'),
  ('planche', 1, 'planche lean'), ('planche', 2, 'tuck planche'), ('planche', 3, 'advanced tuck planche'),
  ('planche', 4, 'straddle planche'), ('planche', 5, 'full planche'),
  ('front_lever', 1, 'tuck front lever'), ('front_lever', 2, 'advanced tuck front lever'),
  ('front_lever', 3, 'straddle front lever'), ('front_lever', 4, 'full front lever'),
  ('handstand', 1, 'wall handstand hold'), ('handstand', 2, 'freestanding handstand hold'),
  ('handstand', 3, 'handstand push-up'),
  ('pistol_squat', 1, 'bodyweight squat'), ('pistol_squat', 2, 'assisted pistol squat'), ('pistol_squat', 3, 'pistol squat'),
  ('l_sit', 1, 'tuck l-sit'), ('l_sit', 2, 'l-sit hold'), ('l_sit', 3, 'v-sit')
) as l(grp, lvl, name)
where e.coach_id is null and lower(e.name_en) = l.name and e.skill_group is null;

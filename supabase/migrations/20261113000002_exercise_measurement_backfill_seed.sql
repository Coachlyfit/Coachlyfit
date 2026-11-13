-- Data half of the measurement-types change (schema is 20261113000001).
-- Re-types existing exercises where a signal clearly identifies the type and
-- adds curated global entries for the types the seed had no good example of.
-- Touches no schema. Every UPDATE only affects rows still at the column
-- default and is scoped by a WHERE; the INSERT is idempotent on name_en.

-- ---------------------------------------------------------------------------
-- Backfill. Everything defaults to weight_reps; only rows a signal clearly
-- identifies are re-typed, most specific rule first (each UPDATE only touches
-- rows still at the default, so an earlier rule wins).
-- ---------------------------------------------------------------------------
update public.exercises set measurement_type = 'assisted_bw'
where measurement_type = 'weight_reps' and lower(equipment) = 'assisted';

update public.exercises set measurement_type = 'duration'
where measurement_type = 'weight_reps'
  and name_en ~* '\y(plank|wall sit|dead hang|l-sit|hollow hold|isometric|jump rope|battle rope)';

update public.exercises set measurement_type = 'cardio_machine'
where measurement_type = 'weight_reps'
  and lower(equipment) in ('stationary bike', 'elliptical machine', 'stepmill machine', 'skierg machine', 'upper body ergometer');

update public.exercises set measurement_type = 'distance_duration'
where measurement_type = 'weight_reps'
  and muscle_group = 'cardio'
  and name_en ~* '\y(walk|walking|run|running|jog|jogging|sprint|cycling|swim|swimming|rowing)\y';

update public.exercises set measurement_type = 'bodyweight_reps'
where measurement_type = 'weight_reps'
  and (lower(equipment) in ('body weight', 'none') or muscle_group = 'cardio');

-- ---------------------------------------------------------------------------
-- Curated global exercises for the types the existing seed has no good
-- example of. coach_id null = platform library. Idempotent on name_en.
-- ---------------------------------------------------------------------------
insert into public.exercises
  (name_ar, name_en, muscle_group, equipment, measurement_type, instructions_ar, instructions_en, difficulty)
select v.name_ar, v.name_en, v.muscle_group, v.equipment, v.measurement_type, v.instructions_ar, v.instructions_en, v.difficulty
from (values
  ('الجري على السير', 'Treadmill Run', 'cardio', 'machine', 'cardio_machine',
   'اضبط السرعة والميل، وحافظ على وضعية مستقيمة وخطوات خفيفة.',
   'Set the speed and incline, keep an upright posture and light, quick steps.', 'beginner'),
  ('الجري الخارجي', 'Outdoor Run', 'cardio', 'none', 'distance_duration',
   'اجرِ بوتيرة ثابتة للمسافة أو المدة المطلوبة.',
   'Run at a steady pace for the target distance or time.', 'beginner'),
  ('جهاز التجديف', 'Rowing Machine', 'cardio', 'machine', 'distance_duration',
   'ادفع بالساقين أولاً ثم اسحب بالذراعين، وعد بالترتيب المعاكس.',
   'Drive with the legs first, then pull with the arms; recover in reverse order.', 'beginner'),
  ('دراجة الهجوم', 'Assault Bike', 'cardio', 'stationary bike', 'cardio_machine',
   'استخدم الذراعين والساقين معاً. سجّل السعرات أو المدة.',
   'Drive with arms and legs together. Track calories or time.', 'intermediate'),
  ('دفع الزلاجة', 'Sled Push', 'legs', 'sled machine', 'weight_distance',
   'ادفع الزلاجة المحمّلة بجسم مائل وخطوات قوية للمسافة المحددة.',
   'Push the loaded sled with a forward lean and powerful steps over the set distance.', 'intermediate'),
  ('مشية المزارع', 'Farmer''s Carry', 'full_body', 'dumbbell', 'weight_distance',
   'أمسك ثقلاً في كل يد، وامشِ بوضعية مستقيمة وكتفين ثابتين للمسافة المحددة.',
   'Hold a weight in each hand and walk tall with steady shoulders for the set distance.', 'beginner'),
  ('حبال المعركة', 'Battle Ropes', 'full_body', 'rope', 'duration',
   'اضرب الحبلين بالتناوب أو معاً بإيقاع ثابت للمدة المحددة.',
   'Slam the ropes alternately or together at a steady rhythm for the set time.', 'intermediate'),
  ('الجلوس على الحائط', 'Wall Sit', 'legs', 'none', 'duration',
   'اسند ظهرك للحائط وانزل حتى تصبح ركبتاك بزاوية 90 درجة، وثبّت.',
   'Back against the wall, slide down to 90 degrees at the knees and hold.', 'beginner'),
  ('تمرين تاباتا', 'Tabata Intervals', 'cardio', 'none', 'intervals',
   'اعمل 20 ثانية بأقصى جهد ثم 10 ثوانٍ راحة، كرر 8 جولات.',
   '20 seconds all-out, 10 seconds rest, repeat for 8 rounds.', 'advanced'),
  ('بيربي لأقصى عدد (AMRAP)', 'Burpee AMRAP', 'full_body', 'none', 'reps_duration',
   'أكبر عدد ممكن من البيربي خلال الوقت المحدد.',
   'As many burpees as possible within the time cap.', 'intermediate'),
  ('السباحة', 'Swimming Laps', 'cardio', 'none', 'steps_laps',
   'اسبح بوتيرة ثابتة وسجّل عدد الأطوال.',
   'Swim at a steady pace and count your laps.', 'beginner'),
  ('عدد الخطوات', 'Daily Steps', 'cardio', 'none', 'steps_laps',
   'سجّل عدد خطواتك اليومية.',
   'Log your daily step count.', 'beginner')
) as v(name_ar, name_en, muscle_group, equipment, measurement_type, instructions_ar, instructions_en, difficulty)
where not exists (
  select 1 from public.exercises x where x.coach_id is null and x.name_en = v.name_en
);

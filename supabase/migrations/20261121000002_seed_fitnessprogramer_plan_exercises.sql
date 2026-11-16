-- Exercises the platform plans need and the global library lacks (a second batch after
-- 20261118000002). Source: https://fitnessprogramer.com/exercise/<slug>/ (muscle group, equipment, GIF).
-- Names are the site's exercise names; Arabic names are an original translation.
-- Idempotent: a row is only inserted when no global exercise already has that name,
-- and existing exercises are never touched.
insert into public.exercises (name_ar, name_en, muscle_group, equipment, video_url, difficulty, measurement_type)
select v.name_ar, v.name_en, v.muscle_group, v.equipment, v.video_url, v.difficulty, v.measurement_type
from (values
  ('ضغط الصدر مستلقيًا على الجهاز', 'Lying Chest Press Machine', 'chest', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/Lying-Chest-Press-Machine.gif', null, 'weight_reps'),
  ('ضغط الساقين الأفقي على الجهاز', 'Horizontal Leg Press', 'legs', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/Lever-Horizontal-Leg-Press.gif', null, 'weight_reps'),
  ('رفرفة الصدر على الجهاز', 'Machine Fly', 'chest', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/10301301-Lever-Pec-Deck-Fly_Chest_720.gif', null, 'weight_reps'),
  ('دفع الحبل للأسفل بالكابل', 'Rope Pushdown', 'triceps', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Rope-Pushdown.gif', null, 'weight_reps'),
  ('الاندفاع بوزن الجسم', 'Bodyweight Lunge', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2023/07/bodyweight-lunges.gif', null, 'bodyweight_reps'),
  ('التجديف بالكابل بقبضة ضيقة', 'Close Grip Cable Row', 'back', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/close-grip-cable-row.gif', null, 'weight_reps'),
  ('رفع الدمبل الأمامي بالتناوب', 'Alternating Dumbbell Front Raise', 'shoulders', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Alternating-Dumbbell-Front-Raise.gif', null, 'weight_reps'),
  ('رفع الورك والساقين على مستوى مائل', 'Incline Leg Hip Raise', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Incline-Leg-Hip-Raise.gif', null, 'bodyweight_reps'),
  ('ضغط الدمبل على بنش مائل للأسفل', 'Decline Dumbbell Press', 'chest', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Decline-Dumbbell-Press.gif', null, 'weight_reps'),
  ('رفع الدمبل للكتف الخلفي مع إسناد الرأس على البنش', 'Bent-Over Dumbbell Rear Delt Raise With Head On Bench', 'shoulders', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Bent-Over-Dumbbell-Rear-Delt-Raise-With-Head-On-Bench.gif', null, 'weight_reps'),
  ('ركلة الترايسبس الخلفية بالكابل السفلي', 'Low Cable Tricep Kickback', 'triceps', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2022/10/Low-Cable-Tricep-Kickback.gif', null, 'weight_reps'),
  ('لفّ الأوزان بأداة الرسغ', 'Wrist Roller', 'forearm', 'none', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/wrist-roller.gif', null, 'weight_reps'),
  ('سحب الساقين جلوسًا على البنش', 'Seated Bench Leg Pull-in', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Seated-Bench-Leg-Pull-in.gif', null, 'bodyweight_reps'),
  ('الضغط العسكري بالبار (ضغط الكتف فوق الرأس)', 'Barbell Military Press (Overhead press)', 'shoulders', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/07/Barbell-Standing-Military-Press.gif', null, 'weight_reps'),
  ('مقص الذراعين', 'Arm Scissors', 'chest', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2022/02/Arm-Scissors.gif', null, 'bodyweight_reps'),
  ('تسلّق الجبل العمودي', 'Vertical Mountain Climber', 'cardio', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2022/07/Vertical-Mountain-Climber.gif', null, 'bodyweight_reps'),
  ('القرفصاء على الحائط بكرة التمارين', 'Exercise Ball Wall Squat', 'legs', 'stability ball', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/Exercise-Ball-Wall-Squat.gif', null, 'bodyweight_reps'),
  ('رفع الجسم على شكل V بكرة الثبات', 'Stability Ball V-Up', 'core', 'stability ball', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/V-Up-Down-with-Stability-ball.gif', null, 'bodyweight_reps'),
  ('ضغط مائل للأسفل بكرة الثبات', 'Stability Ball Decline Push-Up', 'chest', 'stability ball', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/stability-ball-decline-push-ups.gif', null, 'bodyweight_reps'),
  ('ثني الساق على كرة الثبات', 'Leg Curl On Stability Ball', 'legs', 'stability ball', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/leg-curl-on-stability-ball.gif', null, 'bodyweight_reps'),
  ('دحرجة الكرة السويسرية', 'Swiss Ball Rollout', 'core', 'stability ball', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/swiss-ball-rollout.gif', null, 'bodyweight_reps'),
  ('ضغط الصدر المائل وقوفًا بالحزام المطاطي', 'Standing Incline Chest Press With Resistance Band', 'chest', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/05/Standing-incline-chest-press.gif', null, 'weight_reps'),
  ('رفرفة الصدر العلوي بالحزام المطاطي', 'High Chest Fly With Resistance Band', 'chest', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/05/High-Chest-Fly-With-Resistance-Band.gif', null, 'weight_reps'),
  ('السحب للأسفل من الركوع بالحزام المطاطي', 'Kneeling Pulldown With Resistance Band', 'back', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/05/Kneeling-pulldown.gif', null, 'weight_reps'),
  ('التجديف جلوسًا بالحزام المطاطي', 'Band Seated Row', 'back', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/02/Band-Seated-Row.gif', null, 'weight_reps'),
  ('تجعيد البايسبس بالحزام المطاطي', 'Band Biceps Curl', 'biceps', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/02/Band-Biceps-Curl.gif', null, 'weight_reps'),
  ('دفع الحزام المطاطي للأسفل (قبضة محايدة)', 'Band Pushdown (Neutral Grip)', 'triceps', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/07/Triceps-Extension-with-Resistance-Bands.gif', null, 'weight_reps'),
  ('الاندفاع بالحزام المطاطي', 'Banded Lunge', 'legs', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/10/Banded-Lunge.gif', null, 'weight_reps'),
  ('تمرين صباح الخير بالحزام المطاطي', 'Good Morning With Resistance Band', 'legs', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/07/Good-Morning-With-Resistance-Band.gif', null, 'weight_reps'),
  ('المشي الجانبي بالحزام المطاطي', 'Resistance Band Lateral Walk', 'hips', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/02/Resistance-Band-Lateral-Walk.gif', null, 'duration'),
  ('ثني الساق بالحزام المطاطي', 'Banded Leg Curl', 'legs', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/10/Banded-Leg-Curl.gif', null, 'weight_reps'),
  ('ركلات الأرداف الخلفية بالحزام المطاطي', 'Banded Glute Kickbacks', 'glutes', 'band', 'https://fitnessprogramer.com/wp-content/uploads/2022/02/Banded-Glute-Kickbacks.gif', null, 'weight_reps'),
  ('المشي السريع', 'Briskly Walking', 'cardio', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/09/Briskly-Walking.gif', null, 'duration'),
  ('الجري', 'Running', 'cardio', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/07/Run.gif', null, 'duration'),
  ('تمرين البطن (سيت أب) بوزن إضافي', 'Weighted Sit-ups', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/weightedsitups.gif', null, 'bodyweight_reps'),
  ('سحب العضلة العريضة بقبضة معكوسة', 'Reverse Lat-Pulldown', 'back', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Reverse-Lat-Pulldown.gif', null, 'weight_reps'),
  ('تجعيد الرسغ بالبار خلف الظهر', 'Behind The Back Barbell Wrist Curl', 'forearm', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Behind-The-Back-Barbell-Wrist-Curl.gif', null, 'weight_reps'),
  ('رفع القرص الأمامي', 'Weight Plate Front Raise', 'shoulders', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Weight-Plate-Front-Raise-1.gif', null, 'weight_reps'),
  ('ركلة الترايسبس الخلفية بالكابل', 'Cable Tricep Kickback', 'triceps', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Tricep-Kickback.gif', null, 'weight_reps'),
  ('التجعيد العكسي بالدمبل', 'Dumbbell Reverse Curl', 'biceps', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/dumbbell-reverse-curl.gif', null, 'weight_reps'),
  ('السكوات البلغاري بالبار', 'Barbell Bulgarian Split Squat', 'legs', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Barbell-Bulgarian-Split-Squat.gif', null, 'weight_reps'),
  ('ركلة الأرداف الخلفية على الجهاز', 'Glute Kickback Machine', 'glutes', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Glute-Kickback-Machine.gif', null, 'weight_reps'),
  ('رفع السمانة على جهاز ضغط الساقين', 'Leg Press Calf Raise', 'calf', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Leg-Press-Calf-Raise.gif', null, 'weight_reps'),
  ('لف الجذع مع الانحناء', 'Bent Over Twist', 'core', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/09/Bent-Over-Twist.gif', null, 'weight_reps'),
  ('الرفع الجانبي بذراع مثنية', 'Bent Arm Lateral Raise', 'shoulders', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Dumbbell-Bent-Arm-Laterl-Raise.gif', null, 'weight_reps'),
  ('تجعيد الرسغ', 'Wrist Curl', 'forearm', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/barbell-Wrist-Curl.gif', null, 'weight_reps'),
  ('الانحناء الجانبي على البنش', 'Bench Side Bend', 'core', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Bench-Side-Bend.gif', null, 'weight_reps'),
  ('تمرين البطن (سيت أب)', 'Sit-ups', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Sit-ups.gif', null, 'bodyweight_reps'),
  ('ضغط البنش بقبضة واسعة', 'Wide Grip Bench Press', 'chest', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/07/Wide-Grip-Barbell-Bench-Press.gif', null, 'weight_reps'),
  ('الضغط الدافع (بوش برس)', 'Push Press', 'shoulders', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/push-press-1.gif', null, 'weight_reps'),
  ('الاندفاع للخلف مع رفع الركبة', 'Reverse Lunge Knee Lift', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Reverse-Lunge-Knee.gif', null, 'bodyweight_reps'),
  ('القرفصاء بلييه بالدمبل', 'Plie Dumbbell Squat', 'legs', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2023/01/Sumo-Plie-Dumbbell-Squat.gif', null, 'weight_reps'),
  ('الاندفاع بالدمبل مع رفع القدم الخلفية على بنش', 'Decline Bench Dumbbell Lunge', 'legs', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2022/02/Decline-Bench-Dumbbell-Lunge.gif', null, 'weight_reps'),
  ('التجديف بالكابل بذراع واحدة', 'One Arm Cable Row', 'back', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/One-arm-Cable-Row.gif', null, 'weight_reps'),
  ('رفرفة الدمبل للأعلى', 'Dumbbell Upward Fly', 'chest', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/10/Dumbbell-Upward-Fly.gif', null, 'weight_reps'),
  ('إطالة الرسغ الديناميكية', 'Dynamic Wrist Stretches', 'forearm', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Wrist-Circles-Stretch.gif', null, 'duration'),
  ('لمس أصابع القدم', 'Toe Reaches', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Toe-Reaches.gif', null, 'bodyweight_reps'),
  ('تمرين البطن بالتقاطع على شكل T', 'T-Cross Sit-up', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/T-Cross-Sit-up.gif', null, 'bodyweight_reps'),
  ('سحب الكابل المتقاطع للعضلة العريضة', 'Cable Crossover Lat Pulldown', 'back', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2022/01/Cable-Crossover-Lat-Pulldown.gif', null, 'weight_reps')
) as v(name_ar, name_en, muscle_group, equipment, video_url, difficulty, measurement_type)
where not exists (
  select 1 from public.exercises e
  where e.coach_id is null and lower(e.name_en) = lower(v.name_en)
);


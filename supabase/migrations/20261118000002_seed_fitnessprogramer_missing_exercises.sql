-- Exercises that the platform template library needs and the global library lacks.
-- Source: https://fitnessprogramer.com/exercise/<slug>/ (muscle group, equipment, GIF).
-- Names are the site's exercise names; Arabic names are an original translation.
-- Idempotent: a row is only inserted when no global exercise already has that name,
-- and existing exercises are never touched.
insert into public.exercises (name_ar, name_en, muscle_group, equipment, video_url, difficulty, measurement_type)
select v.name_ar, v.name_en, v.muscle_group, v.equipment, v.video_url, v.difficulty, v.measurement_type
from (values
  ('الجري برفع الركبتين', 'High Knee Run', 'cardio', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/High-Knee-Run.gif', null, 'bodyweight_reps'),
  ('المشي بوضعية القرفصاء (مشية البطة)', 'Duck Walk', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/09/Duck-Walk.gif', null, 'duration'),
  ('الرفعة الميتة بساق واحدة بوزن الجسم', 'Bodyweight Single Leg Deadlift', 'glutes', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Bodyweight-Single-Leg-Deadlift.gif', null, 'bodyweight_reps'),
  ('تبعيد الورك وقوفًا', 'Standing Hip Abduction', 'hips', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Standing-Hip-Abduction-1.gif', null, 'bodyweight_reps'),
  ('تبعيد الورك من وضعية الجسر', 'Bridge Hip Abduction', 'hips', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Bridge-Hip-Abduction.gif', null, 'bodyweight_reps'),
  ('رفع الساق جانبًا على أربع (حنفية الإطفاء)', 'Fire Hydrant', 'glutes', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Fire-Hydrant.gif', null, 'bodyweight_reps'),
  ('البلانك مع رفع الساق', 'Plank Leg Lift', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Plank-Leg-Lift.gif', null, 'bodyweight_reps'),
  ('القرفصاء سومو بوزن الجسم', 'Bodyweight Sumo Squat', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/BODYWEIGHT-SUMO-SQUAT.gif', null, 'bodyweight_reps'),
  ('بلانك العنكبوت', 'Spider Plank', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Spider-Plank.gif', null, 'bodyweight_reps'),
  ('القفز برفع الركبتين', 'High Knee Skips', 'cardio', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/High-Knee-Skips_Cardio.gif', null, 'duration'),
  ('إطالة عضلات ثني الورك من الركوع النصفي', 'Half Kneeling Hip Flexor Stretch', 'hips', 'body weight', null, null, 'duration'),
  ('إطالة الفخذ الداخلي جانبًا', 'Inner Thigh Side Stretch', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/INNER-THIGH-SIDE-STRETCH.gif', null, 'duration'),
  ('إطالة الفخذ الأمامي وقوفًا', 'Standing Quadriceps Stretch', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/Standing-Quadriceps-Stretch.gif', null, 'duration'),
  ('الكرنش', 'Crunches', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2015/11/Crunch.gif', null, 'bodyweight_reps'),
  ('كرنش الدراجة', 'Bicycle Crunch', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Bicycle-Crunch.gif', null, 'bodyweight_reps'),
  ('لمس الكعبين', 'Heel Touch', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Heel-Touch.gif', null, 'bodyweight_reps'),
  ('ضغط الألماس من وضعية الركبتين', 'Kneeling Diamond Push-Up', 'chest', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Knee-Push-Up.gif', null, 'bodyweight_reps'),
  ('إطالة الصدر برفع الذراعين فوق الرأس', 'Above Head Chest Stretch', 'chest', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Above-Head-Chest-Stretch.gif', null, 'duration'),
  ('انزلاق الذراعين على الحائط', 'Wall Slides', 'shoulders', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/wall-slide.gif', null, 'duration'),
  ('رفع الذراع والساق المتعاكستين', 'Arm Leg Raises', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/arm-leg-raise.gif', null, 'bodyweight_reps'),
  ('البلانك الجانبي', 'Side Plank', 'core', 'body weight', null, null, 'duration'),
  ('دحرجة البار', 'Barbell Rollout', 'core', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/08/Barbell-Rollout.gif', null, 'weight_reps'),
  ('جسر الأرداف', 'Glute Bridge', 'glutes', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Glute-Bridge-.gif', null, 'bodyweight_reps'),
  ('قرفصاء القوزاق', 'Cossack Squat', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Cossack-Squat.gif', null, 'bodyweight_reps'),
  ('سكوات الهاك على الجهاز', 'Hack Squat Machine', 'legs', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Sled-Hack-Squat.gif', null, 'weight_reps'),
  ('ثني الساق على الجهاز', 'Leg Curl', 'legs', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Leg-Curl.gif', null, 'weight_reps'),
  ('تبعيد الورك على الجهاز', 'Hip Abduction Machine', 'hips', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/HiP-ABDUCTION-MACHINE.gif', null, 'weight_reps'),
  ('تقريب الفخذين على الجهاز', 'Hip Adduction Machine', 'hips', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/HIP-ADDUCTION-MACHINE.gif', null, 'weight_reps'),
  ('رفع السمانة على جهاز الهاك سكوات', 'Hack Squat Calf Raise', 'calf', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Hack-Squat-Calf-Raise.gif', null, 'weight_reps'),
  ('تجعيد الذراع بالبار Z', 'Z-Bar Curl', 'biceps', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Z-Bar-Curl.gif', null, 'weight_reps'),
  ('تجعيد الذراع بالدمبل جلوسًا على بنش مائل', 'Seated Incline Dumbbell Curl', 'biceps', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Seated-Incline-Dumbbell-Curl.gif', null, 'weight_reps'),
  ('تمديد الذراع الخلفية بوزن الجسم', 'Bodyweight Skull Crushers', 'triceps', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2022/02/Bodyweight-Skull-Crushers.gif', null, 'bodyweight_reps'),
  ('كرنش جانبي جلوسًا', 'Seated Side Crunch', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Seated-Side-Crunches.gif', null, 'bodyweight_reps'),
  ('رفرفة الكتف الخلفي على الجهاز', 'Rear Delt Fly Machine', 'shoulders', 'machine', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Rear-Delt-Machine-Flys.gif', null, 'weight_reps'),
  ('تقاطع الكابل العلوي', 'High Cable Crossover', 'chest', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/High-Cable-Crossover.gif', null, 'weight_reps'),
  ('ركلات المقص مستلقيًا', 'Lying Scissor Kick', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Lying-Scissor-Kick.gif', null, 'bodyweight_reps'),
  ('رفع الساقين', 'Leg Raise', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Lying-Leg-Raise.gif', null, 'bodyweight_reps'),
  ('طاحونة الهواء بوزن الجسم', 'Bodyweight Windmill', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Bodyweight-Windmill.gif', null, 'bodyweight_reps'),
  ('لمس الركبة بالمرفق المعاكس', 'Elbow To Knee Twists', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/09/Elbow-To-Knee-Twists.gif', null, 'bodyweight_reps'),
  ('الضغط الهندي', 'Hindu Push-ups', 'chest', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Pike-to-Cobra.gif', null, 'bodyweight_reps'),
  ('غطس الترايسبس على البنش', 'Bench Dips', 'triceps', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Bench-Dips.gif', null, 'bodyweight_reps'),
  ('تمديد الترايسبس بذراع واحدة مستلقيًا', 'One-Arm Lying Triceps Extension', 'triceps', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/One-Arm-Lying-Triceps-Extension.gif', null, 'weight_reps'),
  ('ركلة الترايسبس الخلفية مع الانحناء', 'Bent Over Kickback', 'triceps', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Bent-Over-Triceps-Kickback.gif', null, 'weight_reps'),
  ('ضغط المطرقة بالدمبل', 'Hammer Press', 'chest', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Hammer-Press.gif', null, 'weight_reps'),
  ('السكوات البلغاري بالدمبل', 'Dumbbell Bulgarian Split Squat', 'legs', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Dumbbell-Bulgarian-Split-Squat.gif', null, 'weight_reps'),
  ('الاندفاع الجانبي', 'Side Lunge', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Side-Lunge-Stretch.gif', null, 'bodyweight_reps'),
  ('المحارة مستلقيًا على الجنب', 'Side Lying Clam', 'hips', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Side-Lying-Clam.gif', null, 'bodyweight_reps'),
  ('جسر الأرداف بساق واحدة', 'Single Leg Bridge', 'glutes', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Single-Leg-Bridge.gif', null, 'bodyweight_reps'),
  ('إطالة الفخذ الداخلي (العضلة الضامة الكبرى)', 'Thigh Fly (Adductor Magnus Stretch)', 'hips', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Adductor-Magnus-Stretch.gif', null, 'duration'),
  ('البلانك مع لمس الركبة بالمرفق', 'Plank Knee to Elbow', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/PLANK-KNEE-TO-ELBOW.gif', null, 'bodyweight_reps'),
  ('نصف ماسحات الزجاج', 'Half Wipers', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Half-Wipers.gif', null, 'bodyweight_reps'),
  ('رفع الساق من البلانك الجانبي', 'Side Plank Leg Raises', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Side-Plank-Leg-Raises.gif', null, 'bodyweight_reps'),
  ('تقاطع الكابل', 'Cable Crossover', 'chest', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Cable-Crossover.gif', null, 'weight_reps'),
  ('ركلات الحمار', 'Donkey Kicks', 'glutes', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Donkey-Kicks.gif', null, 'bodyweight_reps'),
  ('الدوران الداخلي للكتف بالكابل', 'Cable Internal Shoulder Rotation', 'shoulders', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Cable-Internal-Shoulder-Rotation.gif', null, 'weight_reps'),
  ('الدوران الخارجي للكتف بالكابل', 'Cable External Shoulder Rotation', 'shoulders', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Cable-External-Shoulder-Rotation.gif', null, 'weight_reps'),
  ('الصعود على الصندوق مع رفع الركبة', 'Step Up with Knee Raises', 'legs', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Step-up.gif', null, 'bodyweight_reps'),
  ('لف الجذع وقوفًا', 'Standing Rotation', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Standing-Rotation.gif', null, 'bodyweight_reps'),
  ('تمرين السباحة على الأرض', 'Swimming', 'back', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/05/Swimming.gif', null, 'bodyweight_reps'),
  ('ركلات البلانك المعكوس', 'Reverse Plank Kicks', 'core', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Reverse-Plank-Kicks.gif', null, 'bodyweight_reps'),
  ('إطالة الكتف خلف الظهر', 'Shoulder Stretch Behind The Back', 'shoulders', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Shoulder-Stretch-Behind-Back.gif', null, 'duration'),
  ('رفع الدمبل بوضعية السكابشن', 'Dumbbell Scaption', 'shoulders', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Dumbbell-Scaption.gif', null, 'weight_reps'),
  ('رفع الدمبل الجانبي الخلفي جلوسًا', 'Seated Rear Lateral Dumbbell Raise', 'shoulders', 'dumbbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Seated-Rear-Lateral-Dumbbell-Raise.gif', null, 'weight_reps'),
  ('إطالة الصدر والكتف عند إطار الباب', 'Doorway Pec and Shoulder Stretch', 'chest', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/01/Doorway-chest-and-sshoulder-stretch.gif', null, 'duration'),
  ('إطالة الكتف بسحب الذراع عبر الصدر', 'Across Chest Shoulder Stretch', 'shoulders', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Across-Chest-Shoulder-Stretch.gif', null, 'duration'),
  ('الدفع للأسفل بقبضة معكوسة بذراع واحدة', 'One-Arm Reverse Pushdown', 'triceps', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/One-Arm-Reverse-Push-Down.gif', null, 'weight_reps'),
  ('تجعيد الرسغ العكسي', 'Reverse Wrist Curl', 'forearm', 'barbell', 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Reverse-Wrist-Curl.gif', null, 'weight_reps'),
  ('سحب الحبل للأسفل بذراع مفرودة', 'Rope Straight Arm Pulldown', 'back', 'cable', 'https://fitnessprogramer.com/wp-content/uploads/2021/06/Rope-Straight-Arm-Pulldown.gif', null, 'weight_reps'),
  ('إطالة الوصول للأعلى مع لف الظهر وقوفًا', 'Standing Reach-Up Back Rotation Stretch', 'back', 'body weight', 'https://fitnessprogramer.com/wp-content/uploads/2021/04/Standing-Reach-Up-Back-rotation-Stretch.gif', null, 'duration')
) as v(name_ar, name_en, muscle_group, equipment, video_url, difficulty, measurement_type)
where not exists (
  select 1 from public.exercises e
  where e.coach_id is null and lower(e.name_en) = lower(v.name_en)
);

update public.exercises set image_url = 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Kneeling-Hip-Flexor-Stretch-1-360x360.png'
where coach_id is null and lower(name_en) = lower('Half Kneeling Hip Flexor Stretch') and image_url is null and video_url is null;
update public.exercises set image_url = 'https://fitnessprogramer.com/wp-content/uploads/2021/02/Side-Plank-1-360x360.png'
where coach_id is null and lower(name_en) = lower('Side Plank') and image_url is null and video_url is null;

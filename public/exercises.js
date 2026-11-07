// Exercise library and weekly plan. Pictures are from Free Exercise DB (public domain): public/ex/<id>-0.jpg (start) and -1.jpg (end).
// kind: 'weight' = weight × reps, 'reps' = bodyweight reps, 'time' = seconds held, 'run' = distance + minutes.
// extra: true marks exercises added as suggestions on top of the user's own list.
const GROUPS = {
  back: { name: 'Back & Biceps', icon: '💪' },
  chest: { name: 'Chest & Triceps', icon: '🏋️' },
  legs: { name: 'Legs', icon: '🦵' },
  core: { name: 'Core', icon: '🔥' },
  run: { name: 'Run', icon: '🏃' },
};

// 0 = Sunday. Core isn't scheduled; the app suggests it when it has been a while.
const SCHEDULE = [null, 'back', 'chest', 'legs', 'back', 'chest', 'run'];
const CORE_EVERY_DAYS = 5;

const EXERCISES = [
  { id: 'db_row', group: 'back', name: 'Single-arm dumbbell row', kind: 'weight', img: true, cue: 'Knee and hand on a bench, back flat. Pull the dumbbell to your hip, squeeze the shoulder blade.' },
  { id: 'pullup', group: 'back', name: 'Pull-ups', kind: 'reps', img: true, cue: 'Hang with arms straight, pull until your chin clears the bar, lower slowly.' },
  { id: 'lat_pulldown', group: 'back', name: 'Lat pulldown', kind: 'weight', img: true, cue: 'Wide grip, lean back slightly, pull the bar to your upper chest.' },
  { id: 'db_curl', group: 'back', name: 'Bicep curl', kind: 'weight', img: true, cue: 'Elbows pinned to your sides, curl up, lower under control.' },
  { id: 'hammer_curl', group: 'back', name: 'Hammer curl', kind: 'weight', img: true, extra: true, cue: 'Palms facing each other, curl without swinging.' },
  { id: 'cable_row', group: 'back', name: 'Seated cable row', kind: 'weight', img: true, extra: true, cue: 'Chest up, pull the handle to your stomach, squeeze your back.' },
  { id: 'preacher_curl', group: 'back', name: 'Preacher curl', kind: 'weight', img: true, extra: true, cue: 'Upper arms flat on the pad, curl up, lower all the way.' },
  { id: 'bb_row', group: 'back', name: 'Barbell bent-over row', kind: 'weight', img: true, extra: true, cue: 'Hinge forward with a flat back, row the bar to your lower ribs.' },
  { id: 'face_pull', group: 'back', name: 'Face pull', kind: 'weight', img: true, extra: true, cue: 'Rope at face height, pull toward your forehead, elbows high.' },

  { id: 'bench', group: 'chest', name: 'Bench press', kind: 'weight', img: true, cue: 'Feet planted, lower the bar to mid-chest, press up.' },
  { id: 'kickback', group: 'chest', name: 'Tricep kickback', kind: 'weight', img: true, cue: 'Bent over, upper arm parallel to the floor, straighten the elbow.' },
  { id: 'tri_ext', group: 'chest', name: 'Overhead tricep extension', kind: 'weight', img: true, cue: 'Dumbbell overhead, lower behind your head, extend up.' },
  { id: 'pushup', group: 'chest', name: 'Push-ups', kind: 'reps', img: true, cue: 'Body in a straight line, chest to the floor, push up.' },
  { id: 'dips', group: 'chest', name: 'Dips', kind: 'reps', img: true, cue: 'Lower until elbows reach 90°, press back up.' },
  { id: 'pullover', group: 'chest', name: 'Dumbbell pullover', kind: 'weight', img: true, cue: 'Lying on a bench, lower the dumbbell behind your head with slightly bent arms, pull back over your chest.' },
  { id: 'cg_press', group: 'chest', name: 'Narrow chest press', kind: 'weight', img: true, cue: 'Dumbbells pressed together, lower to your chest, press up.' },
  { id: 'fly', group: 'chest', name: 'Lying chest fly', kind: 'weight', img: true, cue: 'Slight bend in the elbows, open wide, bring the dumbbells together over your chest.' },
  { id: 'incline_press', group: 'chest', name: 'Incline dumbbell press', kind: 'weight', img: true, extra: true, cue: 'Bench at 30–45°, press the dumbbells up and together.' },
  { id: 'pushdown', group: 'chest', name: 'Tricep pushdown', kind: 'weight', img: true, extra: true, cue: 'Elbows at your sides, push the rope down and spread it at the bottom.' },

  { id: 'leg_press', group: 'legs', name: 'Leg press', kind: 'weight', img: true, cue: 'Feet shoulder-width, lower until knees reach 90°, press without locking out.' },
  { id: 'squat', group: 'legs', name: 'Squats', kind: 'weight', img: true, cue: 'Bar on upper back, sit down and back, knees over toes, stand up.' },
  { id: 'bss', group: 'legs', name: 'Bulgarian split squat', kind: 'weight', img: true, cue: 'Rear foot on a bench, drop the back knee toward the floor, drive up through the front heel.' },
  { id: 'lunges', group: 'legs', name: 'Lunges', kind: 'weight', img: true, cue: 'Step forward, both knees to 90°, push back up.' },
  { id: 'leg_ext', group: 'legs', name: 'Leg extensions', kind: 'weight', img: true, cue: 'Straighten your legs fully, pause, lower slowly.' },
  { id: 'rdl', group: 'legs', name: 'Romanian deadlift', kind: 'weight', img: true, extra: true, cue: 'Soft knees, push hips back until you feel your hamstrings, stand tall.' },
  { id: 'leg_curl', group: 'legs', name: 'Lying leg curl', kind: 'weight', img: true, extra: true, cue: 'Curl your heels toward your glutes, lower slowly.' },
  { id: 'calf', group: 'legs', name: 'Standing calf raise', kind: 'weight', img: true, extra: true, cue: 'Rise onto your toes, pause at the top, lower below level.' },

  { id: 'crunches', group: 'core', name: 'Crunches', kind: 'reps', img: true, goal: 100, cue: 'Lift your shoulders off the floor using your abs. Goal: 100 total.' },
  { id: 'glute_bridge', group: 'core', name: 'Glute bridge', kind: 'reps', img: true, cue: 'Lying on your back, drive your hips up and squeeze your glutes.' },
  { id: 'kneel_twist', group: 'core', name: 'Kneeling twist & heel reach', kind: 'reps', img: false, cue: 'Sit on your knees, twist your upper body and reach back to touch each heel.' },
  { id: 'russian_twist', group: 'core', name: 'Russian twist', kind: 'reps', img: true, cue: 'Lean back with feet up, rotate side to side.' },
  { id: 'plank', group: 'core', name: 'Plank', kind: 'time', img: true, cue: 'Forearms down, body straight, brace your abs.' },
  { id: 'leg_raise', group: 'core', name: 'Hanging leg raise', kind: 'reps', img: true, extra: true, cue: 'Hang from a bar, raise straight legs to hip height.' },
  { id: 'bicycle', group: 'core', name: 'Bicycle crunch', kind: 'reps', img: true, extra: true, cue: 'Elbow to opposite knee, alternate sides.' },
  { id: 'dead_bug', group: 'core', name: 'Dead bug', kind: 'reps', img: true, extra: true, cue: 'Lower back pressed down, extend opposite arm and leg.' },
  { id: 'mountain', group: 'core', name: 'Mountain climbers', kind: 'time', img: true, extra: true, cue: 'Plank position, drive your knees to your chest fast.' },

  { id: 'run', group: 'run', name: 'Run', kind: 'run', img: true, cue: 'Log distance and time; the app tracks your pace.' },
];

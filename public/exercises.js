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

// Target muscles and step-by-step instructions, from Free Exercise DB (public domain).
const EXERCISE_DETAILS = {
 "db_row": {
  "muscles": [
   "middle back"
  ],
  "also": [
   "biceps",
   "lats",
   "shoulders"
  ],
  "steps": [
   "Choose a flat bench and place a dumbbell on each side of it.",
   "Place the right leg on top of the end of the bench, bend your torso forward from the waist until your upper body is parallel to the floor, and place your right hand on the other end of the bench for support.",
   "Use the left hand to pick up the dumbbell on the floor and hold the weight while keeping your lower back straight. The palm of the hand should be facing your torso. This will be your starting position.",
   "Pull the resistance straight up to the side of your chest, keeping your upper arm close to your side and keeping the torso stationary. Breathe out as you perform this step. Tip: Concentrate on squeezing the back muscles once you reach the full contracted position. Also, make sure that the force is performed with the back muscles and not the arms. Finally, the upper torso should remain stationary and only the arms should move. The forearms should do no other work except for holding the dumbbell; therefore do not try to pull the dumbbell up using the forearms.",
   "Lower the resistance straight down to the starting position. Breathe in as you perform this step.",
   "Repeat the movement for the specified amount of repetitions.",
   "Switch sides and repeat again with the other arm."
  ]
 },
 "pullup": {
  "muscles": [
   "lats"
  ],
  "also": [
   "biceps",
   "middle back"
  ],
  "steps": [
   "Grab the pull-up bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your hands need to be spaced out at a distance wider than your shoulder width. For a medium grip, your hands need to be spaced out at a distance equal to your shoulder width and for a close grip at a distance smaller than your shoulder width.",
   "As you have both arms extended in front of you holding the bar at the chosen grip width, bring your torso back around 30 degrees or so while creating a curvature on your lower back and sticking your chest out. This is your starting position.",
   "Pull your torso up until the bar touches your upper chest by drawing the shoulders and the upper arms down and back. Exhale as you perform this portion of the movement. Tip: Concentrate on squeezing the back muscles once you reach the full contracted position. The upper torso should remain stationary as it moves through space and only the arms should move. The forearms should do no other work other than hold the bar.",
   "After a second on the contracted position, start to inhale and slowly lower your torso back to the starting position when your arms are fully extended and the lats are fully stretched.",
   "Repeat this motion for the prescribed amount of repetitions."
  ]
 },
 "lat_pulldown": {
  "muscles": [
   "lats"
  ],
  "also": [
   "biceps",
   "middle back",
   "shoulders"
  ],
  "steps": [
   "Sit down on a pull-down machine with a wide bar attached to the top pulley. Make sure that you adjust the knee pad of the machine to fit your height. These pads will prevent your body from being raised by the resistance attached to the bar.",
   "Grab the bar with the palms facing forward using the prescribed grip. Note on grips: For a wide grip, your hands need to be spaced out at a distance wider than shoulder width. For a medium grip, your hands need to be spaced out at a distance equal to your shoulder width and for a close grip at a distance smaller than your shoulder width.",
   "As you have both arms extended in front of you holding the bar at the chosen grip width, bring your torso back around 30 degrees or so while creating a curvature on your lower back and sticking your chest out. This is your starting position.",
   "As you breathe out, bring the bar down until it touches your upper chest by drawing the shoulders and the upper arms down and back. Tip: Concentrate on squeezing the back muscles once you reach the full contracted position. The upper torso should remain stationary and only the arms should move. The forearms should do no other work except for holding the bar; therefore do not try to pull down the bar using the forearms.",
   "After a second at the contracted position squeezing your shoulder blades together, slowly raise the bar back to the starting position when your arms are fully extended and the lats are fully stretched. Inhale during this portion of the movement.",
   "Repeat this motion for the prescribed amount of repetitions."
  ]
 },
 "db_curl": {
  "muscles": [
   "biceps"
  ],
  "also": [
   "forearms"
  ],
  "steps": [
   "Stand up straight with a dumbbell in each hand at arm's length. Keep your elbows close to your torso and rotate the palms of your hands until they are facing forward. This will be your starting position.",
   "Now, keeping the upper arms stationary, exhale and curl the weights while contracting your biceps. Continue to raise the weights until your biceps are fully contracted and the dumbbells are at shoulder level. Hold the contracted position for a brief pause as you squeeze your biceps.",
   "Then, inhale and slowly begin to lower the dumbbells back to the starting position.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "hammer_curl": {
  "muscles": [
   "biceps"
  ],
  "also": [],
  "steps": [
   "Stand up with your torso upright and a dumbbell on each hand being held at arms length. The elbows should be close to the torso.",
   "The palms of the hands should be facing your torso. This will be your starting position.",
   "Now, while holding your upper arm stationary, exhale and curl the weight forward while contracting the biceps. Continue to raise the weight until the biceps are fully contracted and the dumbbell is at shoulder level. Hold the contracted position for a brief moment as you squeeze the biceps. Tip: Focus on keeping the elbow stationary and only moving your forearm.",
   "After the brief pause, inhale and slowly begin the lower the dumbbells back down to the starting position.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "cable_row": {
  "muscles": [
   "middle back"
  ],
  "also": [
   "biceps",
   "lats",
   "shoulders"
  ],
  "steps": [
   "For this exercise you will need access to a low pulley row machine with a V-bar. Note: The V-bar will enable you to have a neutral grip where the palms of your hands face each other. To get into the starting position, first sit down on the machine and place your feet on the front platform or crossbar provided making sure that your knees are slightly bent and not locked.",
   "Lean over as you keep the natural alignment of your back and grab the V-bar handles.",
   "With your arms extended pull back until your torso is at a 90-degree angle from your legs. Your back should be slightly arched and your chest should be sticking out. You should be feeling a nice stretch on your lats as you hold the bar in front of you. This is the starting position of the exercise.",
   "Keeping the torso stationary, pull the handles back towards your torso while keeping the arms close to it until you touch the abdominals. Breathe out as you perform that movement. At that point you should be squeezing your back muscles hard. Hold that contraction for a second and slowly go back to the original position while breathing in.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "preacher_curl": {
  "muscles": [
   "biceps"
  ],
  "also": [],
  "steps": [
   "To perform this movement you will need a preacher bench and an E-Z bar. Grab the E-Z curl bar at the close inner handle (either have someone hand you the bar which is preferable or grab the bar from the front bar rest provided by most preacher benches). The palm of your hands should be facing forward and they should be slightly tilted inwards due to the shape of the bar.",
   "With the upper arms positioned against the preacher bench pad and the chest against it, hold the E-Z Curl Bar at shoulder length. This will be your starting position.",
   "As you breathe in, slowly lower the bar until your upper arm is extended and the biceps is fully stretched.",
   "As you exhale, use the biceps to curl the weight up until your biceps is fully contracted and the bar is at shoulder height. Squeeze the biceps hard and hold this position for a second.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "bb_row": {
  "muscles": [
   "middle back"
  ],
  "also": [
   "biceps",
   "lats",
   "shoulders"
  ],
  "steps": [
   "Holding a barbell with a pronated grip (palms facing down), bend your knees slightly and bring your torso forward, by bending at the waist, while keeping the back straight until it is almost parallel to the floor. Tip: Make sure that you keep the head up. The barbell should hang directly in front of you as your arms hang perpendicular to the floor and your torso. This is your starting position.",
   "Now, while keeping the torso stationary, breathe out and lift the barbell to you. Keep the elbows close to the body and only use the forearms to hold the weight. At the top contracted position, squeeze the back muscles and hold for a brief pause.",
   "Then inhale and slowly lower the barbell back to the starting position.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "face_pull": {
  "muscles": [
   "shoulders"
  ],
  "also": [
   "middle back"
  ],
  "steps": [
   "Facing a high pulley with a rope or dual handles attached, pull the weight directly towards your face, separating your hands as you do so. Keep your upper arms parallel to the ground."
  ]
 },
 "bench": {
  "muscles": [
   "chest"
  ],
  "also": [
   "shoulders",
   "triceps"
  ],
  "steps": [
   "Lie back on a flat bench. Using a medium width grip (a grip that creates a 90-degree angle in the middle of the movement between the forearms and the upper arms), lift the bar from the rack and hold it straight over you with your arms locked. This will be your starting position.",
   "From the starting position, breathe in and begin coming down slowly until the bar touches your middle chest.",
   "After a brief pause, push the bar back to the starting position as you breathe out. Focus on pushing the bar using your chest muscles. Lock your arms and squeeze your chest in the contracted position at the top of the motion, hold for a second and then start coming down slowly again. Tip: Ideally, lowering the weight should take about twice as long as raising it.",
   "Repeat the movement for the prescribed amount of repetitions.",
   "When you are done, place the bar back in the rack."
  ]
 },
 "kickback": {
  "muscles": [
   "triceps"
  ],
  "also": [],
  "steps": [
   "Start with a dumbbell in each hand and your palms facing your torso. Keep your back straight with a slight bend in the knees and bend forward at the waist. Your torso should be almost parallel to the floor. Make sure to keep your head up. Your upper arms should be close to your torso and parallel to the floor. Your forearms should be pointed towards the floor as you hold the weights. There should be a 90-degree angle formed between your forearm and upper arm. This is your starting position.",
   "Now, while keeping your upper arms stationary, exhale and use your triceps to lift the weights until the arm is fully extended. Focus on moving the forearm.",
   "After a brief pause at the top contraction, inhale and slowly lower the dumbbells back down to the starting position.",
   "Repeat the movement for the prescribed amount of repetitions."
  ]
 },
 "tri_ext": {
  "muscles": [
   "triceps"
  ],
  "also": [],
  "steps": [
   "Grab a dumbbell and either sit on a military press bench or a utility bench that has a back support on it as you place the dumbbells upright on top of your thighs or stand up straight.",
   "Clean the dumbbell up to bring it to shoulder height and then extend the arm over your head so that the whole arm is perpendicular to the floor and next to your head. The dumbbell should be on top of you. The other hand can be kept fully extended to the side, by the waist, supporting the upper arm that has the dumbbell or grabbing a fixed surface.",
   "Rotate the wrist so that the palm of your hand is facing forward and the pinkie is facing the ceiling. This will be your starting position.",
   "Slowly lower the dumbbell behind your head as you hold the upper arm stationary. Inhale as you perform this movement and pause when your triceps are fully stretched.",
   "Return to the starting position by flexing your triceps as you breathe out. Tip: It is imperative that only the forearm moves. The upper arm should remain at all times stationary next to your head.",
   "Repeat for the recommended amount of repetitions and switch arms."
  ]
 },
 "pushup": {
  "muscles": [
   "chest"
  ],
  "also": [
   "shoulders",
   "triceps"
  ],
  "steps": [
   "Lie on the floor face down and place your hands about 36 inches apart while holding your torso up at arms length.",
   "Next, lower yourself downward until your chest almost touches the floor as you inhale.",
   "Now breathe out and press your upper body back up to the starting position while squeezing your chest.",
   "After a brief pause at the top contracted position, you can begin to lower yourself downward again for as many repetitions as needed."
  ]
 },
 "dips": {
  "muscles": [
   "triceps"
  ],
  "also": [
   "chest",
   "shoulders"
  ],
  "steps": [
   "To get into the starting position, hold your body at arm's length with your arms nearly locked above the bars.",
   "Now, inhale and slowly lower yourself downward. Your torso should remain upright and your elbows should stay close to your body. This helps to better focus on tricep involvement. Lower yourself until there is a 90 degree angle formed between the upper arm and forearm.",
   "Then, exhale and push your torso back up using your triceps to bring your body back to the starting position.",
   "Repeat the movement for the prescribed amount of repetitions."
  ]
 },
 "pullover": {
  "muscles": [
   "chest"
  ],
  "also": [
   "lats",
   "shoulders",
   "triceps"
  ],
  "steps": [
   "Place a dumbbell standing up on a flat bench.",
   "Ensuring that the dumbbell stays securely placed at the top of the bench, lie perpendicular to the bench (torso across it as in forming a cross) with only your shoulders lying on the surface. Hips should be below the bench and legs bent with feet firmly on the floor. The head will be off the bench as well.",
   "Grasp the dumbbell with both hands and hold it straight over your chest with a bend in your arms. Both palms should be pressing against the underside one of the sides of the dumbbell. This will be your starting position. Caution: Always ensure that the dumbbell used for this exercise is secure. Using a dumbbell with loose plates can result in the dumbbell falling apart and falling on your face.",
   "While keeping your arms locked in the bent arm position, lower the weight slowly in an arc behind your head while breathing in until you feel a stretch on the chest.",
   "At that point, bring the dumbbell back to the starting position using the arc through which the weight was lowered and exhale as you perform this movement.",
   "Hold the weight on the initial position for a second and repeat the motion for the prescribed number of repetitions."
  ]
 },
 "cg_press": {
  "muscles": [
   "triceps"
  ],
  "also": [
   "chest",
   "shoulders"
  ],
  "steps": [
   "Place a dumbbell standing up on a flat bench.",
   "Ensuring that the dumbbell stays securely placed at the top of the bench, lie perpendicular to the bench with only your shoulders lying on the surface. Hips should be below the bench and your legs bent with your feet firmly on the floor.",
   "Grasp the dumbbell with both hands and hold it straight over your chest at arm's length. Both palms should be pressing against the underside of the sides of the dumbbell. This will be your starting position.",
   "Initiate the movement by lowering the dumbbell to your chest.",
   "Return to the starting position by extending the elbows."
  ]
 },
 "fly": {
  "muscles": [
   "chest"
  ],
  "also": [],
  "steps": [
   "Lie down on a flat bench with a dumbbell on each hand resting on top of your thighs. The palms of your hand will be facing each other.",
   "Then using your thighs to help raise the dumbbells, lift the dumbbells one at a time so you can hold them in front of you at shoulder width with the palms of your hands facing each other. Raise the dumbbells up like you're pressing them, but stop and hold just before you lock out. This will be your starting position.",
   "With a slight bend on your elbows in order to prevent stress at the biceps tendon, lower your arms out at both sides in a wide arc until you feel a stretch on your chest. Breathe in as you perform this portion of the movement. Tip: Keep in mind that throughout the movement, the arms should remain stationary; the movement should only occur at the shoulder joint.",
   "Return your arms back to the starting position as you squeeze your chest muscles and breathe out. Tip: Make sure to use the same arc of motion used to lower the weights.",
   "Hold for a second at the contracted position and repeat the movement for the prescribed amount of repetitions."
  ]
 },
 "incline_press": {
  "muscles": [
   "chest"
  ],
  "also": [
   "shoulders",
   "triceps"
  ],
  "steps": [
   "Lie back on an incline bench with a dumbbell in each hand atop your thighs. The palms of your hands will be facing each other.",
   "Then, using your thighs to help push the dumbbells up, lift the dumbbells one at a time so that you can hold them at shoulder width.",
   "Once you have the dumbbells raised to shoulder width, rotate your wrists forward so that the palms of your hands are facing away from you. This will be your starting position.",
   "Be sure to keep full control of the dumbbells at all times. Then breathe out and push the dumbbells up with your chest.",
   "Lock your arms at the top, hold for a second, and then start slowly lowering the weight. Tip Ideally, lowering the weights should take about twice as long as raising them.",
   "Repeat the movement for the prescribed amount of repetitions.",
   "When you are done, place the dumbbells back on your thighs and then on the floor. This is the safest manner to release the dumbbells."
  ]
 },
 "pushdown": {
  "muscles": [
   "triceps"
  ],
  "also": [],
  "steps": [
   "Attach a rope attachment to a high pulley and grab with a neutral grip (palms facing each other).",
   "Standing upright with the torso straight and a very small inclination forward, bring the upper arms close to your body and perpendicular to the floor. The forearms should be pointing up towards the pulley as they hold the rope with the palms facing each other. This is your starting position.",
   "Using the triceps, bring the rope down as you bring each side of the rope to the side of your thighs. At the end of the movement the arms are fully extended and perpendicular to the floor. The upper arms should always remain stationary next to your torso and only the forearms should move. Exhale as you perform this movement.",
   "After holding for a second, at the contracted position, bring the rope slowly up to the starting point. Breathe in as you perform this step.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "leg_press": {
  "muscles": [
   "quadriceps"
  ],
  "also": [
   "calves",
   "glutes",
   "hamstrings"
  ],
  "steps": [
   "Using a leg press machine, sit down on the machine and place your legs on the platform directly in front of you at a medium (shoulder width) foot stance. (Note: For the purposes of this discussion we will use the medium stance described above which targets overall development; however you can choose any of the three stances described in the foot positioning section).",
   "Lower the safety bars holding the weighted platform in place and press the platform all the way up until your legs are fully extended in front of you. Tip: Make sure that you do not lock your knees. Your torso and the legs should make a perfect 90-degree angle. This will be your starting position.",
   "As you inhale, slowly lower the platform until your upper and lower legs make a 90-degree angle.",
   "Pushing mainly with the heels of your feet and using the quadriceps go back to the starting position as you exhale.",
   "Repeat for the recommended amount of repetitions and ensure to lock the safety pins properly once you are done. You do not want that platform falling on you fully loaded."
  ]
 },
 "squat": {
  "muscles": [
   "quadriceps"
  ],
  "also": [
   "calves",
   "glutes",
   "hamstrings",
   "lower back"
  ],
  "steps": [
   "This exercise is best performed inside a squat rack for safety purposes. To begin, first set the bar on a rack to just below shoulder level. Once the correct height is chosen and the bar is loaded, step under the bar and place the back of your shoulders (slightly below the neck) across it.",
   "Hold on to the bar using both arms at each side and lift it off the rack by first pushing with your legs and at the same time straightening your torso.",
   "Step away from the rack and position your legs using a shoulder width medium stance with the toes slightly pointed out. Keep your head up at all times and also maintain a straight back. This will be your starting position. (Note: For the purposes of this discussion we will use the medium stance described above which targets overall development; however you can choose any of the three stances discussed in the foot stances section).",
   "Begin to slowly lower the bar by bending the knees and hips as you maintain a straight posture with the head up. Continue down until the angle between the upper leg and the calves becomes slightly less than 90-degrees. Inhale as you perform this portion of the movement. Tip: If you performed the exercise correctly, the front of the knees should make an imaginary straight line with the toes that is perpendicular to the front. If your knees are past that imaginary line (if they are past your toes) then you are placing undue stress on the knee and the exercise has been performed incorrectly.",
   "Begin to raise the bar as you exhale by pushing the floor with the heel of your foot as you straighten the legs again and go back to the starting position.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "bss": {
  "muscles": [
   "quadriceps"
  ],
  "also": [
   "glutes",
   "hamstrings"
  ],
  "steps": [
   "Position yourself into a staggered stance with the rear foot elevated and front foot forward.",
   "Hold a dumbbell in each hand, letting them hang at the sides. This will be your starting position.",
   "Begin by descending, flexing your knee and hip to lower your body down. Maintain good posture througout the movement. Keep the front knee in line with the foot as you perform the exercise.",
   "At the bottom of the movement, drive through the heel to extend the knee and hip to return to the starting position."
  ]
 },
 "lunges": {
  "muscles": [
   "quadriceps"
  ],
  "also": [
   "calves",
   "glutes",
   "hamstrings"
  ],
  "steps": [
   "Stand with your torso upright holding two dumbbells in your hands by your sides. This will be your starting position.",
   "Step forward with your right leg around 2 feet or so from the foot being left stationary behind and lower your upper body down, while keeping the torso upright and maintaining balance. Inhale as you go down. Note: As in the other exercises, do not allow your knee to go forward beyond your toes as you come down, as this will put undue stress on the knee joint. Make sure that you keep your front shin perpendicular to the ground.",
   "Using mainly the heel of your foot, push up and go back to the starting position as you exhale.",
   "Repeat the movement for the recommended amount of repetitions and then perform with the left leg."
  ]
 },
 "leg_ext": {
  "muscles": [
   "quadriceps"
  ],
  "also": [],
  "steps": [
   "For this exercise you will need to use a leg extension machine. First choose your weight and sit on the machine with your legs under the pad (feet pointed forward) and the hands holding the side bars. This will be your starting position. Tip: You will need to adjust the pad so that it falls on top of your lower leg (just above your feet). Also, make sure that your legs form a 90-degree angle between the lower and upper leg. If the angle is less than 90-degrees then that means the knee is over the toes which in turn creates undue stress at the knee joint. If the machine is designed that way, either look for another machine or just make sure that when you start executing the exercise you stop going down once you hit the 90-degree angle.",
   "Using your quadriceps, extend your legs to the maximum as you exhale. Ensure that the rest of the body remains stationary on the seat. Pause a second on the contracted position.",
   "Slowly lower the weight back to the original position as you inhale, ensuring that you do not go past the 90-degree angle limit.",
   "Repeat for the recommended amount of times."
  ]
 },
 "rdl": {
  "muscles": [
   "hamstrings"
  ],
  "also": [
   "calves",
   "glutes",
   "lower back"
  ],
  "steps": [
   "Put a barbell in front of you on the ground and grab it using a pronated (palms facing down) grip that a little wider than shoulder width. Tip: Depending on the weight used, you may need wrist wraps to perform the exercise and also a raised platform in order to allow for better range of motion.",
   "Bend the knees slightly and keep the shins vertical, hips back and back straight. This will be your starting position.",
   "Keeping your back and arms completely straight at all times, use your hips to lift the bar as you exhale. Tip: The movement should not be fast but steady and under control.",
   "Once you are standing completely straight up, lower the bar by pushing the hips back, only slightly bending the knees, unlike when squatting. Tip: Take a deep breath at the start of the movement and keep your chest up. Hold your breath as you lower and exhale as you complete the movement.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "leg_curl": {
  "muscles": [
   "hamstrings"
  ],
  "also": [],
  "steps": [
   "Adjust the machine lever to fit your height and lie face down on the leg curl machine with the pad of the lever on the back of your legs (just a few inches under the calves). Tip: Preferably use a leg curl machine that is angled as opposed to flat since an angled position is more favorable for hamstrings recruitment.",
   "Keeping the torso flat on the bench, ensure your legs are fully stretched and grab the side handles of the machine. Position your toes straight (or you can also use any of the other two stances described on the foot positioning section). This will be your starting position.",
   "As you exhale, curl your legs up as far as possible without lifting the upper legs from the pad. Once you hit the fully contracted position, hold it for a second.",
   "As you inhale, bring the legs back to the initial position. Repeat for the recommended amount of repetitions."
  ]
 },
 "calf": {
  "muscles": [
   "calves"
  ],
  "also": [],
  "steps": [
   "Adjust the padded lever of the calf raise machine to fit your height.",
   "Place your shoulders under the pads provided and position your toes facing forward (or using any of the two other positions described at the beginning of the chapter). The balls of your feet should be secured on top of the calf block with the heels extending off it. Push the lever up by extending your hips and knees until your torso is standing erect. The knees should be kept with a slight bend; never locked. Toes should be facing forward, outwards or inwards as described at the beginning of the chapter. This will be your starting position.",
   "Raise your heels as you breathe out by extending your ankles as high as possible and flexing your calf. Ensure that the knee is kept stationary at all times. There should be no bending at any time. Hold the contracted position by a second before you start to go back down.",
   "Go back slowly to the starting position as you breathe in by lowering your heels as you bend the ankles until calves are stretched.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "crunches": {
  "muscles": [
   "abdominals"
  ],
  "also": [],
  "steps": [
   "Lie flat on your back with your feet flat on the ground, or resting on a bench with your knees bent at a 90 degree angle. If you are resting your feet on a bench, place them three to four inches apart and point your toes inward so they touch.",
   "Now place your hands lightly on either side of your head keeping your elbows in. Tip: Don't lock your fingers behind your head.",
   "While pushing the small of your back down in the floor to better isolate your abdominal muscles, begin to roll your shoulders off the floor.",
   "Continue to push down as hard as you can with your lower back as you contract your abdominals and exhale. Your shoulders should come up off the floor only about four inches, and your lower back should remain on the floor. At the top of the movement, contract your abdominals hard and keep the contraction for a second. Tip: Focus on slow, controlled movement - don't cheat yourself by using momentum.",
   "After the one second contraction, begin to come down slowly again to the starting position as you inhale.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "glute_bridge": {
  "muscles": [
   "glutes"
  ],
  "also": [
   "hamstrings"
  ],
  "steps": [
   "Lie flat on the floor on your back with the hands by your side and your knees bent. Your feet should be placed around shoulder width. This will be your starting position.",
   "Pushing mainly with your heels, lift your hips off the floor while keeping your back straight. Breathe out as you perform this part of the motion and hold at the top for a second.",
   "Slowly go back to the starting position as you breathe in."
  ]
 },
 "russian_twist": {
  "muscles": [
   "abdominals"
  ],
  "also": [
   "lower back"
  ],
  "steps": [
   "Lie down on the floor placing your feet either under something that will not move or by having a partner hold them. Your legs should be bent at the knees.",
   "Elevate your upper body so that it creates an imaginary V-shape with your thighs. Your arms should be fully extended in front of you perpendicular to your torso and with the hands clasped. This is the starting position.",
   "Twist your torso to the right side until your arms are parallel with the floor while breathing out.",
   "Hold the contraction for a second and move back to the starting position while breathing out. Now move to the opposite side performing the same techniques you applied to the right side.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "plank": {
  "muscles": [
   "abdominals"
  ],
  "also": [],
  "steps": [
   "Get into a prone position on the floor, supporting your weight on your toes and your forearms. Your arms are bent and directly below the shoulder.",
   "Keep your body straight at all times, and hold this position as long as possible. To increase difficulty, an arm or leg can be raised."
  ]
 },
 "leg_raise": {
  "muscles": [
   "abdominals"
  ],
  "also": [],
  "steps": [
   "Hang from a chin-up bar with both arms extended at arms length in top of you using either a wide grip or a medium grip. The legs should be straight down with the pelvis rolled slightly backwards. This will be your starting position.",
   "Raise your legs until the torso makes a 90-degree angle with the legs. Exhale as you perform this movement and hold the contraction for a second or so.",
   "Go back slowly to the starting position as you breathe in.",
   "Repeat for the recommended amount of repetitions."
  ]
 },
 "bicycle": {
  "muscles": [
   "abdominals"
  ],
  "also": [],
  "steps": [
   "Lie flat on the floor with your lower back pressed to the ground. For this exercise, you will need to put your hands beside your head. Be careful however to not strain with the neck as you perform it. Now lift your shoulders into the crunch position.",
   "Bring knees up to where they are perpendicular to the floor, with your lower legs parallel to the floor. This will be your starting position.",
   "Now simultaneously, slowly go through a cycle pedal motion kicking forward with the right leg and bringing in the knee of the left leg. Bring your right elbow close to your left knee by crunching to the side, as you breathe out.",
   "Go back to the initial position as you breathe in.",
   "Crunch to the opposite side as you cycle your legs and bring closer your left elbow to your right knee and exhale.",
   "Continue alternating in this manner until all of the recommended repetitions for each side have been completed."
  ]
 },
 "dead_bug": {
  "muscles": [
   "abdominals"
  ],
  "also": [],
  "steps": [
   "Begin lying on your back with your hands extended above you toward the ceiling.",
   "Bring your feet, knees, and hips up to 90 degrees.",
   "Exhale hard to bring your ribcage down and flatten your back onto the floor, rotating your pelvis up and squeezing your glutes. Hold this position throughout the movement. This will be your starting position.",
   "Initiate the exercise by extending one leg, straightening the knee and hip to bring the leg just above the ground.",
   "Maintain the position of your lumbar and pelvis as you perform the movement, as your back is going to want to arch.",
   "Stay tight and return the working leg to the starting position.",
   "Repeat on the opposite side, alternating until the set is complete."
  ]
 },
 "mountain": {
  "muscles": [
   "quadriceps"
  ],
  "also": [
   "chest",
   "hamstrings",
   "shoulders"
  ],
  "steps": [
   "Begin in a pushup position, with your weight supported by your hands and toes. Flexing the knee and hip, bring one leg until the knee is approximately under the hip. This will be your starting position.",
   "Explosively reverse the positions of your legs, extending the bent leg until the leg is straight and supported by the toe, and bringing the other foot up with the hip and knee flexed. Repeat in an alternating fashion for 20-30 seconds."
  ]
 },
 "run": {
  "muscles": [
   "quadriceps"
  ],
  "also": [
   "calves",
   "glutes",
   "hamstrings"
  ],
  "steps": [
   "To begin, step onto the treadmill and select the desired option from the menu. Most treadmills have a manual setting, or you can select a program to run. Typically, you can enter your age and weight to estimate the amount of calories burned during exercise. Elevation can be adjusted to change the intensity of the workout.",
   "Treadmills offer convenience, cardiovascular benefits, and usually have less impact than running outside. A 150 lb person will burn over 450 calories running 8 miles per hour for 30 minutes. Maintain proper posture as you run, and only hold onto the handles when necessary, such as when dismounting or checking your heart rate."
  ]
 },
 "kneel_twist": {
  "muscles": [
   "abdominals"
  ],
  "also": [
   "lower back"
  ],
  "steps": [
   "Kneel on a mat and sit back on your heels, chest tall.",
   "Twist your upper body to the right and reach your right hand back to touch your right heel.",
   "Return to the centre, then twist left and touch your left heel.",
   "Keep your hips still and move with control; breathe out as you twist."
  ]
 }
};

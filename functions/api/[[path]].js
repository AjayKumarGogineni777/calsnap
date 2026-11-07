// All /api/* routes. Every request must carry `Authorization: Bearer <APP_TOKEN>`.
// Tried in order. Free-tier quotas are per model, so when one is rate limited (429), overloaded (503)
// or otherwise fails, the next (usually smaller) model is tried. 2.5 models take a thinking budget instead of a level.
const MODELS = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const LB_PER_KG = 2.20462;
const HISTORY_DAYS = 35; // daily intake sent to the app, for the 7-day chart and adaptive targets

const PROMPT = `You are a nutrition analyst. Identify every food and drink in the input and estimate
the portion size of each from visual cues (plate size, utensils, packaging). Give calories and
grams of protein, carbs, fat and fiber per item for the portion shown. Use realistic values, account for
cooking oil and sauces, and name the meal briefly (e.g. "Chicken burrito bowl").
Classify it as breakfast, lunch, dinner or snack from the kind of food and the local time it was logged.
If the input contains no food, set is_food to false and return an empty items list.`;

const SUGGEST_PROMPT = `You are a dietitian who loves good food. The user lists foods they have
available and the calories and macros they have left today. Using ONLY foods from their list,
propose 2 different meals. Each must fit within the remaining calories, should get as close as
possible to the remaining protein, and must taste good together. You may adjust portions
(e.g. half a serving). Give each meal a short title and one sentence on why it is a good pick.`;

const ITEM = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    portion: { type: 'STRING' },
    calories: { type: 'NUMBER' },
    protein: { type: 'NUMBER' },
    carbs: { type: 'NUMBER' },
    fat: { type: 'NUMBER' },
    fiber: { type: 'NUMBER' },
  },
  required: ['name', 'portion', 'calories', 'protein', 'carbs', 'fat', 'fiber'],
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_food: { type: 'BOOLEAN' },
    name: { type: 'STRING' },
    meal_type: { type: 'STRING', enum: ['breakfast', 'lunch', 'dinner', 'snack'] },
    items: { type: 'ARRAY', items: ITEM },
  },
  required: ['is_food', 'name', 'meal_type', 'items'],
};

const SUGGEST_SCHEMA = {
  type: 'OBJECT',
  properties: {
    options: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { title: { type: 'STRING' }, why: { type: 'STRING' }, items: { type: 'ARRAY', items: ITEM } },
        required: ['title', 'why', 'items'],
      },
    },
  },
  required: ['options'],
};

const EXERCISE_SCHEMA = { type: 'OBJECT', properties: { calories: { type: 'NUMBER' } }, required: ['calories'] };

export async function onRequest({ request, env, params }) {
  if (!env.APP_TOKEN || request.headers.get('Authorization') !== `Bearer ${env.APP_TOKEN}`) {
    return json({ error: 'unauthorized' }, 401);
  }
  const route = (params.path || []).join('/');
  const method = request.method;
  const db = env.DB;
  const id = Number(route.split('/')[1]);
  try {
    if (route === 'summary' && method === 'GET') {
      return json(await summary(db, checkDate(new URL(request.url).searchParams.get('date'))));
    }
    if (route === 'analyze' && method === 'POST') return json(await analyze(env, await request.json()));
    if (route === 'suggest' && method === 'POST') return json(await suggest(env, await request.json()));
    if (route.startsWith('barcode/') && method === 'GET') return json(await barcode(route.slice(8)));
    if (route === 'meals' && method === 'POST') return json(await addMeal(db, await request.json()));
    if (route.startsWith('meals/') && method === 'PUT') return json(await updateMeal(db, id, await request.json()));
    if (route.startsWith('meals/') && method === 'DELETE') {
      await db.prepare('DELETE FROM meals WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (route === 'profile' && method === 'PUT') {
      const profile = await request.json();
      await db.prepare('INSERT INTO profile (id, data) VALUES (1, ?1) ON CONFLICT(id) DO UPDATE SET data = ?1')
        .bind(JSON.stringify(profile)).run();
      return json(profile);
    }
    if (route === 'weights' && method === 'POST') {
      const { date, kg } = await request.json();
      await upsertWeight(db, checkDate(date), num(kg));
      return json({ ok: true });
    }
    if (route === 'water' && method === 'POST') {
      const { date, ml } = await request.json();
      await db.prepare('INSERT INTO water (date, ml) VALUES (?1, ?2) ON CONFLICT(date) DO UPDATE SET ml = ?2')
        .bind(checkDate(date), Math.max(0, Math.round(num(ml)))).run();
      return json({ ok: true });
    }
    if (route === 'exercises' && method === 'POST') return json(await addExercise(env, db, await request.json()));
    if (route.startsWith('exercises/') && method === 'DELETE') {
      await db.prepare('DELETE FROM exercises WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (route === 'workout' && method === 'GET') {
      return json(await workout(db, checkDate(new URL(request.url).searchParams.get('date'))));
    }
    if (route === 'sets' && method === 'POST') {
      const x = await request.json();
      if (!/^[a-z_]{2,30}$/.test(x.exercise || '')) throw httpError(400, 'invalid exercise');
      return json(await db.prepare('INSERT INTO sets (date, exercise, reps, weight, seconds, km) VALUES (?, ?, ?, ?, ?, ?) RETURNING *')
        .bind(checkDate(x.date), x.exercise, Math.round(num(x.reps)), num(x.weight), Math.round(num(x.seconds)), num(x.km)).first());
    }
    if (route.startsWith('sets/') && method === 'DELETE') {
      await db.prepare('DELETE FROM sets WHERE id = ?').bind(id).run();
      return json({ ok: true });
    }
    if (route === 'health' && method === 'POST') return json(await syncHealth(db, await request.json()));
    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: e.message }, e.status || 500);
  }
}

async function summary(db, date) {
  const days = [...Array(HISTORY_DAYS)].map((_, i) => shiftDate(date, i - HISTORY_DAYS + 1));
  const [profile, meals, health, weights, intake, water, logDates, recents, exercises] = await db.batch([
    db.prepare('SELECT data FROM profile WHERE id = 1'),
    db.prepare('SELECT * FROM meals WHERE date = ? ORDER BY created_at').bind(date),
    db.prepare('SELECT steps, active_kcal FROM health WHERE date = ?').bind(date),
    db.prepare('SELECT date, kg FROM weights ORDER BY date DESC LIMIT 365'),
    db.prepare('SELECT date, SUM(calories) AS calories FROM meals WHERE date BETWEEN ? AND ? GROUP BY date')
      .bind(days[0], date),
    db.prepare('SELECT ml FROM water WHERE date = ?').bind(date),
    db.prepare('SELECT DISTINCT date FROM meals ORDER BY date DESC LIMIT 400'),
    // Latest copy of each distinct meal name, favourites first. Photo is copied on re-log, not sent here.
    db.prepare(`SELECT id, name, calories, protein, carbs, fat, fiber, items, favorite FROM meals
                WHERE id IN (SELECT MAX(id) FROM meals GROUP BY name)
                ORDER BY favorite DESC, id DESC LIMIT 20`),
    db.prepare('SELECT * FROM exercises WHERE date = ? ORDER BY id').bind(date),
  ]);
  const byDay = Object.fromEntries(intake.results.map((w) => [w.date, w.calories]));
  const parse = (m) => ({ ...m, items: m.items ? JSON.parse(m.items) : [] });
  return {
    profile: profile.results[0] ? JSON.parse(profile.results[0].data) : null,
    meals: meals.results.map(parse),
    health: health.results[0] || null,
    weights: weights.results.reverse(),
    intake: days.map((d) => ({ date: d, calories: Math.round(byDay[d] || 0) })),
    water: water.results[0]?.ml || 0,
    logDates: logDates.results.map((r) => r.date),
    recents: recents.results.map(parse),
    exercises: exercises.results,
  };
}

// Sets logged on `date`, the previous session of each exercise (for progression), all-time bests up to `date`,
// and one row per exercise per day over the last 6 months (for charts and the core reminder). Weights are in kg.
async function workout(db, date) {
  const [today, last, best, history] = await db.batch([
    db.prepare('SELECT * FROM sets WHERE date = ? ORDER BY id').bind(date),
    db.prepare(`SELECT * FROM sets WHERE (exercise, date) IN
                (SELECT exercise, MAX(date) FROM sets WHERE date < ?1 GROUP BY exercise) ORDER BY id`).bind(date),
    db.prepare(`SELECT exercise, MAX(weight) AS weight, MAX(weight * (1 + reps / 30.0)) AS e1rm, MAX(reps) AS reps,
                MAX(seconds) AS seconds, MAX(km) AS km FROM sets WHERE date <= ? GROUP BY exercise`).bind(date),
    db.prepare(`SELECT exercise, date, MAX(weight) AS weight, MAX(weight * (1 + reps / 30.0)) AS e1rm, MAX(reps) AS reps,
                MAX(seconds) AS seconds, SUM(km) AS km, SUM(seconds) AS total_seconds, COUNT(*) AS sets
                FROM sets WHERE date >= ? GROUP BY exercise, date ORDER BY date`).bind(shiftDate(date, -180)),
  ]);
  return { today: today.results, last: last.results, best: best.results, history: history.results };
}

async function gemini(env, parts, schema) {
  let res, lastError;
  for (const model of MODELS) {
    const body = JSON.stringify({
      contents: [{ parts }],
      // Higher thinking levels took 40-60s, past Safari's request timeout.
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        thinkingConfig: model.startsWith('gemini-2') ? { thinkingBudget: 0 } : { thinkingLevel: 'minimal' },
      },
    });
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body,
    });
    if (res.ok) break;
    lastError = `${model} ${res.status}: ${(await res.text()).slice(0, 200)}`;
    console.log('Gemini fallback:', lastError);
    if (res.status === 401 || res.status === 403) break; // bad API key: every model would fail
  }
  if (!res.ok) {
    const busy = res.status === 429 || res.status === 503;
    throw httpError(502, busy ? 'All AI models are busy or out of free quota. Try again in a minute.' : `Gemini error ${lastError}`);
  }

  const data = await res.json();
  const text = (data.candidates?.[0]?.content?.parts || [])
    .filter((p) => p.text && !p.thought)
    .map((p) => p.text)
    .join('');
  return JSON.parse(text);
}

const totals = (items) => {
  const sum = (k) => Math.round(items.reduce((s, i) => s + (Number(i[k]) || 0), 0));
  return { calories: sum('calories'), protein: sum('protein'), carbs: sum('carbs'), fat: sum('fat'), fiber: sum('fiber') };
};

// `previous` + `note` re-estimates an earlier result using the user's correction.
// `images` may hold several photos of one meal; `image` is the single photo sent by older app versions.
async function analyze(env, { images, image, mime, note, previous, time }) {
  const photos = images?.length ? images.slice(0, 6) : image ? [image] : [];
  if (!photos.length && !note) throw httpError(400, 'Send a photo or a description');
  const parts = photos.map((data) => ({ inline_data: { mime_type: mime || 'image/jpeg', data } }));
  let text = PROMPT;
  if (photos.length > 1) {
    text += `\n\nThere are ${photos.length} photos of one meal: different angles or different dishes. ` +
      'Count every food once, even if it appears in several photos.';
  }
  if (time) text += `\nLogged at local time ${String(time).slice(0, 5)}.`;
  if (previous) {
    const prev = JSON.stringify({ name: previous.name, items: previous.items });
    text += `\n\nYour previous estimate was: ${prev}\nThe user corrected it: "${note}"\nReturn the full corrected estimate.`;
  } else if (note) {
    text += `\n\nUser description: ${note}`;
  }
  parts.push({ text });

  const out = await gemini(env, parts, SCHEMA);
  if (!out.is_food || !out.items?.length) throw httpError(422, 'No food detected in that photo');
  return { name: out.name, meal_type: out.meal_type, items: out.items, ...totals(out.items) };
}

async function suggest(env, { foods, remaining, note }) {
  if (!foods?.trim()) throw httpError(400, 'List some foods first');
  const r = remaining || {};
  const text = `${SUGGEST_PROMPT}\n\nRemaining today: ${Math.round(r.calories)} kcal, ` +
    `${Math.round(r.protein)} g protein, ${Math.round(r.carbs)} g carbs, ${Math.round(r.fat)} g fat.` +
    (note ? `\nPreferences: ${note}` : '') + `\n\nAvailable foods:\n${foods}`;
  const out = await gemini(env, [{ text }], SUGGEST_SCHEMA);
  return { options: (out.options || []).map((o) => ({ ...o, ...totals(o.items) })) };
}

// Packaged food label values from Open Food Facts (free, no key), scaled to one serving when its size is known, else per 100 g.
async function barcode(code) {
  if (!/^\d{6,14}$/.test(code)) throw httpError(400, 'Invalid barcode');
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,brands,nutriments,serving_size,serving_quantity`,
    { headers: { 'User-Agent': 'CalSnap/1.0 (personal nutrition app)' } },
  );
  const d = await res.json().catch(() => ({}));
  if (d.status !== 1 || !d.product) throw httpError(404, 'Product not found in Open Food Facts. Try a photo instead.');
  const p = d.product, n = p.nutriments || {};
  const grams = Number(p.serving_quantity) || 0;
  const scale = grams ? grams / 100 : 1;
  const v = (k) => (Number(n[`${k}_100g`]) || 0) * scale;
  const kcal = n['energy-kcal_100g'] != null ? v('energy-kcal') : v('energy') / 4.184; // `energy` is kJ
  const name = [p.brands?.split(',')[0]?.trim(), p.product_name].filter(Boolean).join(' ') || 'Packaged food';
  const item = {
    name,
    portion: grams ? p.serving_size || `${grams} g` : '100 g',
    calories: Math.round(kcal),
    protein: Math.round(v('proteins')),
    carbs: Math.round(v('carbohydrates')),
    fat: Math.round(v('fat')),
    fiber: Math.round(v('fiber')),
  };
  return { name, items: [item], ...totals([item]) };
}

// `photo_from` copies the thumbnail of an earlier meal (used when re-logging a recent meal).
// A new meal inherits the favourite flag of earlier meals with the same name.
async function addMeal(db, m) {
  if (!m.name) throw httpError(400, 'name required');
  if (m.photo && m.photo.length > 200_000) throw httpError(400, 'photo thumbnail too large');
  const row = await db
    .prepare(`INSERT INTO meals (date, name, calories, protein, carbs, fat, items, photo, favorite, fiber, meal_type)
              VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
                      COALESCE(?8, (SELECT photo FROM meals WHERE id = ?9)),
                      COALESCE((SELECT MAX(favorite) FROM meals WHERE name = ?2), 0), ?10, ?11)
              RETURNING *`)
    .bind(checkDate(m.date), m.name, num(m.calories), num(m.protein), num(m.carbs), num(m.fat),
      JSON.stringify(m.items || []), m.photo || null, m.photo_from || null, num(m.fiber), mealType(m.meal_type))
    .first();
  return { ...row, items: JSON.parse(row.items) };
}

// Favourite applies to every meal with that name, so the recents list stays consistent.
async function updateMeal(db, id, m) {
  if (!m.name) throw httpError(400, 'name required');
  await db.batch([
    db.prepare('UPDATE meals SET name = ?, calories = ?, protein = ?, carbs = ?, fat = ?, fiber = ?, items = ?, meal_type = ? WHERE id = ?')
      .bind(m.name, num(m.calories), num(m.protein), num(m.carbs), num(m.fat), num(m.fiber), JSON.stringify(m.items || []),
        mealType(m.meal_type), id),
    db.prepare('UPDATE meals SET favorite = ? WHERE name = ?').bind(m.favorite ? 1 : 0, m.name),
  ]);
  return { ok: true };
}

// Calories are optional; when left out, Gemini estimates them from the activity, duration and latest weight.
async function addExercise(env, db, { date, name, minutes, calories }) {
  if (!name?.trim()) throw httpError(400, 'Enter an exercise');
  let kcal = num(calories);
  if (!kcal) {
    const w = await db.prepare('SELECT kg FROM weights ORDER BY date DESC LIMIT 1').first();
    const text = `Estimate the calories burned (beyond resting) by a person weighing ${w?.kg || 75} kg doing: ` +
      `"${name}"${num(minutes) ? ` for ${num(minutes)} minutes` : ''}. Use standard MET values.`;
    kcal = num((await gemini(env, [{ text }], EXERCISE_SCHEMA)).calories);
  }
  return db.prepare('INSERT INTO exercises (date, name, minutes, calories) VALUES (?, ?, ?, ?) RETURNING *')
    .bind(checkDate(date), name.trim(), Math.round(num(minutes)), Math.round(kcal)).first();
}

// Called by the iOS Shortcut. Weight is in the unit the app is set to (kg or lb).
async function syncHealth(db, { date, steps, active_kcal, weight }) {
  checkDate(date);
  await db
    .prepare(`INSERT INTO health (date, steps, active_kcal) VALUES (?1, ?2, ?3)
              ON CONFLICT(date) DO UPDATE SET steps = ?2, active_kcal = ?3`)
    .bind(date, Math.round(num(steps)), Math.round(num(active_kcal)))
    .run();
  if (weight !== undefined && weight !== '' && num(weight) > 0) {
    const p = await db.prepare('SELECT data FROM profile WHERE id = 1').first();
    const imperial = p && JSON.parse(p.data).units === 'imperial';
    await upsertWeight(db, date, imperial ? num(weight) / LB_PER_KG : num(weight));
  }
  return { ok: true };
}

function upsertWeight(db, date, kg) {
  if (!(kg > 0)) throw httpError(400, 'invalid weight');
  return db.prepare('INSERT INTO weights (date, kg) VALUES (?1, ?2) ON CONFLICT(date) DO UPDATE SET kg = ?2')
    .bind(date, Math.round(kg * 100) / 100).run();
}

const mealType = (t) => (['breakfast', 'lunch', 'dinner', 'snack'].includes(t) ? t : null);

// Shortcuts may send numbers as strings like "8,432".
const num = (v) => parseFloat(String(v ?? 0).replace(/,/g, '')) || 0;

function shiftDate(d, n) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function checkDate(d) {
  if (!DATE_RE.test(d || '')) throw httpError(400, 'date must be YYYY-MM-DD');
  return d;
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

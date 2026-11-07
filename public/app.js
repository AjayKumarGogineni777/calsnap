const $ = (s) => document.querySelector(s);
const LB_PER_KG = 2.20462;
const CM_PER_IN = 2.54;
const ML_PER_OZ = 29.5735;
const KCAL_PER_KG = 7700; // energy in 1 kg of body weight change
const DEFAULT_TARGETS = { calories: 2000, protein: 150, carbs: 200, fat: 65, fiber: 28 };
const FIBER_PER_1000_KCAL = 14; // US dietary guideline
const DEFAULT_WATER_ML = 2500;
const GOAL_ADJUST = { lose: -500, maintain: 0, gain: 300 };
const MACROS = ['calories', 'protein', 'carbs', 'fat', 'fiber'];
const MEAL_TYPES = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

let token = load('token');
let date = ymd(new Date());
let data = null; // response of /api/summary for `date`
let remaining = null; // calories/macros left on `date`
let workout = null; // response of /api/workout for `date`

// Add/edit sheet state
let pending = null; // per-serving estimate shown in the result step
let thumb = null; // small data-URL saved with the meal
let photos = []; // { data: base64 sent to Gemini (re-used when fixing a result), url: preview, thumb } per photo
const MAX_PHOTOS = 6;
let editing = null; // id of the saved meal being edited, or null for a new meal
let photoFrom = null; // id of a recent meal whose photo is copied on re-log
let favorite = false;

// ---------- helpers ----------
function load(k) { try { return localStorage.getItem(k) || ''; } catch { return ''; } }
function save(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch {} }
function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`); }
const r = Math.round;
const dayMs = 86400000;
const daysBetween = (a, b) => r((new Date(b) - new Date(a)) / dayMs);
const imperial = () => data?.profile?.units === 'imperial';
const showWeight = (kg) => (imperial() ? kg * LB_PER_KG : kg).toFixed(1);
const unitW = () => (imperial() ? 'lb' : 'kg');
// Profiles saved before fiber tracking have no fiber target, so derive one from calories.
const fiberFor = (calories) => r((calories * FIBER_PER_1000_KCAL) / 1000);
const targets = () => {
  const t = data?.profile?.targets || DEFAULT_TARGETS;
  return { ...t, fiber: t.fiber || fiberFor(t.calories) };
};

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3000);
}

async function api(path, opts = {}) {
  const res = await fetch(`/api/${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(); throw new Error('Wrong access code'); }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

// ---------- theme ----------
const themeSelect = $('#theme-select');
themeSelect.value = load('theme');
function setTheme(t) {
  save('theme', t);
  themeSelect.value = t;
  if (t) document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}
themeSelect.addEventListener('change', () => setTheme(themeSelect.value));

// One tap flips whatever is showing now (the iPhone setting or a saved choice).
$('#theme-toggle').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme
    ? document.documentElement.dataset.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  setTheme(dark ? 'light' : 'dark');
});

// ---------- boot / login ----------
function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  token = $('#login-token').value.trim();
  save('token', token);
  start();
});

async function start() {
  if (!token) return showLogin();
  try {
    await refresh();
  } catch (e) {
    return toast(e.message);
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (!data.profile) {
    $('#setup-hint').hidden = false;
    switchTab('settings');
  }
}

async function refresh() {
  [data, workout] = await Promise.all([api(`summary?date=${date}`), api(`workout?date=${date}`)]);
  renderToday();
  renderTrain();
  renderPlan();
  renderProgress();
  fillProfile(data.profile);
}

// ---------- tabs ----------
function switchTab(name) {
  for (const s of ['today', 'train', 'plan', 'progress', 'settings']) $(`#${s}`).hidden = s !== name;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $('#add-btn').hidden = name !== 'today';
  window.scrollTo(0, 0);
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

// ---------- today ----------
document.querySelectorAll('[data-shift]').forEach((b) =>
  b.addEventListener('click', async () => {
    const d = new Date(`${date}T12:00:00`);
    d.setDate(d.getDate() + Number(b.dataset.shift));
    date = ymd(d);
    try { await refresh(); } catch (e) { toast(e.message); }
  }),
);

function dateLabel() {
  const today = new Date();
  const yest = new Date(); yest.setDate(today.getDate() - 1);
  if (date === ymd(today)) return 'Today';
  if (date === ymd(yest)) return 'Yesterday';
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Consecutive days with at least one meal, counting back from today (or yesterday if today is empty).
function streak() {
  const logged = new Set(data.logDates);
  const d = new Date();
  if (!logged.has(ymd(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (logged.has(ymd(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function renderToday() {
  const { profile, meals, health, exercises } = data;
  const t = targets();
  const eaten = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 };
  for (const m of meals) for (const k in eaten) eaten[k] += m[k] || 0;
  const burned = (health?.active_kcal || 0) + exercises.reduce((s, x) => s + x.calories, 0);
  const budget = t.calories + (profile?.add_burned ? burned : 0);
  const left = budget - eaten.calories;
  remaining = {
    calories: Math.max(0, left),
    protein: Math.max(0, t.protein - eaten.protein),
    carbs: Math.max(0, t.carbs - eaten.carbs),
    fat: Math.max(0, t.fat - eaten.fat),
  };

  $('#date-label').textContent = dateLabel();
  const s = streak();
  $('#streak').hidden = s === 0;
  $('#streak').textContent = `🔥 ${s}-day streak`;

  $('#cal-left').textContent = Math.abs(r(left)).toLocaleString();
  $('#cal-left-label').textContent = left >= 0 ? 'kcal left' : 'kcal over';
  $('#cal-budget').textContent = r(budget).toLocaleString();
  $('#cal-eaten').textContent = r(eaten.calories).toLocaleString();
  $('#cal-burned').textContent = r(burned).toLocaleString();

  const ring = $('#ring-fg');
  const circ = 2 * Math.PI * 52;
  ring.style.strokeDasharray = circ;
  ring.style.strokeDashoffset = circ * (1 - Math.min(1, eaten.calories / budget));
  $('.ring').classList.toggle('over', left < 0);

  for (const k of ['protein', 'carbs', 'fat', 'fiber']) {
    const el = $(`[data-macro=${k}]`);
    const rem = t[k] - eaten[k];
    el.querySelector('b').textContent = `${r(eaten[k])} / ${t[k]}g`;
    el.querySelector('i').style.width = `${Math.min(100, (eaten[k] / t[k]) * 100)}%`;
    el.querySelector('span').textContent = rem >= 0 ? `${r(rem)}g left` : `${r(-rem)}g over`;
  }

  $('#steps').textContent = health ? health.steps.toLocaleString() : '–';
  $('#active').textContent = health ? r(health.active_kcal).toLocaleString() : '–';
  renderWater();
  renderExercises();

  $('#meals-empty').hidden = meals.length > 0;
  // Grouped by meal; within a group, in the order they were logged.
  $('#meals').innerHTML = Object.entries(MEAL_TYPES)
    .map(([type, label]) => {
      const group = meals.filter((m) => mealTypeOf(m) === type);
      if (!group.length) return '';
      const kcal = group.reduce((s, m) => s + m.calories, 0);
      return `<h3 class="meal-head">${label}<span>${r(kcal).toLocaleString()} kcal</span></h3>
        <ul class="meals">${group.map(mealRow).join('')}</ul>`;
    })
    .join('');
}

// Meals logged before meal types existed fall back to the time they were saved.
function mealTypeOf(m) {
  return m.meal_type || mealTypeAt(new Date(`${m.created_at.replace(' ', 'T')}Z`));
}
function mealTypeAt(d) {
  const h = d.getHours();
  return h < 5 ? 'snack' : h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 22 ? 'dinner' : 'snack';
}

function mealRow(m) {
  return `
      <li data-id="${m.id}">
        ${m.photo ? `<img src="${esc(m.photo)}" alt="">` : '<div class="ph">🍽️</div>'}
        <div class="info">
          <b>${m.favorite ? '★ ' : ''}${esc(m.name)}</b>
          <small><span class="p">P ${r(m.protein)}g</span> · <span class="c">C ${r(m.carbs)}g</span> · <span class="f">F ${r(m.fat)}g</span> · Fiber ${r(m.fiber || 0)}g</small>
        </div>
        <span class="kcal">${r(m.calories)}<small>kcal</small></span>
        <button class="del" aria-label="Delete">×</button>
      </li>`;
}

$('#meals').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const id = Number(li.dataset.id);
  if (!e.target.closest('.del')) return openMeal(data.meals.find((m) => m.id === id));
  if (!confirm('Delete this meal?')) return;
  try {
    await api(`meals/${id}`, { method: 'DELETE' });
    await refresh();
  } catch (err) { toast(err.message); }
});

// ---------- macro sources ----------
// Each meal's items, scaled so they add up to the meal's (possibly edited) total; meals without items count as one source.
function sources(k) {
  return data.meals
    .flatMap((m) => {
      const items = m.items || [];
      const sum = items.reduce((s, i) => s + (Number(i[k]) || 0), 0);
      if (!sum) return [{ name: m.name, meal: '', amount: m[k] || 0 }];
      return items.map((i) => ({ name: i.name, meal: m.name, amount: ((Number(i[k]) || 0) * (m[k] || 0)) / sum }));
    })
    .filter((x) => r(x.amount) > 0)
    .sort((a, b) => b.amount - a.amount);
}

$('.macros').addEventListener('click', (e) => {
  const card = e.target.closest('[data-macro]');
  if (!card) return;
  const k = card.dataset.macro;
  const list = sources(k);
  $('#sources-title').textContent = `${k[0].toUpperCase()}${k.slice(1)} sources · ${dateLabel()}`;
  $('#sources-empty').hidden = list.length > 0;
  $('#sources-list').innerHTML = list
    .map((x) => `<li><span>${esc(x.name)} ${x.meal && x.meal !== x.name ? `<small>${esc(x.meal)}</small>` : ''}</span><span>${r(x.amount)}g</span></li>`)
    .join('');
  $('#sources').showModal();
});
$('#sources-close').addEventListener('click', () => $('#sources').close());

// ---------- exercise ----------
function renderExercises() {
  $('#exercises').innerHTML = data.exercises
    .map((x) => `
      <li data-id="${x.id}">
        <span>${esc(x.name)}${x.minutes ? ` <small>${x.minutes} min</small>` : ''}</span>
        <span>${r(x.calories)} kcal <button class="del" aria-label="Delete">×</button></span>
      </li>`)
    .join('');
}

$('#exercise-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button');
  btn.disabled = true;
  try {
    await api('exercises', {
      method: 'POST',
      body: JSON.stringify({ date, name: f.exercise.value.trim(), minutes: f.minutes.value, calories: f.calories.value }),
    });
    f.reset();
    await refresh();
  } catch (err) { toast(err.message); }
  btn.disabled = false;
});

$('#exercises').addEventListener('click', async (e) => {
  if (!e.target.closest('.del')) return;
  try {
    await api(`exercises/${e.target.closest('li').dataset.id}`, { method: 'DELETE' });
    await refresh();
  } catch (err) { toast(err.message); }
});

// ---------- water ----------
const waterGoal = () => data.profile?.water_goal_ml || DEFAULT_WATER_ML;
const glassMl = () => (imperial() ? 8 * ML_PER_OZ : 250);
const showVolume = (ml) => (imperial() ? `${r(ml / ML_PER_OZ)} oz` : `${r(ml).toLocaleString()} ml`);

function renderWater() {
  $('#water-amt').textContent = showVolume(data.water);
  $('#water-goal').textContent = `of ${showVolume(waterGoal())}`;
  $('#water-bar').style.width = `${Math.min(100, (data.water / waterGoal()) * 100)}%`;
}

document.querySelectorAll('[data-water]').forEach((b) =>
  b.addEventListener('click', async () => {
    const prev = data.water;
    data.water = Math.max(0, r(prev + Number(b.dataset.water) * glassMl()));
    renderWater();
    try {
      await api('water', { method: 'POST', body: JSON.stringify({ date, ml: data.water }) });
    } catch (err) {
      data.water = prev;
      renderWater();
      toast(err.message);
    }
  }),
);

// ---------- add / edit food ----------
const sheet = $('#sheet');
const resultForm = $('#step-result');

function sheetStep(name) {
  for (const s of ['input', 'camera', 'scan', 'loading', 'result']) $(`#step-${s}`).hidden = s !== name;
}
function resetSheet() {
  pending = thumb = editing = photoFrom = null;
  photos = [];
  favorite = false;
  $('#library-input').value = '';
  $('#note-input').value = '';
  $('#sheet-error').hidden = true;
  renderPhotos();
}
function closeSheet() {
  stopScan();
  stopCamera();
  sheet.close();
  resetSheet();
}

$('#add-btn').addEventListener('click', () => {
  resetSheet();
  renderRecents();
  sheetStep('input');
  sheet.showModal();
});
$('#sheet-cancel').addEventListener('click', closeSheet);
$('#result-cancel').addEventListener('click', closeSheet);
sheet.addEventListener('cancel', () => { stopScan(); stopCamera(); });

function renderRecents() {
  const list = data.recents || [];
  $('#recent-title').hidden = !list.length;
  $('#recent-list').innerHTML = list
    .map((m, i) => `
      <li data-i="${i}">
        <span>${m.favorite ? '★ ' : ''}${esc(m.name)}</span>
        <small>${r(m.calories)} kcal</small>
      </li>`)
    .join('');
}

// Tapping a recent meal opens it pre-filled; saving logs a new copy on the current day.
$('#recent-list').addEventListener('click', (e) => {
  const li = e.target.closest('li');
  if (!li) return;
  const m = data.recents[Number(li.dataset.i)];
  pending = { name: m.name, items: m.items, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber };
  pending.meal_type = mealTypeAt(new Date());
  photoFrom = m.id;
  thumb = null; // drop photos picked before choosing this recent meal
  photos = [];
  favorite = !!m.favorite;
  showResult();
});

function openMeal(m) {
  resetSheet();
  editing = m.id;
  pending = { name: m.name, items: m.items, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, fiber: m.fiber };
  pending.meal_type = mealTypeOf(m);
  thumb = m.photo;
  photos = m.photo ? [{ data: m.photo.split(',')[1], url: m.photo, thumb: m.photo }] : [];
  favorite = !!m.favorite;
  showResult();
  sheet.showModal();
}

// Draw an image or video frame onto a canvas no larger than `max` px and return a JPEG data URL.
function resize(img, max, quality) {
  const w = img.naturalWidth || img.videoWidth, h = img.naturalHeight || img.videoHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = r(w * scale);
  c.height = r(h * scale);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

function addPhoto(src) {
  if (photos.length >= MAX_PHOTOS) return;
  const url = resize(src, 1024, 0.85);
  photos.push({ data: url.split(',')[1], url, thumb: resize(src, 200, 0.7) });
}

// Photos wait here so the user can add details (e.g. "cooked in butter") before analyzing.
function renderPhotos() {
  thumb = photos[0]?.thumb || null; // the first photo is saved with the meal
  $('#photo-strip').hidden = !photos.length;
  $('#photo-strip').innerHTML = photos
    .map((p, i) => `<div><img src="${p.url}" alt=""><button type="button" data-rm="${i}" aria-label="Remove photo">×</button></div>`)
    .join('');
  $('#describe-btn').textContent = photos.length ? `Analyze ${photos.length > 1 ? `${photos.length} photos` : 'photo'}` : 'Analyze text';
  $('#describe-btn').classList.toggle('primary', photos.length > 0);
}

$('#photo-strip').addEventListener('click', (e) => {
  if (!e.target.dataset.rm) return;
  photos.splice(Number(e.target.dataset.rm), 1);
  renderPhotos();
});

$('#library-input').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (photos.length + files.length > MAX_PHOTOS) toast(`Up to ${MAX_PHOTOS} photos per meal`);
  for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    try { await img.decode(); } catch { showSheetError('Could not read that image'); continue; }
    addPhoto(img);
    URL.revokeObjectURL(url);
  }
  e.target.value = '';
  $('#sheet-error').hidden = true;
  renderPhotos();
});

$('#describe-btn').addEventListener('click', () => {
  const note = $('#note-input').value.trim();
  if (photos.length) return analyze({ images: photos.map((p) => p.data), mime: 'image/jpeg', note }, photos[0].url);
  if (!note) return showSheetError('Take a photo or type what you ate first');
  analyze({ note }, null);
});

// ---------- in-app camera ----------
// The system camera opened from a home-screen web app shows a black screen on some iPhones,
// so photos are taken from a live video stream instead (like the barcode scanner).
let camStream = null;

$('#camera-btn').addEventListener('click', async () => {
  if (photos.length >= MAX_PHOTOS) return toast(`Up to ${MAX_PHOTOS} photos per meal`);
  sheetStep('camera');
  updateCamCount();
  $('#cam-msg').hidden = true;
  try {
    camStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1440 } },
    });
    if ($('#step-camera').hidden) return stopCamera(); // closed while the camera was starting
    $('#cam-video').srcObject = camStream;
    await $('#cam-video').play();
    // Some iOS versions start the stream but never deliver a picture to home-screen apps.
    setTimeout(() => {
      if (camStream && !$('#cam-video').videoWidth) camError('Camera started but sent no picture');
    }, 3000);
  } catch (e) {
    camError(`${e.name}: ${e.message}`);
  }
});

function camError(detail) {
  $('#cam-msg').innerHTML = `Camera isn't working here (${esc(detail)}).<br>
    Use <b>Library</b> instead, or check iPhone Settings → Safari → Camera is set to Allow or Ask.`;
  $('#cam-msg').hidden = false;
}

function stopCamera() {
  camStream?.getTracks().forEach((t) => t.stop());
  camStream = null;
  $('#cam-video').srcObject = null;
}

function updateCamCount() {
  $('#cam-done').textContent = photos.length ? `Done (${photos.length})` : 'Done';
}

$('#cam-snap').addEventListener('click', () => {
  const v = $('#cam-video');
  if (!v.videoWidth) return;
  addPhoto(v);
  updateCamCount();
  v.classList.remove('flash');
  void v.offsetWidth; // restart the flash animation
  v.classList.add('flash');
  if (photos.length >= MAX_PHOTOS) $('#cam-done').click();
});

$('#cam-done').addEventListener('click', () => {
  stopCamera();
  renderPhotos();
  sheetStep('input');
});

function showSheetError(msg) {
  sheetStep('input');
  $('#sheet-error').textContent = msg;
  $('#sheet-error').hidden = false;
}

function showLoading(text, previewUrl) {
  $('#loading-text').textContent = text;
  $('#preview').hidden = !previewUrl;
  if (previewUrl) $('#preview').src = previewUrl;
  sheetStep('loading');
}

async function analyze(payload, previewUrl) {
  showLoading('Analyzing…', previewUrl);
  try {
    // The local time helps Gemini tell breakfast from lunch, dinner or a snack.
    const time = new Date().toTimeString().slice(0, 5);
    pending = await api('analyze', { method: 'POST', body: JSON.stringify({ ...payload, time }) });
  } catch (e) {
    return showSheetError(e.message);
  }
  showResult();
}

function showResult() {
  const f = resultForm;
  $('#result-photo').hidden = !thumb;
  if (thumb) $('#result-photo').src = thumb;
  f.meal_name.value = pending.name;
  f.meal_type.value = pending.meal_type || mealTypeAt(new Date());
  f.servings.value = 1;
  for (const k of MACROS) f[k].value = r(pending[k] || 0);
  renderItems();
  $('#fav-btn').textContent = favorite ? '★' : '☆';
  $('#fix-input').value = '';
  $('#result-error').hidden = true;
  $('#result-delete').hidden = !editing;
  sheetStep('result');
}

$('#fav-btn').addEventListener('click', () => {
  favorite = !favorite;
  $('#fav-btn').textContent = favorite ? '★' : '☆';
});

function renderItems() {
  $('#result-items').innerHTML = (pending.items || [])
    .map((i, n) => `
      <li>
        <span>${esc(i.name)} <small>${esc(i.portion)}</small></span>
        <span>${r(i.calories)} kcal<button type="button" class="item-rm" data-item="${n}" aria-label="Remove ${esc(i.name)}">×</button></span>
      </li>`)
    .join('');
}

// Removing an item takes its numbers off the meal's totals.
$('#result-items').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-item]');
  if (!btn) return;
  const [item] = pending.items.splice(Number(btn.dataset.item), 1);
  const s = Number(resultForm.servings.value) || 1;
  for (const k of MACROS) {
    pending[k] = Math.max(0, (pending[k] || 0) - (Number(item[k]) || 0));
    resultForm[k].value = r(pending[k] * s);
  }
  renderItems();
});

// Servings scales the numbers; editing a number directly sets the per-serving value.
resultForm.addEventListener('input', (e) => {
  const f = resultForm;
  const s = Number(f.servings.value) || 1;
  if (e.target.name === 'servings') {
    for (const k of MACROS) f[k].value = r(pending[k] * s);
  } else if (MACROS.includes(e.target.name)) {
    pending[e.target.name] = Number(e.target.value) / s;
  }
});

// Ask Gemini to re-estimate using a typed correction (and the photo, if there is one).
$('#fix-btn').addEventListener('click', async () => {
  const note = $('#fix-input').value.trim();
  if (!note) return;
  const previous = { ...pending, name: resultForm.meal_name.value };
  showLoading('Updating…', thumb);
  try {
    pending = await api('analyze', {
      method: 'POST',
      body: JSON.stringify({ images: photos.map((p) => p.data), mime: 'image/jpeg', note, previous }),
    });
    showResult();
  } catch (e) {
    pending = previous;
    showResult();
    $('#result-error').textContent = e.message;
    $('#result-error').hidden = false;
  }
});

resultForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = resultForm;
  const s = Number(f.servings.value) || 1;
  const meal = {
    date,
    name: f.meal_name.value.trim(),
    calories: Number(f.calories.value),
    protein: Number(f.protein.value),
    carbs: Number(f.carbs.value),
    fat: Number(f.fat.value),
    fiber: Number(f.fiber.value),
    meal_type: f.meal_type.value,
    items: s === 1 ? pending.items : pending.items.map((i) => ({ ...i, portion: `${i.portion} ×${s}` })),
    favorite,
  };
  try {
    if (editing) {
      await api(`meals/${editing}`, { method: 'PUT', body: JSON.stringify(meal) });
    } else {
      const saved = await api('meals', { method: 'POST', body: JSON.stringify({ ...meal, photo: thumb, photo_from: photoFrom }) });
      // The server copies the favourite flag from earlier meals of the same name; apply the user's choice if it differs.
      if (!!saved.favorite !== favorite) await api(`meals/${saved.id}`, { method: 'PUT', body: JSON.stringify(meal) });
    }
    closeSheet();
    await refresh();
  } catch (err) {
    $('#result-error').textContent = err.message;
    $('#result-error').hidden = false;
  }
});

$('#result-delete').addEventListener('click', async () => {
  if (!confirm('Delete this meal?')) return;
  try {
    await api(`meals/${editing}`, { method: 'DELETE' });
    closeSheet();
    await refresh();
  } catch (err) { toast(err.message); }
});

// ---------- barcode ----------
let stream = null; // camera stream when using the native BarcodeDetector
let scanControls = null; // ZXing scanner controls
let scanning = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Could not load the barcode scanner'));
    document.head.append(s);
  });
}

async function startScan() {
  sheetStep('scan');
  $('#scan-msg').textContent = 'Point the camera at the barcode';
  $('#code-input').value = '';
  const video = $('#scan-video');
  scanning = true;
  try {
    // Safari has no BarcodeDetector, so fall back to ZXing there.
    if ('BarcodeDetector' in window) {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (!scanning) return stopScan();
      video.srcObject = stream;
      await video.play();
      const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
      const tick = async () => {
        if (!scanning) return;
        const codes = await detector.detect(video).catch(() => []);
        if (codes[0]) lookupBarcode(codes[0].rawValue);
        else requestAnimationFrame(tick);
      };
      tick();
    } else {
      if (!window.ZXingBrowser) {
        await loadScript('https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js');
      }
      if (!scanning) return;
      const reader = new ZXingBrowser.BrowserMultiFormatReader();
      scanControls = await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (res) => {
        if (res && scanning) lookupBarcode(res.getText());
      });
      if (!scanning) stopScan();
    }
  } catch {
    $('#scan-msg').textContent = 'Camera unavailable. Type the number under the barcode instead.';
  }
}

function stopScan() {
  scanning = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  scanControls?.stop();
  scanControls = null;
  $('#scan-video').srcObject = null; // iOS keeps the camera busy while a video still holds the stream
}

async function lookupBarcode(code) {
  stopScan();
  showLoading('Looking up product…', null);
  try {
    pending = await api(`barcode/${encodeURIComponent(code)}`);
    thumb = null;
    photos = [];
    showResult();
  } catch (e) {
    showSheetError(e.message);
  }
}

$('#scan-btn').addEventListener('click', startScan);
$('#scan-cancel').addEventListener('click', () => { stopScan(); sheetStep('input'); });
$('#code-form').addEventListener('submit', (e) => {
  e.preventDefault();
  lookupBarcode($('#code-input').value.trim());
});

// ---------- workouts ----------
// Progression: work in an 8–12 rep range; once every set at the top weight reaches 12, add weight and restart at 8.
const MIN_REPS = 8, TOP_REPS = 12;
const EX = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));
let trainPick = null; // { date, group } when the user picks a different workout than the schedule

const shortDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const weightStep = () => (imperial() ? 5 / LB_PER_KG : 2.5); // kg
const fmtW = (kg) => String(Math.round((imperial() ? kg * LB_PER_KG : kg) * 2) / 2); // nearest 0.5 in display units
const toKg = (v) => (imperial() ? v / LB_PER_KG : v);
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(r(sec % 60)).padStart(2, '0')}`;
const utc = (t) => new Date(`${t.replace(' ', 'T')}Z`);

function setLabel(x) {
  const ex = EX[x.exercise];
  if (ex.kind === 'run') return `${x.km} km · ${mmss(x.seconds)}`;
  if (ex.kind === 'time') return `${x.seconds}s`;
  if (ex.kind === 'reps') return `${x.reps}${x.weight ? ` +${fmtW(x.weight)}${unitW()}` : ' reps'}`;
  return x.weight ? `${fmtW(x.weight)}${unitW()} × ${x.reps}` : `${x.reps} reps`;
}

// What to aim for today, from the previous session of this exercise.
function target(ex) {
  const last = workout.last.filter((x) => x.exercise === ex.id);
  if (ex.kind === 'run') {
    const x = last[0];
    if (!x) return { tip: 'Log distance and time to start tracking your pace.' };
    return { tip: `Pace ${mmss(x.seconds / x.km)} /km. Go a little farther or faster.`, km: x.km, minutes: r(x.seconds / 60) };
  }
  if (ex.kind === 'time') {
    const best = Math.max(0, ...last.map((x) => x.seconds));
    return best ? { tip: `Beat last time: hold ${best + 5}s`, seconds: best + 5 } : { tip: 'Hold as long as you can with good form.', seconds: 30 };
  }
  if (ex.kind === 'reps') {
    const best = Math.max(0, ...last.map((x) => x.reps));
    if (ex.goal) {
      const done = workout.today.filter((x) => x.exercise === ex.id).reduce((s, x) => s + x.reps, 0);
      return { tip: `Goal: ${ex.goal} total today · ${done} done`, reps: best || 25 };
    }
    return best ? { tip: `Beat last time: ${best + 1} reps a set`, reps: best + 1 } : { tip: 'Do as many good reps as you can.', reps: 10 };
  }
  if (!last.length) return { tip: `First time: pick a weight you can lift ${MIN_REPS + 2} times with good form.`, reps: MIN_REPS + 2 };
  const top = Math.max(...last.map((x) => x.weight || 0));
  const atTop = last.filter((x) => (x.weight || 0) === top);
  if (atTop.every((x) => x.reps >= TOP_REPS)) {
    const next = top + weightStep();
    return { tip: `🔼 You hit ${TOP_REPS} reps on every set. Go up to ${fmtW(next)} ${unitW()}.`, weight: next, reps: MIN_REPS, up: true };
  }
  const reps = Math.min(TOP_REPS, Math.max(...atTop.map((x) => x.reps)) + 1);
  return { tip: `Beat last time: ${fmtW(top)} ${unitW()} × ${reps}`, weight: top, reps };
}

function trainGroup() {
  if (trainPick?.date === date) return trainPick.group;
  return SCHEDULE[new Date(`${date}T12:00:00`).getDay()] || 'core';
}

function renderTrain() {
  const day = new Date(`${date}T12:00:00`);
  const scheduled = SCHEDULE[day.getDay()];
  const group = trainGroup();
  const weekday = day.toLocaleDateString(undefined, { weekday: 'long' });
  $('#train-day').textContent = `${date === ymd(new Date()) ? 'Today' : shortDate(date)} · ${weekday} · ` +
    (scheduled ? `plan: ${GROUPS[scheduled].name}` : 'rest day');
  $('#train-title').textContent = GROUPS[group].name;

  $('#group-chips').innerHTML = Object.entries(GROUPS)
    .map(([g, x]) => `<button class="chip${g === group ? ' active' : ''}" data-group="${g}">${x.name}${g === scheduled ? '<i></i>' : ''}</button>`)
    .join('');

  // Core isn't on the weekly plan, so nudge when it has been a while.
  const coreDates = workout.history.filter((h) => EX[h.exercise]?.group === 'core' && h.date <= date).map((h) => h.date);
  const lastCore = coreDates.at(-1);
  const since = lastCore ? daysBetween(lastCore, date) : null;
  const coreDue = group !== 'core' && (since === null || since >= CORE_EVERY_DAYS);
  $('#core-hint').hidden = !coreDue;
  if (coreDue) {
    $('#core-hint').innerHTML = `<span>🔥 Core is due: ${since === null ? 'none logged yet' : `last done ${since} days ago`}.</span>
      <button class="btn" data-group="core" type="button">Add core</button>`;
  }

  const today = workout.today;
  const volume = today.reduce((s, x) => s + (x.weight || 0) * (x.reps || 0), 0);
  $('#train-volume').hidden = !today.length;
  $('#train-volume').textContent = `${today.length} set${today.length === 1 ? '' : 's'}${volume ? ` · ${r(imperial() ? volume * LB_PER_KG : volume).toLocaleString()} ${unitW()}` : ''}`;

  // The user's own routine first, then extra suggestions.
  const list = EXERCISES.filter((ex) => ex.group === group);
  const mine = list.filter((ex) => !ex.extra), more = list.filter((ex) => ex.extra);
  $('#train-list').innerHTML = (more.length ? '<h3 class="list-head">Your routine</h3>' : '') + mine.map(exerciseCard).join('') +
    (more.length ? `<h3 class="list-head">More options <small>to add variety</small></h3>${more.map(exerciseCard).join('')}` : '');

  const groups = [...new Set(today.map((x) => EX[x.exercise].group))];
  const logged = groups.length && data.exercises.some((x) => x.name === workoutName(groups));
  $('#finish-btn').disabled = !!logged;
  $('#finish-btn').textContent = logged ? 'Workout logged ✓' : 'Finish workout & log calories';
}

function exerciseCard(ex) {
  const t = target(ex);
  const last = workout.last.filter((x) => x.exercise === ex.id);
  const done = workout.today.filter((x) => x.exercise === ex.id);
  const w = t.weight ? fmtW(t.weight) : '';
  const fields = {
    weight: `<input name="weight" type="number" step="0.5" inputmode="decimal" placeholder="${unitW()}" value="${w}" required>
             <input name="reps" type="number" inputmode="numeric" placeholder="reps" value="${t.reps || ''}" required>`,
    reps: `<input name="reps" type="number" inputmode="numeric" placeholder="reps" value="${t.reps || ''}" required>`,
    time: `<input name="seconds" type="number" inputmode="numeric" placeholder="seconds" value="${t.seconds || ''}" required>`,
    run: `<input name="km" type="number" step="0.01" inputmode="decimal" placeholder="km" value="${t.km || ''}" required>
          <input name="minutes" type="number" step="0.1" inputmode="decimal" placeholder="min" value="${t.minutes || ''}" required>`,
  }[ex.kind];
  return `
    <div class="card ex-card${done.length ? ' done' : ''}" data-ex="${ex.id}">
      <button class="ex-top" type="button" data-info="${ex.id}">
        ${ex.img ? `<img src="/ex/${ex.id}-1.jpg" alt="" loading="lazy">` : `<div class="ex-ph">${GROUPS[ex.group].icon}</div>`}
        <span class="ex-info">
          <b>${esc(ex.name)}</b>
          <span class="muscle-line">${musclesOf(ex).main.map(cap).join(' · ')}</span>
          <small>${last.length ? `Last · ${shortDate(last[0].date)}: ${last.map(setLabel).join(', ')}` : 'Not done yet'}</small>
          <span class="tip${t.up ? ' up' : ''}">${esc(t.tip)}</span>
        </span>
        <span class="chev">›</span>
      </button>
      ${done.length ? `<div class="set-chips">${done.map((x, i) => `<span>${i + 1}. ${setLabel(x)}<button type="button" data-del="${x.id}" aria-label="Delete set">×</button></span>`).join('')}</div>` : ''}
      <form class="set-form row">${fields}<button class="btn primary" type="submit">${ex.kind === 'run' ? 'Log run' : 'Log set'}</button></form>
    </div>`;
}

$('#group-chips').addEventListener('click', pickGroup);
$('#core-hint').addEventListener('click', pickGroup);
function pickGroup(e) {
  const g = e.target.closest('[data-group]')?.dataset.group;
  if (!g) return;
  trainPick = { date, group: g };
  renderTrain();
}

// The measure a personal record is judged on.
function prMetric(ex, x) {
  if (ex.kind === 'weight') return (x.weight || 0) * (1 + (x.reps || 0) / 30); // estimated one-rep max (Epley)
  return { reps: x.reps, time: x.seconds, run: x.km }[ex.kind] || 0;
}

$('#train-list').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const ex = EX[f.closest('[data-ex]').dataset.ex];
  const v = (k) => Number(f[k]?.value) || 0;
  const set = {
    date, exercise: ex.id,
    reps: v('reps'),
    weight: f.weight ? toKg(v('weight')) : 0,
    seconds: ex.kind === 'run' ? r(v('minutes') * 60) : v('seconds'),
    km: v('km'),
  };
  const best = workout.best.find((b) => b.exercise === ex.id);
  const earlier = [...(best ? [best] : []), ...workout.today.filter((x) => x.exercise === ex.id)];
  const before = Math.max(0, ...earlier.map((x) => (ex.kind === 'weight' && x.e1rm != null ? x.e1rm : prMetric(ex, x))));
  f.querySelector('button').disabled = true;
  try {
    await api('sets', { method: 'POST', body: JSON.stringify(set) });
    workout = await api(`workout?date=${date}`);
    renderTrain();
    if (best && prMetric(ex, set) > before + 0.01) toast(`🏆 New personal record on ${ex.name}!`);
  } catch (err) {
    toast(err.message);
    f.querySelector('button').disabled = false;
  }
});

$('#train-list').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    try {
      await api(`sets/${del.dataset.del}`, { method: 'DELETE' });
      workout = await api(`workout?date=${date}`);
      renderTrain();
    } catch (err) { toast(err.message); }
    return;
  }
  const info = e.target.closest('[data-info]');
  if (info) openExercise(EX[info.dataset.info]);
});

const workoutName = (groups) => (groups.length === 1 && groups[0] === 'run'
  ? 'Run'
  : `${groups.map((g) => GROUPS[g].name).join(' + ')} workout`);

// Logs the session as exercise (calories estimated by Gemini) so it counts toward "Burned" on Today.
$('#finish-btn').addEventListener('click', async () => {
  const sets = workout.today;
  if (!sets.length) return toast('Log some sets first');
  const groups = [...new Set(sets.map((x) => EX[x.exercise].group))];
  const runSecs = sets.filter((x) => x.exercise === 'run').reduce((s, x) => s + x.seconds, 0);
  const times = sets.filter((x) => x.exercise !== 'run').map((x) => utc(x.created_at).getTime());
  const liftMin = times.length ? Math.max(10, r((Math.max(...times) - Math.min(...times)) / 60000) + 3) : 0;
  const km = sets.reduce((s, x) => s + (x.km || 0), 0);
  const btn = $('#finish-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Estimating calories…';
  try {
    const saved = await api('exercises', {
      method: 'POST',
      body: JSON.stringify({
        date,
        name: workoutName(groups) + (km ? ` (${r(km * 10) / 10} km)` : ''),
        minutes: liftMin + r(runSecs / 60),
      }),
    });
    await refresh();
    toast(`Logged · ${r(saved.calories)} kcal burned`);
  } catch (err) {
    toast(err.message);
    renderTrain();
  }
});

const cap = (s) => s[0].toUpperCase() + s.slice(1);
function musclesOf(ex) {
  const d = EXERCISE_DETAILS[ex.id] || { muscles: [], also: [] };
  return { main: d.muscles, also: d.also };
}

function openExercise(ex) {
  const best = workout.best.find((b) => b.exercise === ex.id);
  const hist = workout.history.filter((h) => h.exercise === ex.id);
  // Start and finish photos alternate like a GIF to show the movement.
  $('#ex-pics').innerHTML = ex.img
    ? `<img src="/ex/${ex.id}-0.jpg" alt=""><img class="b" src="/ex/${ex.id}-1.jpg" alt=""><span>Start ⇄ Finish</span>`
    : `<div class="ex-ph big">${GROUPS[ex.group].icon}</div>`;
  $('#ex-name').textContent = ex.name;
  $('#ex-group').textContent = GROUPS[ex.group].name;
  const m = musclesOf(ex);
  $('#ex-body').innerHTML = bodyMap(m.main, m.also);
  $('#ex-body').setAttribute('aria-label', `Main: ${m.main.join(', ')}. Also: ${m.also.join(', ') || 'none'}`);
  $('#ex-muscles').innerHTML = m.main.map((x) => `<span class="main">${cap(x)}</span>`).join('') +
    m.also.map((x) => `<span class="also">${cap(x)}</span>`).join('');
  $('#ex-cue').textContent = ex.cue;
  $('#ex-video').href = `https://www.youtube.com/results?search_query=${encodeURIComponent(`how to do ${ex.name} proper form`)}`;
  $('#ex-steps').innerHTML = (EXERCISE_DETAILS[ex.id]?.steps || []).map((s) => `<li>${esc(s)}</li>`).join('');
  $('.ex-steps').open = false;
  $('#ex-sheet').scrollTop = 0;

  const stat = (v, label) => `<div><span>${v}</span><small>${label}</small></div>`;
  const metric = {
    weight: (h) => +fmtW(h.e1rm || 0),
    reps: (h) => h.reps,
    time: (h) => h.seconds,
    run: (h) => h.km,
  }[ex.kind];
  $('#ex-stats').innerHTML = !best ? '' : {
    weight: stat(`${fmtW(best.weight)} ${unitW()}`, 'Heaviest') + stat(`${fmtW(best.e1rm)} ${unitW()}`, 'Est. 1-rep max') + stat(hist.length, 'Sessions'),
    reps: stat(best.reps, 'Most reps') + stat(hist.length, 'Sessions') + stat(hist.at(-1) ? shortDate(hist.at(-1).date) : '–', 'Last'),
    time: stat(`${best.seconds}s`, 'Longest') + stat(hist.length, 'Sessions') + stat(hist.at(-1) ? shortDate(hist.at(-1).date) : '–', 'Last'),
    run: stat(`${best.km} km`, 'Longest') + stat(hist.length, 'Runs') + stat(hist.at(-1) ? shortDate(hist.at(-1).date) : '–', 'Last'),
  }[ex.kind];

  const label = { weight: `Est. 1-rep max (${unitW()})`, reps: 'Best reps', time: 'Seconds', run: 'Distance (km)' }[ex.kind];
  lineChart($('#ex-chart'), hist.map((h) => ({ date: h.date, v: metric(h) })), label);

  $('#ex-history').innerHTML = hist.slice(-10).reverse().map((h) => {
    const txt = {
      weight: `${fmtW(h.weight)} ${unitW()} top · ${h.sets} sets`,
      reps: `${h.reps} reps best · ${h.sets} sets`,
      time: `${h.seconds}s best · ${h.sets} sets`,
      run: `${r(h.km * 100) / 100} km · ${mmss(h.total_seconds)}`,
    }[ex.kind];
    return `<li><span>${shortDate(h.date)}</span><b>${txt}</b></li>`;
  }).join('');
  $('#ex-sheet').showModal();
}
$('#ex-close').addEventListener('click', () => $('#ex-sheet').close());

// Front and back body outline; main muscles solid, supporting muscles lighter. Shapes are mirrored left/right
// around x = 50 within each 100-wide figure. Names match Free Exercise DB muscle names.
function bodyMap(main, also) {
  const cls = (muscle) => (!muscle ? 'n' : main.includes(muscle) ? 'm1' : also.includes(muscle) ? 'm2' : 'm0');
  const pair = (muscle, cx, cy, rx, ry, rot = 0) => [cx, 100 - cx].map((x, i) =>
    `<ellipse class="${cls(muscle)}" cx="${x}" cy="${cy}" rx="${rx}" ry="${ry}" transform="rotate(${i ? -rot : rot} ${x} ${cy})"/>`).join('');
  const mirror = (muscle, d) => `<path class="${cls(muscle)}" d="${d}"/>` +
    `<path class="${cls(muscle)}" d="${d}" transform="matrix(-1 0 0 1 100 0)"/>`;
  const frame = [
    `<circle class="n" cx="50" cy="14" r="10"/>`, `<rect class="n" x="45" y="22" width="10" height="8" rx="2"/>`,
    pair(null, 17, 99, 4, 5), pair(null, 43, 197, 6, 4), `<rect class="n" x="36" y="86" width="28" height="14" rx="5"/>`,
  ].join('');
  const front = frame +
    pair('shoulders', 30, 38, 9, 7) +
    mirror('chest', 'M50 34 C44 33 36 35 33 42 C33 50 40 55 50 54 Z') +
    pair('biceps', 25, 58, 5, 11, 8) +
    pair('forearms', 20, 81, 4.5, 12, 10) +
    `<rect class="${cls('abdominals')}" x="42" y="56" width="16" height="30" rx="5"/>` +
    mirror('abdominals', 'M41 58 L36 60 L37 82 L41 84 Z') +
    pair('quadriceps', 42, 123, 8, 22, -4) +
    pair(null, 42, 148, 5, 4) +
    pair('calves', 42, 170, 5.5, 18);
  const back = frame +
    `<path class="${cls('traps')}" d="M50 26 L36 34 L50 44 L64 34 Z"/>` +
    pair('shoulders', 30, 38, 9, 7) +
    `<rect class="${cls('middle back')}" x="43" y="42" width="14" height="20" rx="4"/>` +
    mirror('lats', 'M41 44 L33 44 L34 60 L41 76 Z') +
    pair('triceps', 25, 58, 5, 11, 8) +
    pair('forearms', 20, 81, 4.5, 12, 10) +
    `<rect class="${cls('lower back')}" x="42" y="63" width="16" height="22" rx="4"/>` +
    pair('glutes', 42.5, 98, 8.5, 9) +
    pair('hamstrings', 42, 128, 7.5, 18, -3) +
    pair('calves', 42, 167, 6.5, 15);
  return `<g transform="translate(5 0)">${front}<text x="50" y="212">Front</text></g>` +
    `<g transform="translate(115 0)">${back}<text x="50" y="212">Back</text></g>`;
}

function lineChart(svg, pts, label) {
  if (pts.length < 2) {
    svg.setAttribute('viewBox', '0 0 320 24');
    svg.innerHTML = `<text x="160" y="16" text-anchor="middle">Log two sessions to see your progress</text>`;
    return;
  }
  const W = 320, H = 140, pad = 16;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const vals = pts.map((p) => p.v);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const t0 = new Date(pts[0].date).getTime(), t1 = new Date(pts.at(-1).date).getTime();
  const px = (p) => pad + ((new Date(p.date).getTime() - t0) / (t1 - t0 || 1)) * (W - 2 * pad);
  const py = (v) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
  svg.innerHTML = `
    <text x="0" y="10">${esc(label)}</text>
    <text x="${W}" y="10" text-anchor="end">${hi}</text>
    <polyline points="${pts.map((p) => `${px(p)},${py(p.v)}`).join(' ')}"></polyline>
    ${pts.map((p) => `<circle cx="${px(p)}" cy="${py(p.v)}" r="3"></circle>`).join('')}`;
}

// ---------- food picker ----------
$('#plan-foods').value = load('planFoods');
$('#plan-foods').addEventListener('input', (e) => save('planFoods', e.target.value));

function renderPlan() {
  const rem = remaining;
  $('#plan-budget').innerHTML = `Left ${date === ymd(new Date()) ? 'today' : `on ${esc(dateLabel())}`}: ` +
    `<b>${r(rem.calories)} kcal</b> · <span class="p">P ${r(rem.protein)}g</span> · ` +
    `<span class="c">C ${r(rem.carbs)}g</span> · <span class="f">F ${r(rem.fat)}g</span>`;
}

let planOptions = [];
$('#plan-btn').addEventListener('click', async () => {
  const foods = $('#plan-foods').value.trim();
  if (!foods) return toast('List the foods you have first');
  const btn = $('#plan-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Thinking…';
  try {
    const res = await api('suggest', {
      method: 'POST',
      body: JSON.stringify({ foods, remaining, note: $('#plan-note').value.trim() }),
    });
    planOptions = res.options;
    $('#plan-results').innerHTML = planOptions
      .map((o, i) => `
        <div class="card option">
          <h3>${esc(o.title)}</h3>
          <p class="muted">${esc(o.why)}</p>
          <ul class="items">
            ${o.items.map((it) => `<li><span>${esc(it.name)} <small>${esc(it.portion)}</small></span><span>${r(it.calories)} kcal</span></li>`).join('')}
          </ul>
          <p class="totals"><b>${o.calories} kcal</b> · <span class="p">P ${o.protein}g</span> · <span class="c">C ${o.carbs}g</span> · <span class="f">F ${o.fat}g</span> · Fiber ${o.fiber}g</p>
          <button class="btn primary wide" data-log="${i}">Log this meal</button>
        </div>`)
      .join('');
  } catch (e) {
    toast(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Pick for me';
  }
});

$('#plan-results').addEventListener('click', async (e) => {
  const o = planOptions[e.target.dataset.log];
  if (!o) return;
  try {
    await api('meals', {
      method: 'POST',
      body: JSON.stringify({
        date, name: o.title, calories: o.calories, protein: o.protein, carbs: o.carbs, fat: o.fat, fiber: o.fiber, items: o.items,
        meal_type: mealTypeAt(new Date()),
      }),
    });
    await refresh();
    switchTab('today');
    toast('Logged');
  } catch (err) { toast(err.message); }
});

// ---------- progress ----------
// Exponentially smoothed weight (MacroFactor-style trend); the smoothing scales with the gap between weigh-ins.
function withTrend(weights) {
  let trend = null, prev = null;
  return weights.map((w) => {
    if (trend === null) trend = w.kg;
    else trend += (1 - 0.9 ** Math.max(1, daysBetween(prev, w.date))) * (w.kg - trend);
    prev = w.date;
    return { ...w, trend };
  });
}

// Trend weight on a given day: the latest trend value on or before it.
function trendOn(series, day) {
  let v = null;
  for (const p of series) if (p.date <= day) v = p.trend;
  return v;
}

// Real-world expenditure from logged intake and trend change over up to 28 completed days:
// TDEE = average intake − (trend change × 7700 kcal/kg ÷ days).
function estimateExpenditure() {
  const series = withTrend(data.weights);
  const today = ymd(new Date());
  const days = data.intake.filter((d) => d.date < today).slice(-28);
  // Start once there is both a logged day and a weigh-in, so the trend has a value at the start.
  const firstLogged = days.find((d) => d.calories > 0)?.date;
  const from = firstLogged && series[0] && (firstLogged > series[0].date ? firstLogged : series[0].date);
  const win = from ? days.filter((d) => d.date >= from) : [];
  const logged = win.filter((d) => d.calories > 0);
  const start = win[0]?.date, end = win.at(-1)?.date;
  const weighIns = start ? series.filter((p) => p.date >= start && p.date <= end).length : 0;
  const span = start ? daysBetween(start, end) + 1 : 0;
  const ready = span >= 14 && logged.length >= 10 && weighIns >= 2;
  if (!ready) return { ready, span, logged: logged.length, weighIns };

  const avg = logged.reduce((s, d) => s + d.calories, 0) / logged.length;
  const change = trendOn(series, end) - trendOn(series, start);
  const tdee = r(avg - (change * KCAL_PER_KG) / span);
  return { ready, span, logged: logged.length, avg: r(avg), change, tdee };
}

function suggestedTargets(calories) {
  const p = data.profile;
  const floor = p.sex === 'male' ? 1500 : 1200;
  const cal = Math.max(floor, r((calories + GOAL_ADJUST[p.goal]) / 10) * 10);
  const protein = p.targets.protein;
  const fat = r((cal * 0.25) / 9);
  return { calories: cal, protein, fat, carbs: Math.max(0, r((cal - protein * 4 - fat * 9) / 4)), fiber: fiberFor(cal) };
}

function renderAdaptive() {
  const el = $('#adaptive');
  if (!data.profile) {
    el.innerHTML = '<p class="muted">Set up your profile in Settings first.</p>';
    return;
  }
  const est = estimateExpenditure();
  if (!est.ready) {
    el.innerHTML = `
      <p>CalSnap learns how many calories you <i>actually</i> burn from your logged food and weight trend, then
      suggests new targets each week.</p>
      <p class="muted">Needs 14+ days with at least 10 logged days and 2 weigh-ins.
      So far: ${est.logged}/10 days logged, ${est.weighIns}/2 weigh-ins.</p>`;
    return;
  }
  const s = suggestedTargets(est.tdee);
  const current = data.profile.targets.calories;
  const changeTxt = `${est.change > 0 ? '+' : ''}${(imperial() ? est.change * LB_PER_KG : est.change).toFixed(1)} ${unitW()}`;
  el.innerHTML = `
    <div class="stats3">
      <div><span>${est.tdee.toLocaleString()}</span><small>Burn / day</small></div>
      <div><span>${est.avg.toLocaleString()}</span><small>Avg eaten</small></div>
      <div><span>${changeTxt}</span><small>Trend, ${est.span} days</small></div>
    </div>
    <p class="muted">For your goal (${esc(data.profile.goal)}), aim for <b>${s.calories.toLocaleString()} kcal</b>
      (P ${s.protein}g · C ${s.carbs}g · F ${s.fat}g). Current target: ${current.toLocaleString()}.</p>
    ${Math.abs(s.calories - current) >= 50 ? '<button id="apply-adaptive" class="btn primary wide">Update my targets</button>' : '<p class="muted">Your targets are on track.</p>'}`;
  $('#apply-adaptive')?.addEventListener('click', async () => {
    try {
      await api('profile', { method: 'PUT', body: JSON.stringify({ ...data.profile, targets: s }) });
      await refresh();
      toast('Targets updated');
    } catch (err) { toast(err.message); }
  });
}

function renderProgress() {
  drawCalories(data.intake.slice(-7));
  renderAdaptive();
  const w = withTrend(data.weights);
  $('#weight-unit').textContent = unitW();
  if (!$('#weight-input').value && w.length) $('#weight-input').value = showWeight(w[w.length - 1].kg);

  if (w.length) {
    const first = w[0].kg, last = w[w.length - 1].trend, diff = last - first;
    $('#w-current').textContent = `${showWeight(last)} ${unitW()}`;
    $('#w-start').textContent = `${showWeight(first)} ${unitW()}`;
    $('#w-change').textContent = `${diff > 0 ? '+' : ''}${(imperial() ? diff * LB_PER_KG : diff).toFixed(1)}`;
  }
  drawChart(w);
  $('#weight-list').innerHTML = w
    .slice(-30)
    .reverse()
    .map((x) => `<li><span>${new Date(`${x.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</span><b>${showWeight(x.kg)} ${unitW()}</b></li>`)
    .join('');
}

// Bar per day, dashed line at the calorie target; days over target are red.
function drawCalories(week) {
  const target = targets().calories;
  const logged = week.filter((d) => d.calories > 0);
  $('#c-avg').textContent = logged.length ? r(logged.reduce((s, d) => s + d.calories, 0) / logged.length).toLocaleString() : '–';
  $('#c-target').textContent = target.toLocaleString();
  $('#c-days').textContent = `${logged.filter((d) => d.calories <= target).length} / ${logged.length}`;

  const W = 320, top = 18, base = 150, slot = W / 7, bw = slot * 0.55;
  const max = Math.max(target * 1.2, ...week.map((d) => d.calories));
  const y = (v) => base - (v / max) * (base - top);
  const bars = week.map((d, i) => {
    const x = i * slot + (slot - bw) / 2, h = base - y(d.calories);
    const label = new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' });
    return `
      <rect x="${x}" y="${y(d.calories)}" width="${bw}" height="${h}" rx="4" class="${d.calories > target ? 'over' : ''}"></rect>
      ${d.calories ? `<text x="${x + bw / 2}" y="${y(d.calories) - 4}" text-anchor="middle">${d.calories}</text>` : ''}
      <text x="${x + bw / 2}" y="${base + 14}" text-anchor="middle" class="${d.date === date ? 'cur' : ''}">${label}</text>`;
  });
  $('#cal-chart').innerHTML = `
    ${bars.join('')}
    <line x1="0" x2="${W}" y1="${y(target)}" y2="${y(target)}"></line>`;
}

function drawChart(w) {
  const svg = $('#weight-chart');
  if (w.length < 2) {
    svg.innerHTML = '<text x="160" y="80" text-anchor="middle">Log at least two weigh-ins to see a trend</text>';
    return;
  }
  const W = 320, H = 160, pad = 14;
  const t0 = new Date(w[0].date).getTime(), t1 = new Date(w[w.length - 1].date).getTime();
  const scale = (kg) => +showWeight(kg);
  const vals = w.flatMap((x) => [scale(x.kg), scale(x.trend)]);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const px = (x) => pad + ((new Date(x.date).getTime() - t0) / (t1 - t0 || 1)) * (W - 2 * pad);
  const py = (v) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
  svg.innerHTML = `
    <text x="0" y="${pad - 4}">${hi.toFixed(1)}</text>
    <text x="0" y="${H}">${lo.toFixed(1)}</text>
    ${w.map((x) => `<circle cx="${px(x)}" cy="${py(scale(x.kg))}" r="2.5"></circle>`).join('')}
    <polyline points="${w.map((x) => `${px(x)},${py(scale(x.trend))}`).join(' ')}"></polyline>`;
}

$('#weight-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = Number($('#weight-input').value);
  try {
    await api('weights', { method: 'POST', body: JSON.stringify({ date: ymd(new Date()), kg: imperial() ? v / LB_PER_KG : v }) });
    await refresh();
    toast('Weight logged');
  } catch (err) { toast(err.message); }
});

// ---------- settings ----------
const pf = $('#profile-form');

function fillProfile(p) {
  $('#sync-url').textContent = `${location.origin}/api/health`;
  if (!p) {
    pf.water_goal.value = DEFAULT_WATER_ML;
    return;
  }
  const imp = p.units === 'imperial';
  pf.units.value = p.units;
  pf.sex.value = p.sex;
  pf.age.value = p.age;
  pf.height.value = (imp ? p.height_cm / CM_PER_IN : p.height_cm).toFixed(1);
  pf.weight.value = (imp ? p.weight_kg * LB_PER_KG : p.weight_kg).toFixed(1);
  pf.activity.value = String(p.activity);
  pf.goal.value = p.goal;
  for (const [k, v] of Object.entries(targets())) pf[`t_${k}`].value = v;
  const water = p.water_goal_ml || DEFAULT_WATER_ML;
  pf.water_goal.value = r(imp ? water / ML_PER_OZ : water);
  pf.add_burned.checked = !!p.add_burned;
  setUnitLabels();
}

function setUnitLabels() {
  const imp = pf.units.value === 'imperial';
  $('.u-h').textContent = imp ? 'in' : 'cm';
  $('.u-w').textContent = imp ? 'lb' : 'kg';
  $('.u-v').textContent = imp ? 'oz' : 'ml';
}

// Convert the height/weight/water fields when the unit system changes.
pf.units.addEventListener('change', () => {
  const toImp = pf.units.value === 'imperial';
  if (pf.height.value) pf.height.value = (toImp ? pf.height.value / CM_PER_IN : pf.height.value * CM_PER_IN).toFixed(1);
  if (pf.weight.value) pf.weight.value = (toImp ? pf.weight.value * LB_PER_KG : pf.weight.value / LB_PER_KG).toFixed(1);
  if (pf.water_goal.value) pf.water_goal.value = r(toImp ? pf.water_goal.value / ML_PER_OZ : pf.water_goal.value * ML_PER_OZ);
  setUnitLabels();
});

function readBody() {
  const imp = pf.units.value === 'imperial';
  return {
    units: pf.units.value,
    sex: pf.sex.value,
    age: Number(pf.age.value),
    height_cm: Number(pf.height.value) * (imp ? CM_PER_IN : 1),
    weight_kg: Number(pf.weight.value) / (imp ? LB_PER_KG : 1),
    activity: Number(pf.activity.value),
    goal: pf.goal.value,
  };
}

// Mifflin-St Jeor BMR × activity, adjusted for goal; protein 1.8 g/kg, fat 25% of calories, carbs the rest.
function calcTargets(b) {
  const bmr = 10 * b.weight_kg + 6.25 * b.height_cm - 5 * b.age + (b.sex === 'male' ? 5 : -161);
  const floor = b.sex === 'male' ? 1500 : 1200;
  const calories = Math.max(floor, r((bmr * b.activity + GOAL_ADJUST[b.goal]) / 10) * 10);
  const protein = r(b.weight_kg * 1.8);
  const fat = r((calories * 0.25) / 9);
  const carbs = Math.max(0, r((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, carbs, fat, fiber: fiberFor(calories) };
}

$('#calc-btn').addEventListener('click', () => {
  const b = readBody();
  if (!b.age || !b.height_cm || !b.weight_kg) return toast('Fill in age, height and weight first');
  const t = calcTargets(b);
  for (const k in t) pf[`t_${k}`].value = t[k];
});

pf.addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = readBody();
  const profile = {
    ...body,
    targets: {
      calories: Number(pf.t_calories.value),
      protein: Number(pf.t_protein.value),
      carbs: Number(pf.t_carbs.value),
      fat: Number(pf.t_fat.value),
      fiber: Number(pf.t_fiber.value),
    },
    water_goal_ml: r(Number(pf.water_goal.value) * (body.units === 'imperial' ? ML_PER_OZ : 1)),
    add_burned: pf.add_burned.checked,
  };
  try {
    const first = !data.profile;
    await api('profile', { method: 'PUT', body: JSON.stringify(profile) });
    if (!data.weights.length) {
      await api('weights', { method: 'POST', body: JSON.stringify({ date: ymd(new Date()), kg: profile.weight_kg }) });
    }
    $('#weight-input').value = '';
    await refresh();
    $('#setup-hint').hidden = true;
    toast('Saved');
    if (first) switchTab('today');
  } catch (err) { toast(err.message); }
});

$('#logout').addEventListener('click', () => {
  token = '';
  save('token', '');
  showLogin();
});

start();

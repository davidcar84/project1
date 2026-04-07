// Workout Tracker — Firebase Auth + Firestore, hash-routed SPA.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  collection, doc, getDocs, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, writeBatch, where
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';
import { DEFAULT_EXERCISES } from './seed-exercises.js';

const app = initializeApp(firebaseConfig);
const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

// ── State ───────────────────────────────────────────────────
const state = {
  user: null,
  exercises: [],   // cached exercise library
  unit: localStorage.getItem('unit') || 'kg',
};

const mainView = document.getElementById('mainView');
const bottomNav = document.getElementById('bottomNav');
const signOutBtn = document.getElementById('signOutBtn');
const installBtn = document.getElementById('installBtn');

// ── PWA install prompt ──────────────────────────────────────
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// ── Auth ────────────────────────────────────────────────────
signOutBtn.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  state.user = user;
  if (!user) {
    bottomNav.hidden = true;
    signOutBtn.hidden = true;
    renderSignIn();
    return;
  }
  signOutBtn.hidden = false;
  bottomNav.hidden = false;
  await ensureUserSeeded();
  await loadExercises();
  route();
});

async function ensureUserSeeded() {
  const uref = doc(db, 'users', state.user.uid);
  const snap = await getDoc(uref);
  if (!snap.exists()) {
    await setDoc(uref, {
      displayName: state.user.displayName || '',
      createdAt: serverTimestamp(),
    });
    // Seed default exercises.
    const batch = writeBatch(db);
    const exCol = collection(db, 'users', state.user.uid, 'exercises');
    for (const ex of DEFAULT_EXERCISES) {
      batch.set(doc(exCol), { ...ex, isCustom: false });
    }
    await batch.commit();
  }
}

async function loadExercises() {
  const snap = await getDocs(collection(db, 'users', state.user.uid, 'exercises'));
  state.exercises = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// ── Router ──────────────────────────────────────────────────
window.addEventListener('hashchange', route);

function route() {
  if (!state.user) return;
  const hash = location.hash || '#/';
  const [path, ...rest] = hash.slice(2).split('/');
  updateNav(path || 'home');
  if (!path) return renderHome();
  if (path === 'workout') return renderWorkout(rest[0]);
  if (path === 'library') return renderLibrary();
  if (path === 'exercise') return renderExerciseDetail(rest[0]);
  if (path === 'settings') return renderSettings();
  renderHome();
}

function updateNav(key) {
  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    a.classList.toggle('active', a.dataset.nav === key ||
      (key === '' && a.dataset.nav === 'home'));
  });
}

// ── Helpers ─────────────────────────────────────────────────
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    e.append(c.nodeType ? c : document.createTextNode(c));
  }
  return e;
}
function clear() { mainView.innerHTML = ''; }
function toast(msg) {
  const t = el('div', { class: 'toast' }, msg);
  document.body.append(t);
  setTimeout(() => t.remove(), 1800);
}
function fmtDate(d) {
  if (!d) return '';
  const dt = d.toDate ? d.toDate() : new Date(d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
const userCol = (...p) => collection(db, 'users', state.user.uid, ...p);
const userDoc = (...p) => doc(db, 'users', state.user.uid, ...p);

// ── Views ───────────────────────────────────────────────────
function renderSignIn() {
  clear();
  mainView.append(
    el('div', { class: 'signin-card' },
      el('h1', {}, 'Track your lifts 💪'),
      el('p', {}, 'Log sets, watch your numbers climb. Synced across devices.'),
      el('button', {
        class: 'btn',
        onclick: () => signInWithPopup(auth, provider).catch((e) => toast(e.message)),
      }, 'Sign in with Google')
    )
  );
}

async function renderHome() {
  clear();
  mainView.append(el('div', { class: 'view-header' }, el('h1', {}, 'Workouts')));
  const list = el('div', { class: 'list' });
  mainView.append(list);

  const q = query(userCol('workouts'), orderBy('date', 'desc'));
  const snap = await getDocs(q);
  if (snap.empty) {
    list.append(el('div', { class: 'empty' }, 'No workouts yet. Tap + to start one.'));
  } else {
    snap.forEach((docSnap) => {
      const w = docSnap.data();
      list.append(
        el('a', { class: 'card', href: `#/workout/${docSnap.id}` },
          el('div', { class: 'title' }, fmtDate(w.date)),
          el('div', { class: 'meta' },
            `${w.exerciseCount || 0} exercises · ${w.setCount || 0} sets` +
            (w.notes ? ` · ${w.notes}` : ''))
        )
      );
    });
  }

  const fab = el('button', {
    class: 'fab', title: 'New workout',
    onclick: async () => {
      const ref = await addDoc(userCol('workouts'), {
        date: serverTimestamp(),
        notes: '',
        exerciseCount: 0,
        setCount: 0,
      });
      location.hash = `#/workout/${ref.id}`;
    },
  }, '+');
  mainView.append(fab);
}

async function renderWorkout(workoutId) {
  clear();
  if (!workoutId) { location.hash = '#/'; return; }
  const wref = userDoc('workouts', workoutId);
  const wsnap = await getDoc(wref);
  if (!wsnap.exists()) { location.hash = '#/'; return; }
  const workout = wsnap.data();

  const setsSnap = await getDocs(query(userCol('workouts', workoutId, 'sets'), orderBy('order')));
  const sets = setsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  // Group sets by exerciseId in insertion order.
  const groups = [];
  const byEx = new Map();
  for (const s of sets) {
    if (!byEx.has(s.exerciseId)) {
      const g = { exerciseId: s.exerciseId, exerciseName: s.exerciseName, sets: [] };
      byEx.set(s.exerciseId, g); groups.push(g);
    }
    byEx.get(s.exerciseId).sets.push(s);
  }

  mainView.append(
    el('div', { class: 'view-header' },
      el('a', { class: 'back', href: '#/' }, '← Back'),
      el('h1', {}, fmtDate(workout.date) || 'Workout'),
      el('button', {
        class: 'btn-ghost', onclick: async () => {
          if (!confirm('Delete this workout?')) return;
          const batch = writeBatch(db);
          setsSnap.forEach((s) => batch.delete(s.ref));
          batch.delete(wref);
          await batch.commit();
          location.hash = '#/';
        }
      }, '🗑')
    )
  );

  const notesInput = el('textarea', {
    rows: 2, placeholder: 'Notes (optional)',
    onchange: (e) => updateDoc(wref, { notes: e.target.value }),
  });
  notesInput.value = workout.notes || '';
  mainView.append(el('div', { class: 'form-row' }, notesInput));

  const container = el('div');
  mainView.append(container);

  function renderBlock(group) {
    const block = el('div', { class: 'exercise-block' });
    block.append(
      el('h3', {},
        el('span', {}, group.exerciseName),
        el('button', {
          class: 'remove', title: 'Remove exercise',
          onclick: async () => {
            if (!confirm(`Remove ${group.exerciseName}?`)) return;
            const batch = writeBatch(db);
            for (const s of group.sets) batch.delete(userDoc('workouts', workoutId, 'sets', s.id));
            await batch.commit();
            await recomputeCounts();
            reloadSets();
          }
        }, '×')
      )
    );

    group.sets.forEach((s, idx) => {
      const row = el('div', { class: 'set-row' },
        el('div', { class: 'idx' }, String(idx + 1)),
        el('input', {
          type: 'number', inputmode: 'decimal', placeholder: 'Reps', value: s.reps ?? '',
          onchange: (e) => updateDoc(userDoc('workouts', workoutId, 'sets', s.id),
            { reps: Number(e.target.value) || 0 }),
        }),
        el('input', {
          type: 'number', inputmode: 'decimal', step: '0.5',
          placeholder: `Weight (${state.unit})`, value: s.weightKg ?? '',
          onchange: (e) => updateDoc(userDoc('workouts', workoutId, 'sets', s.id),
            { weightKg: Number(e.target.value) || 0 }),
        }),
        el('button', {
          class: 'del', title: 'Delete set', onclick: async () => {
            await deleteDoc(userDoc('workouts', workoutId, 'sets', s.id));
            await recomputeCounts();
            reloadSets();
          }
        }, '×')
      );
      block.append(row);
    });

    block.append(
      el('button', {
        class: 'add-set',
        onclick: async () => {
          const last = group.sets[group.sets.length - 1];
          await addDoc(userCol('workouts', workoutId, 'sets'), {
            exerciseId: group.exerciseId,
            exerciseName: group.exerciseName,
            reps: last?.reps || 0,
            weightKg: last?.weightKg || 0,
            order: Date.now(),
          });
          await recomputeCounts();
          reloadSets();
        },
      }, '+ Add set')
    );
    return block;
  }

  function redraw() {
    container.innerHTML = '';
    groups.forEach((g) => container.append(renderBlock(g)));
    container.append(
      el('button', {
        class: 'btn btn-secondary', style: 'margin-top: 8px;',
        onclick: () => openExercisePicker(async (ex) => {
          await addDoc(userCol('workouts', workoutId, 'sets'), {
            exerciseId: ex.id,
            exerciseName: ex.name,
            reps: 0,
            weightKg: 0,
            order: Date.now(),
          });
          await recomputeCounts();
          reloadSets();
        }),
      }, '+ Add exercise')
    );
  }

  async function reloadSets() { await renderWorkout(workoutId); }
  async function recomputeCounts() {
    const snap = await getDocs(userCol('workouts', workoutId, 'sets'));
    const exIds = new Set();
    snap.forEach((d) => exIds.add(d.data().exerciseId));
    await updateDoc(wref, { setCount: snap.size, exerciseCount: exIds.size });
  }

  redraw();
}

function openExercisePicker(onPick) {
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => {
    if (e.target === backdrop) backdrop.remove();
  }});
  const modal = el('div', { class: 'modal' });
  modal.append(
    el('button', { class: 'close', onclick: () => backdrop.remove() }, '×'),
    el('h2', {}, 'Pick an exercise')
  );
  const search = el('input', { class: 'search-box', placeholder: 'Search…', type: 'search' });
  modal.append(search);
  const list = el('div', { class: 'list' });
  modal.append(list);

  function refresh() {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = '';
    state.exercises
      .filter((e) => !q || e.name.toLowerCase().includes(q) ||
        (e.muscleGroup || '').toLowerCase().includes(q))
      .forEach((ex) => {
        list.append(
          el('button', {
            class: 'card', onclick: () => { backdrop.remove(); onPick(ex); },
          },
            el('div', { class: 'title' }, ex.name),
            el('div', { class: 'muscle-tag' }, ex.muscleGroup || '—'))
        );
      });
  }
  search.addEventListener('input', refresh);
  refresh();
  backdrop.append(modal);
  document.body.append(backdrop);
  search.focus();
}

async function renderLibrary() {
  clear();
  mainView.append(
    el('div', { class: 'view-header' },
      el('h1', {}, 'Exercises'),
      el('button', {
        class: 'btn-ghost', onclick: async () => {
          const name = prompt('Exercise name?');
          if (!name) return;
          const muscleGroup = prompt('Muscle group? (optional)') || '';
          await addDoc(userCol('exercises'), { name, muscleGroup, isCustom: true });
          await loadExercises();
          renderLibrary();
        }
      }, '+ New')
    )
  );

  const search = el('input', { class: 'search-box', type: 'search', placeholder: 'Search exercises…' });
  mainView.append(search);
  const list = el('div', { class: 'list' });
  mainView.append(list);

  function refresh() {
    const q = search.value.trim().toLowerCase();
    list.innerHTML = '';
    const filtered = state.exercises.filter((e) =>
      !q || e.name.toLowerCase().includes(q) || (e.muscleGroup || '').toLowerCase().includes(q));
    if (filtered.length === 0) {
      list.append(el('div', { class: 'empty' }, 'No exercises found.'));
      return;
    }
    filtered.forEach((ex) => {
      list.append(
        el('a', { class: 'card', href: `#/exercise/${ex.id}` },
          el('div', { class: 'title' }, ex.name),
          el('div', { class: 'muscle-tag' }, ex.muscleGroup || '—'))
      );
    });
  }
  search.addEventListener('input', refresh);
  refresh();
}

async function renderExerciseDetail(exerciseId) {
  clear();
  const ex = state.exercises.find((e) => e.id === exerciseId);
  if (!ex) { location.hash = '#/library'; return; }

  mainView.append(
    el('div', { class: 'view-header' },
      el('a', { class: 'back', href: '#/library' }, '← Back'),
      el('h1', {}, ex.name),
      ex.isCustom
        ? el('button', { class: 'btn-ghost', onclick: async () => {
            if (!confirm('Delete this exercise?')) return;
            await deleteDoc(userDoc('exercises', ex.id));
            await loadExercises();
            location.hash = '#/library';
          } }, '🗑')
        : el('span')
    )
  );

  // Collect all sets for this exercise across workouts.
  // Query via collectionGroup would be ideal but requires index; iterate workouts instead (lightweight for v1).
  const wsnap = await getDocs(query(userCol('workouts'), orderBy('date', 'desc')));
  const history = []; // {date, topWeight, volume, sets:[{reps,weightKg}]}
  for (const wdoc of wsnap.docs) {
    const w = wdoc.data();
    const setsSnap = await getDocs(
      query(userCol('workouts', wdoc.id, 'sets'), where('exerciseId', '==', exerciseId))
    );
    if (setsSnap.empty) continue;
    const setsArr = setsSnap.docs.map((d) => d.data());
    const topWeight = Math.max(...setsArr.map((s) => s.weightKg || 0));
    const volume = setsArr.reduce((a, s) => a + (s.reps || 0) * (s.weightKg || 0), 0);
    history.push({ date: w.date, topWeight, volume, sets: setsArr });
  }

  if (history.length === 0) {
    mainView.append(el('div', { class: 'empty' }, 'No history yet for this exercise.'));
    return;
  }

  // Chart: top weight over time.
  const chronological = [...history].reverse();
  mainView.append(renderChart('Top set weight', chronological.map((h) => ({
    x: h.date?.toDate?.() || new Date(), y: h.topWeight,
  })), state.unit));

  // History table.
  const table = el('table', { class: 'history-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, 'Date'),
      el('th', {}, 'Top'),
      el('th', {}, 'Volume'),
      el('th', {}, 'Sets'))));
  const tbody = el('tbody');
  history.forEach((h) => {
    tbody.append(el('tr', {},
      el('td', {}, fmtDate(h.date)),
      el('td', {}, `${h.topWeight} ${state.unit}`),
      el('td', {}, `${Math.round(h.volume)} ${state.unit}`),
      el('td', {}, String(h.sets.length))));
  });
  table.append(tbody);
  mainView.append(table);
}

function renderChart(title, points, unit) {
  const wrap = el('div', { class: 'chart-wrap' });
  wrap.append(el('h3', {}, `${title} (${unit})`));
  const W = 600, H = 160, P = 28;
  if (points.length === 0) return wrap;
  const xs = points.map((p) => p.x.getTime());
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs) || xMin + 1;
  const yMin = Math.min(...ys, 0), yMax = Math.max(...ys) || 1;
  const sx = (x) => P + ((x - xMin) / (xMax - xMin || 1)) * (W - 2 * P);
  const sy = (y) => H - P - ((y - yMin) / (yMax - yMin || 1)) * (H - 2 * P);
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x.getTime()).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
  const svg = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="${P}" y1="${H - P}" x2="${W - P}" y2="${H - P}" stroke="#334155" stroke-width="1"/>
      <line x1="${P}" y1="${P}" x2="${P}" y2="${H - P}" stroke="#334155" stroke-width="1"/>
      <path d="${d}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
      ${points.map((p) => `<circle cx="${sx(p.x.getTime()).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="3" fill="#10b981"/>`).join('')}
      <text x="${P}" y="${P - 8}" fill="#94a3b8" font-size="11">${yMax}</text>
      <text x="${P}" y="${H - P + 14}" fill="#94a3b8" font-size="11">${yMin}</text>
    </svg>`;
  const div = el('div', { html: svg });
  wrap.append(div.firstElementChild);
  return wrap;
}

function renderSettings() {
  clear();
  mainView.append(el('div', { class: 'view-header' }, el('h1', {}, 'Settings')));

  const unitSelect = el('select', {
    onchange: (e) => {
      state.unit = e.target.value;
      localStorage.setItem('unit', state.unit);
      toast(`Units set to ${state.unit}`);
    }
  },
    el('option', { value: 'kg' }, 'Kilograms (kg)'),
    el('option', { value: 'lb' }, 'Pounds (lb)'));
  unitSelect.value = state.unit;
  mainView.append(el('div', { class: 'form-row' },
    el('label', {}, 'Units'),
    unitSelect));

  mainView.append(el('div', { class: 'form-row' },
    el('label', {}, 'Account'),
    el('div', { class: 'card' },
      el('div', { class: 'title' }, state.user.displayName || 'Anonymous'),
      el('div', { class: 'meta' }, state.user.email || ''))));

  mainView.append(
    el('button', { class: 'btn btn-secondary', onclick: () => signOut(auth) }, 'Sign out')
  );
}

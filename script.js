/* ============================================================
   SCRIPT.JS — Personal Duties Dashboard
   Firebase edition — real cloud storage, multi-user

   HOW DATA IS STORED IN FIRESTORE:
   ─────────────────────────────────────────────────────────
   Each user gets their own private "folder" in the database:

   users/
     {userId}/           ← Firebase auto-generates this ID on signup
       profile/
         data            ← displayName, categoryLabels
       tasks/
         {taskId}        ← one document per task
       notes/
         data            ← the notes textarea content

   Firebase Security Rules (set in the console) ensure that
   user A can NEVER read or write user B's documents.
   ─────────────────────────────────────────────────────────

   Sections:
   1.  Firebase config  ← PASTE YOUR CONFIG HERE
   2.  Firebase init
   3.  Auth — register, login, logout
   4.  Navigation
   5.  Date & Greeting
   6.  Category helpers
   7.  Task utilities
   8.  Task rendering — Agenda
   9.  Task rendering — Archive
   10. Add Task form
   11. Filters
   12. Stats & nav badges
   13. Notes
   14. Settings
   15. Data export / import
   16. App bootstrap (onAuthStateChanged)
   ============================================================ */


/* ── 1. FIREBASE CONFIG ────────────────────────────────────── */
/*
   INSTRUCTIONS:
   1. Go to console.firebase.google.com
   2. Open your project → Project Settings (gear icon)
   3. Scroll to "Your apps" → click your web app → copy the config
   4. Replace EVERYTHING between the curly braces below with your values.
   5. Save the file and push to GitHub. Done.

   These keys are safe to put in public code — Firebase security
   is enforced by the Firestore Rules you set in the console,
   not by keeping these keys secret.
*/
const firebaseConfig = {
  apiKey:            "AIzaSyB9w9igjU44U9uE4nekl3HuTG9twyPL-3A",
  authDomain:        "otter-project-b5df0.firebaseapp.com",
  projectId:         "otter-project-b5df0",
  storageBucket:     "otter-project-b5df0.firebasestorage.app",
  messagingSenderId: "9667554032",
  appId:             "1:9667554032:web:2a92c1ebd86a0433237035"
};


/* ── 2. FIREBASE INIT ──────────────────────────────────────── */

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

// Shorthand: get the Firestore path for the current user's data
// e.g. userDoc('tasks') → db.collection('users').doc(uid).collection('tasks')
function userCol(colName) {
  return db.collection('users').doc(auth.currentUser.uid).collection(colName);
}

function userProfileDoc() {
  return db.collection('users').doc(auth.currentUser.uid)
           .collection('profile').doc('data');
}


/* ── 3. AUTH ───────────────────────────────────────────────── */

// Firebase Authentication uses email + password internally.
// We store usernames by converting them to a fake email:
//   "nicolas" → "nicolas@duties.local"
// This way users never need a real email address.

function usernameToEmail(username) {
  // Lowercase and strip anything that isn't a letter, number or hyphen
  const safe = username.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return `${safe}@duties.local`;
}

// DOM refs
const loginOverlay  = document.getElementById('login-overlay');
const panelLoading  = document.getElementById('panel-loading');
const panelLogin    = document.getElementById('panel-login');
const panelRegister = document.getElementById('panel-register');

function showPanel(name) {
  [panelLoading, panelLogin, panelRegister].forEach(p => p.classList.add('hidden'));
  document.getElementById(`panel-${name}`).classList.remove('hidden');
}

// Switch between login ↔ register panels
document.getElementById('go-to-register').addEventListener('click', () => {
  clearAuthErrors();
  showPanel('register');
});

document.getElementById('go-to-login').addEventListener('click', () => {
  clearAuthErrors();
  showPanel('login');
});

function clearAuthErrors() {
  ['login-error','reg-error'].forEach(id => {
    const el = document.getElementById(id);
    el.classList.add('hidden');
    el.textContent = '';
  });
}

// ── Register new account ──────────────────────────────────────
document.getElementById('btn-register').addEventListener('click', async () => {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;
  const confirm  = document.getElementById('reg-confirm').value;
  const errEl    = document.getElementById('reg-error');

  // Client-side validation
  if (!username) { showAuthError(errEl, 'Please choose a username.'); return; }
  if (!/^[a-zA-Z0-9]+$/.test(username)) { showAuthError(errEl, 'Username can only contain letters and numbers.'); return; }
  if (password.length < 6) { showAuthError(errEl, 'Password must be at least 6 characters.'); return; }
  if (password !== confirm) { showAuthError(errEl, 'Passwords do not match.'); return; }

  showPanel('loading');

  try {
    // Create the Firebase Auth account
    const cred = await auth.createUserWithEmailAndPassword(
      usernameToEmail(username), password
    );

    // Write the user's profile (displayName = username by default) to Firestore
    await db.collection('users').doc(cred.user.uid)
            .collection('profile').doc('data')
            .set({
              displayName: username,
              categories: { personal: 'Personal', work: 'Work', urgent: 'Urgent', other: 'Other' },
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });

    // onAuthStateChanged (section 16) will fire and enter the dashboard

  } catch (err) {
    showPanel('register');
    // Translate Firebase error codes into friendly messages
    if (err.code === 'auth/email-already-in-use') {
      showAuthError(errEl, 'That username is already taken. Please choose another.');
    } else {
      showAuthError(errEl, `Error: ${err.message}`);
    }
  }
});

// ── Sign in ───────────────────────────────────────────────────
document.getElementById('btn-login').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-error');

  if (!username || !password) {
    showAuthError(errEl, 'Please enter your username and password.'); return;
  }

  showPanel('loading');

  try {
    await auth.signInWithEmailAndPassword(usernameToEmail(username), password);
    // onAuthStateChanged fires → enterDashboard()

  } catch (err) {
    showPanel('login');
    if (['auth/wrong-password','auth/user-not-found','auth/invalid-credential'].includes(err.code)) {
      showAuthError(errEl, 'Incorrect username or password.');
    } else {
      showAuthError(errEl, `Error: ${err.message}`);
    }
    // Shake animation on the card
    panelLogin.style.animation = 'none';
    void panelLogin.offsetHeight; // force reflow
    panelLogin.style.animation = 'shake 0.3s ease';
  }
});

// Allow Enter key in login + register fields
['login-username','login-password'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
});
['reg-username','reg-password','reg-confirm'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-register').click();
  });
});

// ── Sign out ──────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', async () => {
  // Detach any Firestore listeners before signing out
  detachListeners();
  await auth.signOut();
  // onAuthStateChanged → show auth screen
});

function showAuthError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}


/* ── 4. NAVIGATION ─────────────────────────────────────────── */

function navigateTo(pageName) {
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.page').forEach(el   => el.classList.remove('active'));

  const navItem = document.querySelector(`.nav-item[data-page="${pageName}"]`);
  const page    = document.getElementById(`page-${pageName}`);
  if (navItem) navItem.classList.add('active');
  if (page)    page.classList.add('active');

  if (pageName === 'settings') refreshSettingsInputs();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

document.getElementById('sort-select').addEventListener('change', e => {
  activeSortMode = e.target.value;
  renderTasks();
});


/* ── 5. DATE & GREETING ────────────────────────────────────── */

function setDateAndGreeting() {
  const now  = new Date();
  const hour = now.getHours();
  let g = 'morning';
  if (hour >= 12 && hour < 17) g = 'afternoon';
  if (hour >= 17)               g = 'evening';
  document.getElementById('time-greeting').textContent = g;
  document.getElementById('today-date').textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function applyDisplayName(name) {
  document.getElementById('sidebar-name').textContent    = name;
  document.getElementById('greeting-name').textContent   = name ? `, ${name}` : '';
  document.getElementById('settings-displayname').value  = name;
}


/* ── 6. CATEGORY HELPERS ───────────────────────────────────── */

const DEFAULT_CATEGORIES = { personal: 'Personal', work: 'Work', urgent: 'Urgent', other: 'Other' };

// In-memory cache of categories loaded from Firestore
let currentCategories = { ...DEFAULT_CATEGORIES };

function populateCategorySelect() {
  const select = document.getElementById('input-category');
  const prev   = select.value;
  select.innerHTML = '';
  Object.entries(currentCategories).forEach(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = label;
    select.appendChild(opt);
  });
  if (prev && select.querySelector(`option[value="${prev}"]`)) select.value = prev;
}

function populateFilterButtons() {
  const bar = document.getElementById('filter-bar');
  bar.querySelectorAll('[data-filter-cat]').forEach(el => el.remove());

  Object.entries(currentCategories).forEach(([key, label]) => {
    const count = currentTasks.filter(t => !t.done && t.category === key).length;
    const btn   = document.createElement('button');
    btn.className = 'filter-btn';
    btn.dataset.filter    = key;
    btn.dataset.filterCat = key;
    btn.innerHTML = `${escapeHtml(label)} <span class="filter-count">${count}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = key;
      renderTasks();
    });
    bar.appendChild(btn);
  });

  updateStaticFilterCounts();
}

function updateStaticFilterCounts() {
  const today = todayStr();
  const pending = currentTasks.filter(t => !t.done);

  [
    { filter: 'all',     count: pending.length },
    { filter: 'today',   count: pending.filter(t => t.date === today).length },
    { filter: 'overdue', count: pending.filter(t => isOverdue(t)).length },
  ].forEach(({ filter, count }) => {
    const btn = document.querySelector(`.filter-btn[data-filter="${filter}"]`);
    if (!btn) return;
    let span = btn.querySelector('.filter-count');
    if (!span) { span = document.createElement('span'); span.className = 'filter-count'; btn.appendChild(span); }
    span.textContent = count;
  });
}

function refreshCategoryUI() {
  populateCategorySelect();
  populateFilterButtons();
}


/* ── 7. TASK UTILITIES ─────────────────────────────────────── */

// In-memory cache of tasks loaded from Firestore listener
// This avoids re-reading Firestore on every render
let currentTasks   = [];
let activeFilter   = 'all';
let activeSortMode = 'date-asc';

function todayStr() { return new Date().toISOString().split('T')[0]; }

function isOverdue(task) {
  return !!(task.date && !task.done && task.date < todayStr());
}

function isDueToday(task) {
  return task.date === todayStr() && !task.done;
}

function sortTasks(tasks) {
  const arr = [...tasks];
  switch (activeSortMode) {
    case 'date-asc':
      return arr.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1; if (!b.date) return -1;
        return a.date.localeCompare(b.date);
      });
    case 'date-desc':
      return arr.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1; if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      });
    case 'priority': {
      const o = { high: 0, medium: 1, low: 2 };
      return arr.sort((a, b) => (o[a.priority] ?? 2) - (o[b.priority] ?? 2));
    }
    case 'added':
      return arr.sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    default: return arr;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}


/* ── 8. TASK RENDERING — AGENDA ────────────────────────────── */

function renderTasks() {
  const list  = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');

  let tasks = currentTasks.filter(t => !t.done);

  switch (activeFilter) {
    case 'today':   tasks = tasks.filter(t => isDueToday(t)); break;
    case 'overdue': tasks = tasks.filter(t => isOverdue(t));  break;
    default:
      if (!['all','today','overdue'].includes(activeFilter)) {
        tasks = tasks.filter(t => t.category === activeFilter);
      }
  }

  tasks = sortTasks(tasks);
  list.innerHTML = '';

  if (tasks.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    tasks.forEach(task => list.appendChild(createTaskCard(task, false)));
  }

  updateStats();
  populateFilterButtons();
}


/* ── 9. TASK RENDERING — ARCHIVE ───────────────────────────── */

function renderArchive() {
  const done = sortTasks(currentTasks.filter(t => t.done));
  const list = document.getElementById('archive-list');
  list.innerHTML = '';
  done.forEach(task => list.appendChild(createTaskCard(task, true)));
  document.getElementById('archive-count-num').textContent = done.length;
}

function createTaskCard(task, isArchive) {
  const card = document.createElement('div');
  let classes = 'task-card';
  if (task.done)        classes += ' is-done';
  if (isOverdue(task))  classes += ' is-overdue';
  if (isDueToday(task)) classes += ' due-today';
  card.className  = classes;
  card.dataset.id = task.id;

  let dateLabel = '';
  if (task.date) {
    const d = new Date(task.date + 'T00:00:00');
    dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const categoryLabel = currentCategories[task.category] || task.category;

  let statusTag = '';
  if (isOverdue(task))       statusTag = `<span class="task-overdue-tag">Overdue</span>`;
  else if (isDueToday(task)) statusTag = `<span class="task-due-tag">Due today</span>`;

  card.innerHTML = `
    <div class="task-check ${task.done ? 'checked' : ''}"></div>
    <div class="task-body">
      <p class="task-title">${escapeHtml(task.title)}</p>
      ${task.desc ? `<p class="task-desc">${escapeHtml(task.desc)}</p>` : ''}
      <div class="task-meta">
        ${statusTag}
        ${dateLabel ? `<span class="task-date">${dateLabel}</span>` : ''}
        <span class="task-badge" data-category="${task.category}">${escapeHtml(categoryLabel)}</span>
      </div>
    </div>
    <span class="task-priority" data-priority="${task.priority}">${task.priority}</span>
    <div class="task-actions">
      ${isArchive ? `<button class="task-undo" title="Mark as not done">↩</button>` : ''}
      <button class="task-delete" title="Delete permanently">✕</button>
    </div>
  `;

  card.querySelector('.task-check').addEventListener('click', () => {
    isArchive ? undoTask(task.id) : toggleDone(task.id);
  });

  const undoBtn = card.querySelector('.task-undo');
  if (undoBtn) undoBtn.addEventListener('click', e => { e.stopPropagation(); undoTask(task.id); });

  card.querySelector('.task-delete').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`Delete "${task.title}"? This cannot be undone.`)) deleteTask(task.id);
  });

  return card;
}

// ── Firestore writes ──────────────────────────────────────────

async function toggleDone(id) {
  const task = currentTasks.find(t => t.id === id);
  if (!task) return;
  await userCol('tasks').doc(id).update({ done: !task.done });
  // The real-time listener will update currentTasks and re-render automatically
}

async function undoTask(id) {
  await userCol('tasks').doc(id).update({ done: false });
}

async function deleteTask(id) {
  await userCol('tasks').doc(id).delete();
}


/* ── 10. ADD TASK FORM ─────────────────────────────────────── */

let selectedPriority = 'low';

document.querySelectorAll('.priority-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedPriority = btn.dataset.priority;
  });
});

document.getElementById('btn-add-task').addEventListener('click', async () => {
  const title    = document.getElementById('input-title').value.trim();
  const desc     = document.getElementById('input-desc').value.trim();
  const date     = document.getElementById('input-date').value;
  const category = document.getElementById('input-category').value;

  if (!title) { document.getElementById('input-title').focus(); return; }

  // Add the task to Firestore — the real-time listener re-renders the UI
  await userCol('tasks').add({
    title, desc, date, category,
    priority:  selectedPriority,
    done:      false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });

  const msg = document.getElementById('form-success');
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 2000);

  document.getElementById('input-title').value = '';
  document.getElementById('input-desc').value  = '';
  document.getElementById('input-date').value  = '';
  document.getElementById('input-category').selectedIndex = 0;
  selectedPriority = 'low';
  document.querySelectorAll('.priority-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.priority-btn[data-priority="low"]').classList.add('active');
});

document.getElementById('input-title').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-task').click();
});


/* ── 11. FILTERS ───────────────────────────────────────────── */

document.querySelectorAll('#filter-bar .filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeFilter = btn.dataset.filter;
    renderTasks();
  });
});


/* ── 12. STATS & NAV BADGES ────────────────────────────────── */

function updateStats() {
  const tasks    = currentTasks;
  const pending  = tasks.filter(t => !t.done).length;
  const done     = tasks.filter(t => t.done).length;
  const dueToday = tasks.filter(t => isDueToday(t)).length;
  const overdue  = tasks.filter(t => isOverdue(t)).length;

  document.querySelector('#stat-pending .stat-num').textContent   = pending;
  document.querySelector('#stat-done .stat-num').textContent      = done;
  document.querySelector('#stat-due-today .stat-num').textContent = dueToday;
  document.querySelector('#stat-overdue .stat-num').textContent   = overdue;
  document.getElementById('stat-overdue').classList.toggle('zero', overdue === 0);

  // Overdue badge on the Agenda nav item
  let badge = document.querySelector('.nav-item[data-page="agenda"] .nav-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'nav-badge';
    document.querySelector('.nav-item[data-page="agenda"]').appendChild(badge);
  }
  badge.textContent = overdue;
  badge.classList.toggle('hidden', overdue === 0);
}


/* ── 13. NOTES ─────────────────────────────────────────────── */

const notesArea        = document.getElementById('notes-textarea');
const notesCharCount   = document.getElementById('notes-charcount');
const notesSavedStatus = document.getElementById('notes-saved-status');
let   notesSaveTimer;

// Load notes from Firestore once
async function loadNotes() {
  const doc = await userCol('notes').doc('data').get();
  if (doc.exists) {
    notesArea.value = doc.data().content || '';
    updateNotesMeta();
  }
}

notesArea.addEventListener('input', () => {
  updateNotesMeta();
  notesSavedStatus.textContent = 'Saving…';
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(async () => {
    await userCol('notes').doc('data').set({ content: notesArea.value });
    notesSavedStatus.textContent = 'Saved';
  }, 800); // debounce — wait 800ms after last keystroke before writing to Firestore
});

function updateNotesMeta() {
  const len = notesArea.value.length;
  notesCharCount.textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;
}


/* ── 14. SETTINGS ──────────────────────────────────────────── */

function refreshSettingsInputs() {
  document.getElementById('settings-displayname').value = document.getElementById('sidebar-name').textContent;
  const cats = currentCategories;
  Object.keys(DEFAULT_CATEGORIES).forEach(key => {
    const el = document.getElementById(`cat-label-${key}`);
    if (el) el.value = cats[key] || '';
  });
  ['settings-cur-pw','settings-new-pw','settings-new-pw2'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('pw-change-error').classList.add('hidden');
  document.getElementById('pw-change-success').classList.add('hidden');
}

// Save display name
document.getElementById('btn-save-displayname').addEventListener('click', async () => {
  const name = document.getElementById('settings-displayname').value.trim();
  if (!name) return;
  await userProfileDoc().update({ displayName: name });
  applyDisplayName(name);
  showSuccess('displayname-success');
});

// Change password (Firebase re-authentication required)
document.getElementById('btn-change-pw').addEventListener('click', async () => {
  const curPw  = document.getElementById('settings-cur-pw').value;
  const newPw  = document.getElementById('settings-new-pw').value;
  const newPw2 = document.getElementById('settings-new-pw2').value;
  const errEl  = document.getElementById('pw-change-error');

  if (newPw.length < 6) { showAuthError(errEl, 'Password must be at least 6 characters.'); return; }
  if (newPw !== newPw2)  { showAuthError(errEl, 'New passwords do not match.'); return; }

  try {
    // Firebase requires re-authentication before changing password
    const user       = auth.currentUser;
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, curPw);
    await user.reauthenticateWithCredential(credential);
    await user.updatePassword(newPw);

    errEl.classList.add('hidden');
    ['settings-cur-pw','settings-new-pw','settings-new-pw2'].forEach(id => {
      document.getElementById(id).value = '';
    });
    showSuccess('pw-change-success');

  } catch (err) {
    if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
      showAuthError(errEl, 'Current password is incorrect.');
    } else {
      showAuthError(errEl, `Error: ${err.message}`);
    }
  }
});

// Save category labels
document.getElementById('btn-save-categories').addEventListener('click', async () => {
  const updated = { ...currentCategories };
  Object.keys(DEFAULT_CATEGORIES).forEach(key => {
    const el = document.getElementById(`cat-label-${key}`);
    if (el && el.value.trim()) updated[key] = el.value.trim();
  });
  await userProfileDoc().update({ categories: updated });
  currentCategories = updated;
  refreshCategoryUI();
  renderTasks();
  renderArchive();
  showSuccess('cat-success');
});

// Delete all tasks
document.getElementById('btn-clear-tasks').addEventListener('click', async () => {
  if (!confirm('Delete ALL tasks permanently? This cannot be undone.')) return;
  const batch = db.batch();
  const snap  = await userCol('tasks').get();
  snap.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  // Listener will update currentTasks automatically
});

function showSuccess(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}


/* ── 15. DATA EXPORT / IMPORT ──────────────────────────────── */

document.getElementById('btn-export').addEventListener('click', () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    categories: currentCategories,
    tasks:      currentTasks.map(t => ({
      id: t.id, title: t.title, desc: t.desc,
      date: t.date, category: t.category,
      priority: t.priority, done: t.done
    }))
  };
  const blob    = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = `duties-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('import-file-input').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data     = JSON.parse(ev.target.result);
      const incoming = Array.isArray(data) ? data : data.tasks;
      if (!Array.isArray(incoming)) throw new Error('bad format');

      const existingIds = new Set(currentTasks.map(t => t.id));
      const batch       = db.batch();

      incoming.forEach(t => {
        if (!t.title) return; // skip invalid entries
        if (t.id && existingIds.has(t.id)) return; // skip duplicates
        const ref = userCol('tasks').doc();
        batch.set(ref, {
          title:    t.title || '',
          desc:     t.desc  || '',
          date:     t.date  || '',
          category: t.category || 'other',
          priority: t.priority || 'low',
          done:     t.done  || false,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      });

      await batch.commit();
      document.getElementById('import-error').classList.add('hidden');
      showSuccess('import-success');

    } catch {
      document.getElementById('import-success').classList.add('hidden');
      document.getElementById('import-error').classList.remove('hidden');
    }
    e.target.value = '';
  };
  reader.readAsText(file);
});


/* ── 16. APP BOOTSTRAP ─────────────────────────────────────── */

// This is the heart of the app.
// Firebase calls this function automatically whenever the login state changes:
//   - Page load (checks if a session was already active)
//   - After login / register
//   - After sign out
// This replaces the manual init() we had before.

let tasksUnsubscribe = null; // holds the Firestore real-time listener so we can detach it

function detachListeners() {
  if (tasksUnsubscribe) { tasksUnsubscribe(); tasksUnsubscribe = null; }
}

auth.onAuthStateChanged(async (user) => {
  if (!user) {
    // No user logged in — show auth screen
    detachListeners();
    loginOverlay.classList.remove('hidden');
    // Show loading briefly then switch to login panel
    showPanel('loading');
    setTimeout(() => {
      const account = firebase.app().options; // just checking firebase is ready
      showPanel('login');
    }, 400);
    return;
  }

  // User is logged in ─────────────────────────────────────────
  loginOverlay.classList.add('hidden');
  setDateAndGreeting();

  // Load user profile (display name + category labels)
  try {
    const profileSnap = await userProfileDoc().get();
    if (profileSnap.exists) {
      const profile = profileSnap.data();
      applyDisplayName(profile.displayName || '');
      if (profile.categories) {
        currentCategories = { ...DEFAULT_CATEGORIES, ...profile.categories };
      }
    }
  } catch (err) {
    console.warn('Could not load profile:', err);
  }

  refreshCategoryUI();
  await loadNotes();

  // Attach a real-time listener to the user's tasks collection.
  // This means: whenever any task changes in Firestore (from any device),
  // the UI updates automatically — no page refresh needed.
  tasksUnsubscribe = userCol('tasks').onSnapshot(snapshot => {
    // Rebuild the in-memory cache from the snapshot
    currentTasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderTasks();
    renderArchive();
    updateStats();
  }, err => {
    console.error('Firestore listener error:', err);
  });
});

// Initial date/greeting setup (visible even before login)
setDateAndGreeting();

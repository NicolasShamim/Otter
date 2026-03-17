/* ============================================================
   SCRIPT.JS — Personal Duties Dashboard
   Sections:
   1.  State helpers
   2.  Crypto — password hashing (SHA-256 via Web Crypto API)
   3.  Auth — setup, login, logout, session
   4.  Navigation
   5.  Date & Greeting
   6.  Category helpers
   7.  Task utilities (sort, overdue checks)
   8.  Task rendering — Agenda
   9.  Task rendering — Archive
   10. Add Task form
   11. Filters
   12. Stats & nav badges
   13. Notes
   14. Settings
   15. Data export / import
   16. Init
   ============================================================ */


/* ── 1. STATE HELPERS ──────────────────────────────────────── */

function loadTasks()      { return JSON.parse(localStorage.getItem('duties_tasks')  || '[]'); }
function saveTasks(t)     { localStorage.setItem('duties_tasks',  JSON.stringify(t)); }
function loadDisplayName(){ return localStorage.getItem('duties_displayname') || ''; }
function saveDisplayName(n){ localStorage.setItem('duties_displayname', n); }

const DEFAULT_CATEGORIES = { personal: 'Personal', work: 'Work', urgent: 'Urgent', other: 'Other' };

function loadCategories() {
  const s = localStorage.getItem('duties_categories');
  return s ? { ...DEFAULT_CATEGORIES, ...JSON.parse(s) } : { ...DEFAULT_CATEGORIES };
}
function saveCategories(c){ localStorage.setItem('duties_categories', JSON.stringify(c)); }

// Session flag — lives only in memory (cleared on tab close for real sign-out feel)
let sessionActive = false;

let activeFilter   = 'all';
let activeSortMode = 'date-asc';


/* ── 2. CRYPTO ─────────────────────────────────────────────── */

// Hash a string with SHA-256, return hex string.
// Using the browser's built-in Web Crypto API — no library needed.
async function sha256(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}


/* ── 3. AUTH ───────────────────────────────────────────────── */

// Stored as: { usernameHash, passwordHash, displayName }
function loadAccount()  { return JSON.parse(localStorage.getItem('duties_account') || 'null'); }
function saveAccount(a) { localStorage.setItem('duties_account', JSON.stringify(a)); }

const loginOverlay  = document.getElementById('login-overlay');
const panelSetup    = document.getElementById('panel-setup');
const panelLogin    = document.getElementById('panel-login');

// Show the right panel depending on whether an account exists
function showAuthScreen() {
  loginOverlay.classList.remove('hidden');
  const account = loadAccount();
  if (account) {
    panelSetup.classList.add('hidden');
    panelLogin.classList.remove('hidden');
    // Show "Welcome back, Nicolas." if display name is set
    const name = loadDisplayName() || account.username || '';
    if (name) {
      document.getElementById('login-welcome-name').textContent = `Welcome back, ${name}.`;
    }
  } else {
    panelSetup.classList.remove('hidden');
    panelLogin.classList.add('hidden');
  }
}

// ── First-time setup ──
document.getElementById('btn-setup').addEventListener('click', async () => {
  const username = document.getElementById('setup-username').value.trim();
  const password = document.getElementById('setup-password').value;
  const confirm  = document.getElementById('setup-confirm').value;
  const errorEl  = document.getElementById('setup-error');

  if (!username || !password) {
    showError(errorEl, 'Please fill in all fields.');
    return;
  }
  if (password !== confirm) {
    showError(errorEl, 'Passwords do not match.');
    return;
  }
  if (password.length < 4) {
    showError(errorEl, 'Password must be at least 4 characters.');
    return;
  }

  const usernameHash = await sha256(username.toLowerCase());
  const passwordHash = await sha256(password);

  saveAccount({ usernameHash, passwordHash });
  // Use the username as display name by default (can be changed in Settings)
  saveDisplayName(username);

  enterDashboard();
});

// Allow Enter key on setup fields
['setup-username','setup-password','setup-confirm'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-setup').click();
  });
});

// ── Returning user login ──
document.getElementById('btn-login').addEventListener('click', async () => {
  const username  = document.getElementById('login-username').value.trim();
  const password  = document.getElementById('login-password').value;
  const errorEl   = document.getElementById('login-error');
  const account   = loadAccount();

  if (!username || !password) {
    errorEl.classList.remove('hidden');
    errorEl.textContent = 'Please enter your username and password.';
    return;
  }

  const usernameHash = await sha256(username.toLowerCase());
  const passwordHash = await sha256(password);

  if (usernameHash === account.usernameHash && passwordHash === account.passwordHash) {
    errorEl.classList.add('hidden');
    enterDashboard();
  } else {
    errorEl.classList.remove('hidden');
    errorEl.textContent = 'Incorrect username or password.';
    // Shake the card for feedback
    panelLogin.style.animation = 'none';
    panelLogin.offsetHeight;
    panelLogin.style.animation = 'shake 0.3s ease';
  }
});

['login-username','login-password'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('btn-login').click();
  });
});

// ── Enter dashboard after successful auth ──
function enterDashboard() {
  sessionActive = true;
  loginOverlay.classList.add('hidden');

  const name = loadDisplayName();
  applyDisplayName(name);
  setDateAndGreeting();
  refreshCategoryUI();
  renderTasks();
  updateStats();
}

// ── Sign out ──
document.getElementById('logout-btn').addEventListener('click', () => {
  sessionActive = false;
  // Clear sensitive form fields
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  showAuthScreen();
});

// Apply display name to sidebar + greeting
function applyDisplayName(name) {
  document.getElementById('sidebar-name').textContent = name;
  document.getElementById('greeting-name').textContent = name ? `, ${name}` : '';
  document.getElementById('settings-displayname').value = name;
}

// Helper: show an error message in an element
function showError(el, msg) {
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

  if (pageName === 'agenda')   renderTasks();
  if (pageName === 'archive')  renderArchive();
  if (pageName === 'settings') refreshSettingsInputs();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => navigateTo(item.dataset.page));
});

// Sort select
document.getElementById('sort-select').addEventListener('change', e => {
  activeSortMode = e.target.value;
  renderTasks();
});


/* ── 5. DATE & GREETING ────────────────────────────────────── */

function setDateAndGreeting() {
  const now  = new Date();
  const hour = now.getHours();
  let greeting = 'morning';
  if (hour >= 12 && hour < 17) greeting = 'afternoon';
  if (hour >= 17)               greeting = 'evening';
  document.getElementById('time-greeting').textContent = greeting;
  document.getElementById('today-date').textContent = now.toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });
}


/* ── 6. CATEGORY HELPERS ───────────────────────────────────── */

function populateCategorySelect() {
  const cats   = loadCategories();
  const select = document.getElementById('input-category');
  const prev   = select.value;
  select.innerHTML = '';
  Object.entries(cats).forEach(([key, label]) => {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = label;
    select.appendChild(opt);
  });
  if (prev && select.querySelector(`option[value="${prev}"]`)) select.value = prev;
}

function populateFilterButtons() {
  const cats  = loadCategories();
  const tasks = loadTasks().filter(t => !t.done);
  const bar   = document.getElementById('filter-bar');

  // Remove previously injected category buttons
  bar.querySelectorAll('[data-filter-cat]').forEach(el => el.remove());

  Object.entries(cats).forEach(([key, label]) => {
    const count = tasks.filter(t => t.category === key).length;
    const btn   = document.createElement('button');
    btn.className         = 'filter-btn';
    btn.dataset.filter    = key;
    btn.dataset.filterCat = key;
    btn.innerHTML         = `${escapeHtml(label)} <span class="filter-count">${count}</span>`;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = key;
      renderTasks();
    });
    bar.appendChild(btn);
  });

  // Update counts on the static All / Today / Overdue buttons
  updateStaticFilterCounts();
}

function updateStaticFilterCounts() {
  const tasks   = loadTasks().filter(t => !t.done);
  const today   = todayStr();
  const allBtn  = document.querySelector('.filter-btn[data-filter="all"]');
  const todayBtn= document.querySelector('.filter-btn[data-filter="today"]');
  const overdueBtn = document.querySelector('.filter-btn[data-filter="overdue"]');

  if (allBtn) {
    let span = allBtn.querySelector('.filter-count');
    if (!span) { span = document.createElement('span'); span.className = 'filter-count'; allBtn.appendChild(span); }
    span.textContent = tasks.length;
  }
  if (todayBtn) {
    const c = tasks.filter(t => t.date === today).length;
    let span = todayBtn.querySelector('.filter-count');
    if (!span) { span = document.createElement('span'); span.className = 'filter-count'; todayBtn.appendChild(span); }
    span.textContent = c;
  }
  if (overdueBtn) {
    const c = tasks.filter(t => isOverdue(t)).length;
    let span = overdueBtn.querySelector('.filter-count');
    if (!span) { span = document.createElement('span'); span.className = 'filter-count'; overdueBtn.appendChild(span); }
    span.textContent = c;
  }
}

function refreshCategoryUI() {
  populateCategorySelect();
  populateFilterButtons();
}


/* ── 7. TASK UTILITIES ─────────────────────────────────────── */

function todayStr() { return new Date().toISOString().split('T')[0]; }

function isOverdue(task) {
  if (!task.date || task.done) return false;
  return task.date < todayStr();
}

function isDueToday(task) {
  return task.date === todayStr() && !task.done;
}

// Sort an array of tasks by the active sort mode
function sortTasks(tasks) {
  const arr = [...tasks];
  switch (activeSortMode) {
    case 'date-asc':
      return arr.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return a.date.localeCompare(b.date);
      });
    case 'date-desc':
      return arr.sort((a, b) => {
        if (!a.date && !b.date) return 0;
        if (!a.date) return 1;
        if (!b.date) return -1;
        return b.date.localeCompare(a.date);
      });
    case 'priority': {
      const order = { high: 0, medium: 1, low: 2 };
      return arr.sort((a, b) => (order[a.priority] ?? 2) - (order[b.priority] ?? 2));
    }
    case 'added':
      // IDs are timestamps, so descending ID = most recently added
      return arr.sort((a, b) => Number(b.id) - Number(a.id));
    default:
      return arr;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


/* ── 8. TASK RENDERING — AGENDA ────────────────────────────── */

function renderTasks() {
  const list  = document.getElementById('task-list');
  const empty = document.getElementById('empty-state');

  let tasks = loadTasks().filter(t => !t.done);

  // Apply filter
  switch (activeFilter) {
    case 'today':   tasks = tasks.filter(t => isDueToday(t)); break;
    case 'overdue': tasks = tasks.filter(t => isOverdue(t));  break;
    default:
      // Category filter key
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
  populateFilterButtons(); // refresh counts
}


/* ── 9. TASK RENDERING — ARCHIVE ───────────────────────────── */

function renderArchive() {
  const done  = sortTasks(loadTasks().filter(t => t.done));
  const list  = document.getElementById('archive-list');
  list.innerHTML = '';
  done.forEach(task => list.appendChild(createTaskCard(task, true)));

  // Update archive count stat
  document.getElementById('archive-count-num').textContent = done.length;
}

// Build a single task card DOM element.
// isArchive = true → show ↩ undo button instead of interactive checkbox
function createTaskCard(task, isArchive) {
  const cats  = loadCategories();
  const card  = document.createElement('div');

  // Build class list
  let classes = 'task-card';
  if (task.done)        classes += ' is-done';
  if (isOverdue(task))  classes += ' is-overdue';
  if (isDueToday(task)) classes += ' due-today';
  card.className  = classes;
  card.dataset.id = task.id;

  // Date label
  let dateLabel = '';
  if (task.date) {
    const d = new Date(task.date + 'T00:00:00');
    dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  const categoryLabel = cats[task.category] || task.category;

  // Inline status tag (overdue or due today)
  let statusTag = '';
  if (isOverdue(task))  statusTag = `<span class="task-overdue-tag">Overdue</span>`;
  else if (isDueToday(task)) statusTag = `<span class="task-due-tag">Due today</span>`;

  card.innerHTML = `
    <div class="task-check ${task.done ? 'checked' : ''}" title="${isArchive ? 'Click to undo' : 'Mark done'}"></div>
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

  // Checkbox: toggle done
  card.querySelector('.task-check').addEventListener('click', () => {
    if (isArchive) undoTask(task.id);
    else           toggleDone(task.id);
  });

  const undoBtn = card.querySelector('.task-undo');
  if (undoBtn) undoBtn.addEventListener('click', e => { e.stopPropagation(); undoTask(task.id); });

  card.querySelector('.task-delete').addEventListener('click', e => {
    e.stopPropagation();
    if (confirm(`Delete "${task.title}"? This cannot be undone.`)) deleteTask(task.id);
  });

  return card;
}

function toggleDone(id) {
  const tasks = loadTasks();
  const task  = tasks.find(t => t.id === id);
  if (task) { task.done = !task.done; saveTasks(tasks); renderTasks(); updateStats(); }
}

function undoTask(id) {
  const tasks = loadTasks();
  const task  = tasks.find(t => t.id === id);
  if (task) { task.done = false; saveTasks(tasks); renderArchive(); updateStats(); }
}

function deleteTask(id) {
  saveTasks(loadTasks().filter(t => t.id !== id));
  renderTasks(); renderArchive(); updateStats();
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

document.getElementById('btn-add-task').addEventListener('click', () => {
  const title    = document.getElementById('input-title').value.trim();
  const desc     = document.getElementById('input-desc').value.trim();
  const date     = document.getElementById('input-date').value;
  const category = document.getElementById('input-category').value;

  if (!title) { document.getElementById('input-title').focus(); return; }

  const tasks = loadTasks();
  tasks.push({ id: Date.now().toString(), title, desc, date, category, priority: selectedPriority, done: false });
  saveTasks(tasks);

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

  updateStats();
  refreshCategoryUI();
});

// Also allow Enter in the title field to submit
document.getElementById('input-title').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-task').click();
});


/* ── 11. FILTERS ───────────────────────────────────────────── */

// Static filter buttons (All, Today, Overdue)
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
  const tasks   = loadTasks();
  const pending = tasks.filter(t => !t.done).length;
  const done    = tasks.filter(t => t.done).length;
  const dueToday= tasks.filter(t => isDueToday(t)).length;
  const overdue = tasks.filter(t => isOverdue(t)).length;

  document.querySelector('#stat-pending .stat-num').textContent  = pending;
  document.querySelector('#stat-done .stat-num').textContent     = done;
  document.querySelector('#stat-due-today .stat-num').textContent= dueToday;
  document.querySelector('#stat-overdue .stat-num').textContent  = overdue;

  // Dim the overdue pill when 0
  const overduePill = document.getElementById('stat-overdue');
  overduePill.classList.toggle('zero', overdue === 0);

  // Overdue badge on agenda nav item (shown when > 0)
  let navBadge = document.querySelector('.nav-item[data-page="agenda"] .nav-badge');
  if (!navBadge) {
    navBadge = document.createElement('span');
    navBadge.className = 'nav-badge';
    document.querySelector('.nav-item[data-page="agenda"]').appendChild(navBadge);
  }
  navBadge.textContent = overdue;
  navBadge.classList.toggle('hidden', overdue === 0);
}


/* ── 13. NOTES ─────────────────────────────────────────────── */

const notesArea        = document.getElementById('notes-textarea');
const notesCharCount   = document.getElementById('notes-charcount');
const notesSavedStatus = document.getElementById('notes-saved-status');
let   notesSaveTimer;

notesArea.value = localStorage.getItem('duties_notes') || '';
updateNotesMeta();

notesArea.addEventListener('input', () => {
  updateNotesMeta();
  notesSavedStatus.textContent = 'Saving…';
  clearTimeout(notesSaveTimer);
  notesSaveTimer = setTimeout(() => {
    localStorage.setItem('duties_notes', notesArea.value);
    notesSavedStatus.textContent = 'Saved';
  }, 600);
});

function updateNotesMeta() {
  const len = notesArea.value.length;
  notesCharCount.textContent = `${len.toLocaleString()} character${len !== 1 ? 's' : ''}`;
}


/* ── 14. SETTINGS ──────────────────────────────────────────── */

function refreshSettingsInputs() {
  document.getElementById('settings-displayname').value = loadDisplayName();
  const cats = loadCategories();
  Object.keys(DEFAULT_CATEGORIES).forEach(key => {
    const el = document.getElementById(`cat-label-${key}`);
    if (el) el.value = cats[key];
  });
  // Clear password fields
  ['settings-cur-pw','settings-new-pw','settings-new-pw2'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('pw-change-error').classList.add('hidden');
  document.getElementById('pw-change-success').classList.add('hidden');
}

// Save display name
document.getElementById('btn-save-displayname').addEventListener('click', () => {
  const name = document.getElementById('settings-displayname').value.trim();
  if (!name) return;
  saveDisplayName(name);
  applyDisplayName(name);
  setDateAndGreeting();
  showSuccess('displayname-success');
});

// Change password
document.getElementById('btn-change-pw').addEventListener('click', async () => {
  const curPw  = document.getElementById('settings-cur-pw').value;
  const newPw  = document.getElementById('settings-new-pw').value;
  const newPw2 = document.getElementById('settings-new-pw2').value;
  const errEl  = document.getElementById('pw-change-error');
  const account= loadAccount();

  const curHash = await sha256(curPw);
  if (curHash !== account.passwordHash) {
    showError(errEl, 'Current password is incorrect.'); return;
  }
  if (newPw.length < 4) {
    showError(errEl, 'New password must be at least 4 characters.'); return;
  }
  if (newPw !== newPw2) {
    showError(errEl, 'New passwords do not match.'); return;
  }

  errEl.classList.add('hidden');
  account.passwordHash = await sha256(newPw);
  saveAccount(account);
  ['settings-cur-pw','settings-new-pw','settings-new-pw2'].forEach(id => {
    document.getElementById(id).value = '';
  });
  showSuccess('pw-change-success');
});

// Save category labels
document.getElementById('btn-save-categories').addEventListener('click', () => {
  const cats = loadCategories();
  Object.keys(DEFAULT_CATEGORIES).forEach(key => {
    const el = document.getElementById(`cat-label-${key}`);
    if (el && el.value.trim()) cats[key] = el.value.trim();
  });
  saveCategories(cats);
  refreshCategoryUI();
  renderTasks();
  renderArchive();
  showSuccess('cat-success');
});

// Delete all tasks (danger zone)
document.getElementById('btn-clear-tasks').addEventListener('click', () => {
  if (confirm('Delete ALL tasks permanently? This cannot be undone.')) {
    saveTasks([]);
    renderTasks();
    renderArchive();
    updateStats();
  }
});

function showSuccess(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}


/* ── 15. DATA EXPORT / IMPORT ──────────────────────────────── */

// Export tasks as a downloadable JSON file
document.getElementById('btn-export').addEventListener('click', () => {
  const tasks    = loadTasks();
  const cats     = loadCategories();
  const payload  = { exportedAt: new Date().toISOString(), categories: cats, tasks };
  const blob     = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  const dateStr  = new Date().toISOString().slice(0,10);
  a.href         = url;
  a.download     = `duties-backup-${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

// Import tasks from a JSON file
document.getElementById('import-file-input').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      // Accept either the wrapped format { tasks: [...] } or a raw array
      const incoming = Array.isArray(data) ? data : data.tasks;
      if (!Array.isArray(incoming)) throw new Error('Invalid format');

      // Merge: add tasks that don't already exist (by id)
      const existing = loadTasks();
      const existingIds = new Set(existing.map(t => t.id));
      const merged = [...existing, ...incoming.filter(t => t.id && !existingIds.has(t.id))];
      saveTasks(merged);

      // Also import category labels if present
      if (data.categories && typeof data.categories === 'object') {
        const cats = loadCategories();
        saveCategories({ ...cats, ...data.categories });
        refreshCategoryUI();
      }

      renderTasks(); renderArchive(); updateStats();
      document.getElementById('import-error').classList.add('hidden');
      showSuccess('import-success');
    } catch {
      document.getElementById('import-success').classList.add('hidden');
      document.getElementById('import-error').classList.remove('hidden');
    }
    // Reset file input so same file can be re-imported if needed
    e.target.value = '';
  };
  reader.readAsText(file);
});


/* ── 16. INIT ──────────────────────────────────────────────── */

(function init() {
  setDateAndGreeting();

  const account = loadAccount();
  if (!account) {
    // First ever visit — show setup screen
    showAuthScreen();
  } else {
    // Account exists — show login screen
    showAuthScreen();
  }

  // Pre-populate category UI so it's ready when user logs in
  refreshCategoryUI();
})();
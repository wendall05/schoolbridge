// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  user: null, page: 'login', params: {}, history: [],
  feed: null, messages: null, sections: null, adminData: null, adminStudents: null,
};

// ── API ───────────────────────────────────────────────────────────────────────
const api = async (method, path, body) => {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};
const GET = p => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PUT = (p, b) => api('PUT', p, b);

// ── Router ────────────────────────────────────────────────────────────────────
function nav(page, params = {}) {
  if (S.page && S.page !== page) S.history.push({ page: S.page, params: S.params });
  if (S.history.length > 30) S.history.shift();
  S.page = page; S.params = params; S.sidebarOpen = false;
  render(); window.scrollTo(0, 0);
}
function goBack() {
  const prev = S.history.pop();
  if (!prev) return;
  S.page = prev.page; S.params = prev.params;
  render(); window.scrollTo(0, 0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const esc = s => s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
const fmtFull = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const pct = (s,m) => m > 0 ? Math.round(s/m*100) : null;

const scoreColor = (s,m) => {
  const p = pct(s,m);
  if (p === null) return 'text-slate-400';
  if (p >= 90) return 'text-emerald-600 font-bold';
  if (p >= 80) return 'text-blue-600 font-bold';
  if (p >= 70) return 'text-amber-600 font-bold';
  return 'text-red-600 font-bold';
};

const attColor = s => ({
  present:'bg-emerald-100 text-emerald-700',
  absent:'bg-red-100 text-red-700',
  tardy:'bg-amber-100 text-amber-700',
  excused:'bg-slate-100 text-slate-500'
})[s] || 'bg-slate-100 text-slate-500';

const priorityConfig = {
  critical: { bar:'border-red-500', bg:'bg-red-50', badge:'bg-red-600 text-white', label:'CRITICAL', icon:'🚨' },
  high:     { bar:'border-amber-500', bg:'bg-amber-50', badge:'bg-amber-500 text-white', label:'HIGH', icon:'⚠️' },
  low:      { bar:'border-blue-400', bg:'bg-blue-50', badge:'bg-blue-500 text-white', label:'INFO', icon:'ℹ️' },
};
const priorityBadge = p => {
  const c = priorityConfig[p] || priorityConfig.low;
  return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${c.badge}">${c.label}</span>`;
};

// Compute grade trend from recent vs older scores (+ = improving, - = declining)
function gradeTrend(grades) {
  const scored = grades.filter(g => g.score != null && g.max_score > 0);
  if (scored.length < 4) return null;
  const recent = scored.slice(0, 2).reduce((s,g) => s + g.score/g.max_score*100, 0) / 2;
  const older  = scored.slice(2, 5).reduce((s,g) => s + g.score/g.max_score*100, 0) / Math.min(3, scored.slice(2,5).length);
  return Math.round(recent - older);
}

// Risk label for a student
function riskLabel(absences, missing) {
  if (absences >= 3 || (absences >= 2 && missing >= 2)) return { label:'CRITICAL', cls:'bg-red-100 text-red-700 border-red-200' };
  if (absences >= 2 || missing >= 2) return { label:'HIGH', cls:'bg-amber-100 text-amber-700 border-amber-200' };
  if (absences >= 1 || missing >= 1) return { label:'WATCH', cls:'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return { label:'OK', cls:'bg-emerald-100 text-emerald-700 border-emerald-200' };
}

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('app');
  if (!S.user) { root.innerHTML = renderLogin(); return; }
  root.innerHTML = renderShell();
}

// ── Login ─────────────────────────────────────────────────────────────────────
function renderLogin() {
  return `
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 backdrop-blur mb-4">
          <svg class="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-white tracking-tight">SchoolBridge</h1>
        <p class="text-blue-200 mt-1 text-sm">Unified Parent Engagement Hub</p>
      </div>
      <div class="bg-white rounded-2xl shadow-2xl p-8">
        <div id="login-error" class="hidden mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"></div>
        <form onsubmit="doLogin(event)">
          <div class="mb-4">
            <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input id="login-email" type="email" required placeholder="you@school.edu"
              class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input id="login-password" type="password" required placeholder="••••••••"
              class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
          </div>
          <button type="submit" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
            Sign In
          </button>
        </form>

        <!-- Demo tiles -->
        <div class="mt-6 pt-6 border-t border-slate-100">
          <p class="text-xs font-semibold text-slate-400 text-center uppercase tracking-wider mb-3">Demo Accounts</p>
          <div class="space-y-2">
            <button onclick="quickLogin('parent@demo.com','parent123')" class="w-full py-3 px-4 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-left transition-colors group">
              <div class="flex items-center gap-3">
                <span class="text-xl">👩‍👦</span>
                <div>
                  <p class="text-sm font-semibold text-slate-700 group-hover:text-blue-700">Sandra Johnson — Parent</p>
                  <p class="text-xs text-slate-400">Marcus has CRITICAL alerts · 3 missing assignments</p>
                </div>
              </div>
            </button>
            <button onclick="quickLogin('thompson@lincoln.edu','teacher123')" class="w-full py-3 px-4 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-left transition-colors group">
              <div class="flex items-center gap-3">
                <span class="text-xl">👨‍🏫</span>
                <div>
                  <p class="text-sm font-semibold text-slate-700 group-hover:text-blue-700">Mr. Thompson — Math Teacher</p>
                  <p class="text-xs text-slate-400">Period 1 · 5 students · take attendance</p>
                </div>
              </div>
            </button>
            <button onclick="quickLogin('admin@lincoln.edu','admin123')" class="w-full py-3 px-4 rounded-xl bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-200 text-left transition-colors group">
              <div class="flex items-center gap-3">
                <span class="text-xl">🏫</span>
                <div>
                  <p class="text-sm font-semibold text-slate-700 group-hover:text-blue-700">Principal Davis — Admin</p>
                  <p class="text-xs text-slate-400">School overview · 5 students · sync log</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
      <p class="text-center text-blue-300 text-xs mt-5">Lincoln Middle School · Syracuse City SD · Demo</p>
    </div>
  </div>`;
}

async function doLogin(e) {
  e.preventDefault();
  const err = document.getElementById('login-error');
  try {
    err.classList.add('hidden');
    const user = await POST('/auth/login', {
      email: document.getElementById('login-email').value,
      password: document.getElementById('login-password').value,
    });
    S.user = user;
    connectSSE();
    nav(user.role === 'parent' ? 'feed' : user.role === 'teacher' ? 'attendance' : 'admin');
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('hidden');
  }
}

function quickLogin(email, pw) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = pw;
  document.querySelector('form').dispatchEvent(new Event('submit', {cancelable:true,bubbles:true}));
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function renderShell() {
  const navItems = {
    parent: [
      { page:'feed',     label:'Home',     icon:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { page:'messages', label:'Messages', icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
      { page:'privacy',  label:'Privacy',  icon:'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    ],
    teacher: [
      { page:'attendance', label:'Attendance', icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { page:'behavior',   label:'Behavior',   icon:'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
      { page:'messages',   label:'Messages',   icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    ],
    admin: [
      { page:'admin',          label:'Overview',  icon:'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-1a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z' },
      { page:'admin-students', label:'Students',  icon:'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { page:'messages',       label:'Messages',  icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    ],
  };

  const items = navItems[S.user.role] || [];
  const navHtml = items.map(n => `
    <button onclick="nav('${n.page}')" class="flex flex-col items-center gap-1 flex-1 py-2 ${S.page===n.page||S.page.startsWith(n.page+'-')?'text-blue-600':'text-slate-400 hover:text-slate-600'} transition-colors">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="${n.icon}"/></svg>
      <span class="text-xs font-medium">${n.label}</span>
    </button>
  `).join('');

  const pages = {
    feed: renderFeed,
    messages: renderMessages,
    privacy: renderPrivacy,
    attendance: renderAttendance,
    behavior: renderBehaviorForm,
    admin: renderAdmin,
    'admin-students': renderAdminStudents,
    'student-detail': renderStudentDetail,
  };

  const pageHtml = (pages[S.page] || (() => `<div class="p-6 text-slate-400">Page not found</div>`))();

  return `
  <div class="min-h-screen flex flex-col" style="background:#f1f5f9">
    <header class="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        ${S.history.length > 0 ? `<button onclick="goBack()" class="text-slate-400 hover:text-slate-700 transition-colors mr-1">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>` : ''}
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          </div>
          <span class="font-semibold text-slate-800 text-sm">SchoolBridge</span>
        </div>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span class="text-xs text-slate-400 hidden sm:inline">Live</span>
        </div>
        <span class="text-xs text-slate-400">${esc(S.user.name)}</span>
        <button onclick="doLogout()" class="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded">Out</button>
      </div>
    </header>
    <main class="flex-1 overflow-y-auto pb-20">
      <div class="max-w-2xl mx-auto px-4 py-6 fade-in">${pageHtml}</div>
    </main>
    <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-40">
      ${navHtml}
    </nav>
  </div>`;
}

async function doLogout() {
  await POST('/auth/logout');
  if (_sse) { _sse.close(); _sse = null; }
  S.user = null; S.page = 'login'; S.history = []; S.feed = null;
  render();
}

// ── Parent: Feed ──────────────────────────────────────────────────────────────
function renderFeed() {
  if (S.feed !== null) {
    // fall through to render
  } else if (!S._feedLoaded) {
    S._feedLoaded = true;
    GET('/api/feed').then(data => { S.feed = data; render(); }).catch(e => { console.error('Feed error:', e); S._feedLoaded = false; });
    return spinner();
  } else {
    return spinner();
  }
  if (!S.feed.length) return `<div class="text-center py-16 text-slate-400">No students linked to your account.</div>`;

  return S.feed.map(child => {
    const { student, alerts, attendance, grades, upcoming, behavior, shadow } = child;
    const urgentAlerts = alerts.filter(a => a.priority === 'critical' || a.priority === 'high');
    const infoAlerts   = alerts.filter(a => a.priority === 'low');
    const presentDays  = attendance.filter(a => a.status === 'present').length;
    const totalDays    = attendance.length;
    const attPct       = totalDays > 0 ? Math.round(presentDays / totalDays * 100) : 0;
    const trend        = gradeTrend(grades);
    const hasCritical  = urgentAlerts.some(a => a.priority === 'critical');

    return `
    <div class="mb-8">
      <!-- Student header -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-xl font-bold text-slate-800">${esc(student.name)}</h2>
          <p class="text-sm text-slate-400">${esc(student.grade)} · Lincoln Middle School</p>
        </div>
        <div class="text-right">
          <div class="text-2xl font-bold ${attPct >= 90 ? 'text-emerald-600' : attPct >= 80 ? 'text-amber-600' : 'text-red-600'}">${attPct}%</div>
          <div class="text-xs text-slate-400">Attendance</div>
        </div>
      </div>

      ${hasCritical ? `
      <!-- Critical banner -->
      <div class="mb-4 rounded-xl bg-red-600 text-white p-4 shadow-lg">
        <div class="flex items-start gap-3">
          <span class="text-2xl">🚨</span>
          <div>
            <p class="font-bold text-sm uppercase tracking-wide mb-1">Action Required</p>
            <p class="text-sm text-red-100">${esc(urgentAlerts.find(a=>a.priority==='critical')?.message || '')}</p>
          </div>
        </div>
      </div>` : ''}

      ${urgentAlerts.filter(a=>a.priority!=='critical').map(a => {
        const cfg = priorityConfig[a.priority] || priorityConfig.low;
        return `
        <div class="mb-3 bg-white rounded-xl p-4 border-l-4 ${cfg.bar} shadow-sm flex items-start justify-between gap-3 cursor-pointer" onclick="markAlertRead(${a.id}, this)">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              ${priorityBadge(a.priority)}
              <span class="text-xs text-slate-400">${fmt(a.created_at)}</span>
            </div>
            <p class="text-sm text-slate-700">${esc(a.message)}</p>
          </div>
          <svg class="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </div>`;
      }).join('')}

      <!-- Recent Grades (banking-style transactions) -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-3 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Grades</span>
          <div class="flex items-center gap-2">
            ${trend !== null ? (trend <= -10 ?
              `<span class="text-xs font-bold text-red-600 flex items-center gap-0.5">↓ ${Math.abs(trend)}pt trend</span>` :
              trend >= 5 ?
              `<span class="text-xs font-bold text-emerald-600 flex items-center gap-0.5">↑ ${trend}pt trend</span>` : '') : ''}
            <span class="text-xs text-slate-400">${grades.filter(g=>!g.missing).length} graded</span>
          </div>
        </div>
        ${grades.length ? grades.slice(0,6).map(g => {
          const p = g.score !== null ? pct(g.score, g.max_score) : null;
          return `
          <div class="px-4 py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                ${g.missing ? '<span class="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">MISSING</span>' : ''}
                <span class="text-sm font-medium text-slate-700 truncate">${esc(g.assignment_title)}</span>
              </div>
              <span class="text-xs text-slate-400">${esc(g.subject || g.section_name)} · ${fmt(g.due_date)}</span>
            </div>
            <div class="text-right ml-3 flex-shrink-0">
              ${g.missing ? '<span class="text-base font-bold text-red-400">—</span>' :
                `<span class="text-base ${scoreColor(g.score, g.max_score)}">${g.score}<span class="text-xs font-normal text-slate-300">/${g.max_score}</span></span>`}
              ${p !== null ? `<div class="text-xs text-slate-400">${p}%</div>` : ''}
            </div>
          </div>`;
        }).join('') : `<div class="px-4 py-6 text-center text-sm text-slate-400">No grades yet</div>`}
      </div>

      <!-- Upcoming Due -->
      ${upcoming.length ? `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-3 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upcoming Due</span>
        </div>
        ${upcoming.map(u => {
          const due = new Date(u.due_date);
          const daysLeft = Math.ceil((due - new Date()) / 86400000);
          const urgency = daysLeft <= 1 ? 'text-red-600 bg-red-50' : daysLeft <= 3 ? 'text-amber-600 bg-amber-50' : 'text-slate-600 bg-slate-50';
          return `
          <div class="px-4 py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
            <div>
              <p class="text-sm font-medium text-slate-700">${esc(u.assignment_title)}</p>
              <p class="text-xs text-slate-400">${esc(u.subject || u.section_name)}</p>
            </div>
            <span class="text-xs font-semibold px-2 py-1 rounded-full ${urgency}">
              ${daysLeft <= 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${fmt(u.due_date)}`}
            </span>
          </div>`;
        }).join('')}
      </div>` : ''}

      <!-- Attendance Grid -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-3 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendance — Last 10 Days</span>
          <span class="text-xs text-slate-400">${attendance.filter(a=>a.status==='absent').length} absent · ${attendance.filter(a=>a.status==='tardy').length} tardy</span>
        </div>
        <div class="px-4 py-3">
          <div class="flex gap-1.5 flex-wrap">
            ${attendance.slice(0,10).reverse().map(a => {
              const d = new Date(a.date);
              const day = d.toLocaleDateString('en-US',{weekday:'short'});
              const dt  = d.toLocaleDateString('en-US',{month:'numeric',day:'numeric'});
              return `<div class="flex flex-col items-center gap-1 flex-1 min-w-[36px]">
                <span class="text-xs text-slate-400">${day}</span>
                <span title="${dt}" class="w-full text-center text-xs font-bold py-1.5 rounded-lg ${attColor(a.status)} capitalize">${a.status[0].toUpperCase()}</span>
                <span class="text-xs text-slate-300">${dt}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Behavior Notes (tier 2+) -->
      ${behavior.length ? `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-3 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Behavior Notes</span>
        </div>
        ${behavior.map(b => `
        <div class="px-4 py-3 flex items-start gap-3 border-b border-slate-50 last:border-0">
          <span class="text-xl mt-0.5 flex-shrink-0">${b.type==='positive'?'⭐':b.type==='concern'?'⚠️':'📝'}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-slate-700">${esc(b.note)}</p>
            <p class="text-xs text-slate-400 mt-1">${esc(b.source)} · ${fmt(b.created_at)}</p>
          </div>
        </div>`).join('')}
      </div>` : ''}

      <!-- Shadow Inbox (tier 3) -->
      ${shadow.length ? `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-3 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50 flex items-center gap-2">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Shadow App Inbox</span>
          <span class="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded font-medium">Remind · ClassDojo</span>
        </div>
        ${shadow.map(m => `
        <div class="px-4 py-3 border-b border-slate-50 last:border-0">
          <div class="flex items-center gap-2 mb-1">
            <span class="text-xs font-bold px-2 py-0.5 rounded-full ${m.platform==='Remind'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}">${esc(m.platform)}</span>
            <span class="text-xs text-slate-400">${fmt(m.created_at)}</span>
          </div>
          <p class="text-sm text-slate-700 leading-relaxed">${esc(m.raw_text)}</p>
        </div>`).join('')}
      </div>` : ''}

      <!-- Info alerts -->
      ${infoAlerts.map(a => `
      <div class="mb-2 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100 flex items-center gap-2 cursor-pointer" onclick="markAlertRead(${a.id}, this)">
        <span class="text-blue-500 text-sm">ℹ️</span>
        <p class="text-sm text-blue-700 flex-1">${esc(a.message)}</p>
        <span class="text-xs text-blue-400">${fmt(a.created_at)}</span>
      </div>`).join('')}

      ${(child.teachers||[]).map(t => `
      <button onclick="nav('messages',{prefill:{to_id:${t.id},to_name:'${esc(t.name)}',student_id:${student.id},student_name:'${esc(student.name)}'}})"
        class="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-blue-300 hover:text-blue-600 transition-colors mt-1 mb-1">
        💬 Message ${esc(t.name)} · ${esc(t.subject||'Teacher')}
      </button>`).join('')}
    </div>`;
  }).join('');
}

async function markAlertRead(id, el) {
  await POST(`/api/alerts/${id}/read`).catch(() => {});
  el.style.opacity = '0.35';
  el.style.pointerEvents = 'none';
}

// ── Messages ──────────────────────────────────────────────────────────────────
function renderMessages() {
  if (S.messages !== null) {
    // fall through to render
  } else if (!S._msgsLoaded) {
    S._msgsLoaded = true;
    GET('/api/messages').then(data => { S.messages = data; render(); }).catch(e => { console.error('Messages error:', e); S._msgsLoaded = false; });
    return spinner();
  } else {
    return spinner();
  }
  const unread = S.messages.filter(m => !m.read_at && m.to_id === S.user?.id).length;
  return `
  <div>
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-bold">Messages</h2>
      ${unread ? `<span class="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">${unread} new</span>` : ''}
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4">
      ${S.messages.length ? S.messages.map(m => `
      <div class="px-4 py-4 border-b border-slate-50 last:border-0 ${!m.read_at && m.to_id === S.user?.id ? 'bg-blue-50 border-l-4 border-l-blue-400' : ''}">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-800">${esc(m.from_name)}</span>
            ${m.from_role ? `<span class="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded capitalize">${m.from_role}</span>` : ''}
          </div>
          <span class="text-xs text-slate-400">${fmt(m.created_at)}</span>
        </div>
        ${m.student_name ? `<p class="text-xs text-blue-600 font-medium mb-1">Re: ${esc(m.student_name)}</p>` : ''}
        <p class="text-sm text-slate-600 leading-relaxed">${esc(m.content)}</p>
      </div>`).join('') : `<div class="px-4 py-10 text-center text-sm text-slate-400">No messages yet</div>`}
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <p class="text-sm font-semibold text-slate-700 mb-3">New Message</p>
      ${S.params?.prefill ? `<p class="text-xs text-blue-600 font-medium mb-2">To: ${esc(S.params.prefill.to_name)} · Re: ${esc(S.params.prefill.student_name)}</p>` : ''}
      <textarea id="msg-content" rows="3" placeholder="Type your message..."
        class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"></textarea>
      <button onclick="sendMessage()" class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
        Send
      </button>
    </div>
  </div>`;
}

async function sendMessage() {
  const content = document.getElementById('msg-content')?.value?.trim();
  if (!content) return;
  const prefill = S.params?.prefill;
  const to_id = prefill?.to_id || (S.user?.role === 'parent' ? null : 1);
  if (!to_id) return alert('No recipient — use the message button next to a teacher name.');
  try {
    await POST('/api/messages', { to_id, student_id: prefill?.student_id || null, content });
    document.getElementById('msg-content').value = '';
    S.messages = null;
    S._msgsLoaded = false;
    render();
  } catch (e) { alert(e.message); }
}

// ── Privacy ───────────────────────────────────────────────────────────────────
function renderPrivacy() {
  const tier = S.user?.consent_tier || 3;
  return `
  <div>
    <h2 class="text-lg font-bold mb-1">Data Privacy</h2>
    <p class="text-sm text-slate-500 mb-6">2026 Parent Data Sovereignty Act — you control what SchoolBridge can see and share.</p>
    <div class="space-y-3">
      <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-bold text-slate-800">Tier 1 — Core Data</span>
              <span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-medium">Required</span>
            </div>
            <p class="text-xs text-slate-500">Attendance, grades, and assignments from your school's SIS. Required for app to function.</p>
          </div>
          <div class="w-10 h-6 bg-blue-600 rounded-full flex-shrink-0 mt-0.5"></div>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-5 border ${tier>=2?'border-blue-100':'border-slate-100'} shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <span class="text-sm font-bold text-slate-800">Tier 2 — Behavioral Data</span>
            <p class="text-xs text-slate-500 mt-1">Behavior notes from ClassDojo, teacher observations, counselor flags. Optional.</p>
            ${tier < 2 ? '<p class="text-xs text-amber-600 mt-1 font-medium">⚠️ Disabled — behavior notes hidden from your feed</p>' : '<p class="text-xs text-emerald-600 mt-1 font-medium">✓ Enabled</p>'}
          </div>
          <button onclick="setTier(${tier >= 2 ? 1 : 2})" class="w-10 h-6 rounded-full flex-shrink-0 mt-0.5 transition-all ${tier>=2?'bg-blue-600':'bg-slate-200'}"></button>
        </div>
      </div>
      <div class="bg-white rounded-2xl p-5 border ${tier>=3?'border-blue-100':'border-slate-100'} shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <span class="text-sm font-bold text-slate-800">Tier 3 — Shadow Apps</span>
            <p class="text-xs text-slate-500 mt-1">Aggregates Remind, ClassDojo, Seesaw, and other apps you authorize. Optional.</p>
            ${tier < 3 ? '<p class="text-xs text-amber-600 mt-1 font-medium">⚠️ Disabled — shadow app data purged</p>' : '<p class="text-xs text-emerald-600 mt-1 font-medium">✓ Enabled</p>'}
          </div>
          <button onclick="setTier(${tier >= 3 ? 2 : 3})" class="w-10 h-6 rounded-full flex-shrink-0 mt-0.5 transition-all ${tier>=3?'bg-blue-600':'bg-slate-200'}"></button>
        </div>
      </div>
    </div>
    <div class="mt-4 bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
      <div class="flex items-center justify-between mb-3">
        <h3 class="text-sm font-semibold text-slate-700">Data Audit Log</h3>
        <button onclick="loadAuditLog()" class="text-xs text-blue-600 hover:underline">Load →</button>
      </div>
      <div id="audit-log" class="space-y-1.5"></div>
    </div>
  </div>`;
}

async function setTier(tier) {
  try {
    await PUT('/api/consent', { tier });
    S.user.consent_tier = tier;
    S.feed = null;
    S._feedLoaded = false;
    render();
  } catch (e) { alert(e.message); }
}

async function loadAuditLog() {
  const data = await GET('/api/audit-log');
  document.getElementById('audit-log').innerHTML = data.map(e =>
    `<div class="text-xs text-slate-500 flex justify-between"><span>${esc(e.action)} via ${esc(e.source||'—')}</span><span class="text-slate-400">${fmt(e.created_at)}</span></div>`
  ).join('') || '<div class="text-xs text-slate-400">No events yet</div>';
}

// ── Teacher: Attendance ───────────────────────────────────────────────────────
function renderAttendance() {
  if (S.sections !== null) {
    // fall through to render
  } else if (!S._sectionsLoaded) {
    S._sectionsLoaded = true;
    GET('/api/teacher/sections').then(data => { S.sections = data; render(); }).catch(e => { console.error('Sections error:', e); S._sectionsLoaded = false; });
    return spinner();
  } else {
    return spinner();
  }
  if (S.params.sectionId) return renderAttendanceSheet();

  return `
  <div>
    <h2 class="text-lg font-bold mb-1">Take Attendance</h2>
    <p class="text-sm text-slate-400 mb-5">${new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})}</p>
    <div class="space-y-3">
      ${S.sections.map(sec => `
      <button onclick="loadAttendanceSheet(${sec.id},'${esc(sec.name)}')"
        class="w-full bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-left hover:border-blue-200 hover:shadow-md transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-slate-800">${esc(sec.name)}</p>
            <p class="text-sm text-slate-400">${sec.student_count} students enrolled</p>
          </div>
          <svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </div>
      </button>`).join('') || `<div class="text-center py-10 text-slate-400 text-sm">No sections assigned</div>`}
    </div>
  </div>`;
}

async function loadAttendanceSheet(id, name) {
  const students = await GET(`/api/teacher/sections/${id}/students`);
  S.params = { sectionId: id, sectionName: name, students, records: {} };
  students.forEach(s => { S.params.records[s.id] = s.today_status || 'present'; });
  render();
}

function renderAttendanceSheet() {
  const { sectionId, sectionName, students, records } = S.params;
  const today = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});
  const statuses = ['present','absent','tardy','excused'];
  const btnClass = {
    present: 'bg-emerald-100 text-emerald-700 border-emerald-300',
    absent:  'bg-red-100 text-red-700 border-red-300',
    tardy:   'bg-amber-100 text-amber-700 border-amber-300',
    excused: 'bg-slate-100 text-slate-500 border-slate-300',
  };
  const submitted = Object.values(records);
  const absentCount = submitted.filter(s => s === 'absent').length;
  const tardyCount  = submitted.filter(s => s === 'tardy').length;

  return `
  <div>
    <h2 class="text-base font-bold text-slate-800">${esc(sectionName)}</h2>
    <p class="text-sm text-slate-400 mb-1">${today}</p>
    <div class="flex gap-3 mb-5 text-xs">
      <span class="text-slate-500">${students.length} students</span>
      ${absentCount ? `<span class="text-red-600 font-semibold">${absentCount} absent</span>` : ''}
      ${tardyCount  ? `<span class="text-amber-600 font-semibold">${tardyCount} tardy</span>` : ''}
    </div>
    <div class="space-y-2 mb-6">
      ${students.map(s => `
      <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <p class="font-medium text-slate-800 mb-3">${esc(s.name)}</p>
        <div class="grid grid-cols-4 gap-1.5">
          ${statuses.map(st => `
          <button onclick="setAttendance(${s.id},'${st}')"
            class="py-1.5 rounded-lg text-xs font-semibold border transition-all ${records[s.id]===st ? btnClass[st]+' border-2 scale-105' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'} capitalize">
            ${st[0].toUpperCase()+st.slice(1)}
          </button>`).join('')}
        </div>
      </div>`).join('')}
    </div>
    <button onclick="submitAttendance(${sectionId})"
      class="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors shadow-md">
      Submit Attendance · ${students.length} students
    </button>
  </div>`;
}

function setAttendance(stuId, status) {
  S.params.records[stuId] = status;
  render();
}

async function submitAttendance(sectionId) {
  const today = new Date().toISOString().split('T')[0];
  const records = Object.entries(S.params.records).map(([student_id, status]) => ({
    student_id: parseInt(student_id), section_id: sectionId, date: today, status
  }));
  try {
    await POST('/api/teacher/attendance', { records });
    S.params = {};
    alert(`Attendance submitted for ${records.length} students. Intervention engine running...`);
    render();
  } catch (e) { alert(e.message); }
}

// ── Teacher: Behavior ─────────────────────────────────────────────────────────
function renderBehaviorForm() {
  if (S.sections !== null) {
    // fall through to render
  } else if (!S._sectionsLoaded) {
    S._sectionsLoaded = true;
    GET('/api/teacher/sections').then(data => { S.sections = data; render(); }).catch(e => { console.error('Sections error:', e); S._sectionsLoaded = false; });
    return spinner();
  } else {
    return spinner();
  }
  return `
  <div>
    <h2 class="text-lg font-bold mb-4">Log Behavior Note</h2>
    <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div class="mb-4">
        <label class="block text-sm font-medium text-slate-700 mb-1">Section</label>
        <select id="beh-section" onchange="loadBehStudents()" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select section...</option>
          ${S.sections.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-slate-700 mb-1">Student</label>
        <select id="beh-student" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Select student...</option>
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-slate-700 mb-2">Type</label>
        <div class="grid grid-cols-3 gap-2">
          ${['positive','neutral','concern'].map(t => `
          <button type="button" id="beh-type-${t}" onclick="setBehType('${t}')"
            class="py-2 rounded-lg text-xs font-semibold border transition-all bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100">
            ${t==='positive'?'⭐ Positive':t==='neutral'?'📝 Neutral':'⚠️ Concern'}
          </button>`).join('')}
        </div>
      </div>
      <div class="mb-5">
        <label class="block text-sm font-medium text-slate-700 mb-1">Note</label>
        <textarea id="beh-note" rows="3" placeholder="Describe the behavior..."
          class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"></textarea>
      </div>
      <button onclick="submitBehavior()" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors">
        Save Note
      </button>
    </div>
  </div>`;
}

let _behType = 'neutral';
function setBehType(t) {
  _behType = t;
  const active = { positive:'bg-emerald-100 text-emerald-700 border-emerald-300 border-2', neutral:'bg-slate-100 text-slate-700 border-slate-300 border-2', concern:'bg-red-100 text-red-700 border-red-300 border-2' };
  ['positive','neutral','concern'].forEach(type => {
    const btn = document.getElementById(`beh-type-${type}`);
    if (btn) btn.className = `py-2 rounded-lg text-xs font-semibold border transition-all ${type===t ? active[type] : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'}`;
  });
}

async function loadBehStudents() {
  const secId = document.getElementById('beh-section')?.value;
  if (!secId) return;
  const students = await GET(`/api/teacher/sections/${secId}/students`);
  const sel = document.getElementById('beh-student');
  sel.innerHTML = '<option value="">Select student...</option>' + students.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
}

async function submitBehavior() {
  const student_id = document.getElementById('beh-student')?.value;
  const section_id = document.getElementById('beh-section')?.value;
  const note = document.getElementById('beh-note')?.value?.trim();
  if (!student_id || !note) return alert('Select a student and write a note');
  try {
    await POST('/api/teacher/behavior', { student_id: parseInt(student_id), section_id: parseInt(section_id), type: _behType, note });
    document.getElementById('beh-note').value = '';
    alert('Behavior note saved. Parent alert generated if intervention threshold met.');
  } catch (e) { alert(e.message); }
}

// ── Admin: Overview ───────────────────────────────────────────────────────────
function renderAdmin() {
  if (S.adminData) {
    // fall through to render
  } else if (!S._adminLoaded) {
    S._adminLoaded = true;
    GET('/api/admin/overview').then(data => { S.adminData = data; render(); }).catch(e => { console.error('Admin overview error:', e); S._adminLoaded = false; });
    return spinner();
  } else {
    return spinner();
  }
  const d = S.adminData || {};
  const lastSync = d.syncs?.[0];
  return `
  <div>
    <div class="flex items-center justify-between mb-5">
      <div>
        <h2 class="text-xl font-bold text-slate-800">Lincoln Middle School</h2>
        <p class="text-sm text-slate-400">Syracuse City School District</p>
      </div>
      ${lastSync ? `<div class="text-right">
        <div class="flex items-center gap-1 justify-end">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span class="text-xs text-emerald-600 font-medium">Synced</span>
        </div>
        <p class="text-xs text-slate-400">${fmt(lastSync.created_at)}</p>
      </div>` : ''}
    </div>

    <!-- Key metrics -->
    <div class="grid grid-cols-2 gap-3 mb-5">
      ${[
        { label:'Students Enrolled', value: d.students,     color:'text-blue-600',  bg:'bg-blue-50',  nav:'admin-students', filter:null },
        { label:'Teachers',          value: d.teachers,     color:'text-slate-700', bg:'bg-slate-50' },
        { label:'Absent Today',      value: d.absent_today, color:'text-red-600',   bg:'bg-red-50',   nav:'admin-students', filter:'absent' },
        { label:'Alerts Today',      value: d.alerts_today, color:'text-amber-600', bg:'bg-amber-50', nav:'admin-students', filter:'alerts' },
      ].map(s => `
      <div onclick="${s.nav ? `nav('${s.nav}', {filter:'${s.filter||''}'})` : ''}" class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm ${s.nav ? 'cursor-pointer hover:border-blue-200 hover:shadow-md transition-all' : ''}">
        <div class="text-3xl font-black ${s.color}">${s.value ?? '—'}</div>
        <div class="text-xs text-slate-400 mt-0.5 font-medium">${s.label}</div>
      </div>`).join('')}
    </div>

    <button onclick="runSync()" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm mb-5 transition-colors shadow-sm">
      ⚡ Run Intervention Check Now
    </button>

    <!-- Quick nav -->
    <button onclick="nav('admin-students')" class="w-full bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-left hover:border-blue-200 transition-colors mb-4 flex items-center justify-between">
      <div>
        <p class="font-semibold text-slate-800">Student Risk Dashboard</p>
        <p class="text-sm text-slate-400">View all students, risk scores, and alerts</p>
      </div>
      <svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
    </button>

    <!-- Sync log -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Data Sync Log</span>
        <span class="text-xs text-slate-400">Clever · OneRoster</span>
      </div>
      ${(d.syncs||[]).map(s => `
      <div class="px-4 py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
        <div>
          <span class="text-sm font-medium text-slate-700">${esc(s.source)} — ${esc(s.type)}</span>
          <p class="text-xs text-slate-400">${fmt(s.created_at)} · ${s.records_synced} records</p>
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full font-bold ${s.status==='ok'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}">${s.status==='ok'?'✓ OK':'✗ ERR'}</span>
      </div>`).join('') || `<div class="px-4 py-6 text-center text-sm text-slate-400">No syncs yet</div>`}
    </div>
  </div>`;
}

async function runSync() {
  try {
    const r = await POST('/api/admin/sync');
    S._adminLoaded = false;
    alert(`Intervention check complete.\n${r.alerts_created} new alert${r.alerts_created !== 1 ? 's' : ''} generated.`);
    render();
  } catch (e) { alert(e.message); }
}

// ── Admin: Students ────────────────────────────────────────────────────────────
function renderAdminStudents() {
  if (S.adminStudents) {
    // fall through to render
  } else if (!S._stuListLoaded) {
    S._stuListLoaded = true;
    GET('/api/admin/students').then(data => { S.adminStudents = data; render(); }).catch(e => { console.error('Admin students error:', e); S._stuListLoaded = false; });
    return spinner();
  } else {
    return spinner();
  }
  const filter = S.params?.filter;
  let students = S.adminStudents || [];
  if (filter === 'absent') students = students.filter(s => s.absent_today);
  if (filter === 'alerts') students = students.filter(s => s.last_alert);
  const title = filter === 'absent' ? 'Absent Today' : filter === 'alerts' ? 'Alerts Today' : 'Student Risk Dashboard';
  return `
  <div>
    <h2 class="text-lg font-bold mb-4">${title}</h2>
    <input oninput="filterStudents(this.value)" placeholder="Search students..."
      class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"/>
    <div id="student-list" class="space-y-2">
      ${students.map(s => {
        const risk = riskLabel(parseInt(s.absences), parseInt(s.missing_assignments));
        const trend = s.absences >= 3 || s.missing_assignments >= 3 ? '↑ risk' : '';
        return `
        <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
             data-name="${esc(s.name.toLowerCase())}"
             onclick="loadStudentDetail(${s.id}, '${esc(s.name)}')">
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-semibold text-slate-800">${esc(s.name)}</p>
                <span class="text-xs font-bold px-2 py-0.5 rounded-full border ${risk.cls}">${risk.label}</span>
              </div>
              <div class="flex items-center gap-3 mt-1">
                <span class="text-xs text-slate-400">${esc(s.grade)}</span>
                ${parseInt(s.absences) > 0 ? `<span class="text-xs font-medium text-red-600">${s.absences} absent</span>` : ''}
                ${parseInt(s.missing_assignments) > 0 ? `<span class="text-xs font-medium text-amber-600">${s.missing_assignments} missing</span>` : ''}
                ${parseInt(s.absences) === 0 && parseInt(s.missing_assignments) === 0 ? '<span class="text-xs text-emerald-600 font-medium">No flags</span>' : ''}
              </div>
            </div>
            <svg class="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
          </div>
        </div>`;
      }).join('') || `<div class="text-center py-10 text-slate-400 text-sm">No students found</div>`}
    </div>
  </div>`;
}

function filterStudents(val) {
  document.querySelectorAll('[data-name]').forEach(el => {
    el.style.display = el.dataset.name.includes(val.toLowerCase()) ? '' : 'none';
  });
}

async function loadStudentDetail(id, name) {
  const data = await GET(`/api/admin/student/${id}`);
  nav('student-detail', { studentDetail: data });
}

// ── Admin: Student Detail ─────────────────────────────────────────────────────
function renderStudentDetail() {
  const data = S.params?.studentDetail;
  if (!data) return `<div class="text-slate-400 text-center py-10">Loading...</div>`;

  const { student, attendance, grades, behavior, alerts, stats } = data;
  const risk = riskLabel(stats.absences, stats.missing);
  const subjects = [...new Set(grades.map(g => g.subject).filter(Boolean))];

  return `
  <div>
    <div class="flex items-center justify-between mb-5">
      <div>
        <h2 class="text-xl font-bold text-slate-800">${esc(student.name)}</h2>
        <p class="text-sm text-slate-400">${esc(student.grade)} · Lincoln Middle School</p>
      </div>
      <span class="text-sm font-bold px-3 py-1.5 rounded-full border ${risk.cls}">${risk.label}</span>
    </div>

    <!-- Stats row -->
    <div class="grid grid-cols-3 gap-2 mb-5">
      ${[
        { label:'Absences', value: stats.absences, color: stats.absences >= 3 ? 'text-red-600' : 'text-slate-700' },
        { label:'Missing', value: stats.missing, color: stats.missing >= 2 ? 'text-amber-600' : 'text-slate-700' },
        { label:'Alerts', value: alerts.length, color: alerts.length > 0 ? 'text-blue-600' : 'text-slate-700' },
      ].map(s => `
      <div class="bg-white rounded-xl p-3 border border-slate-100 text-center">
        <div class="text-2xl font-black ${s.color}">${s.value}</div>
        <div class="text-xs text-slate-400 font-medium">${s.label}</div>
      </div>`).join('')}
    </div>

    <!-- Alerts -->
    ${alerts.length ? `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-4">
      <div class="px-4 py-3 border-b border-slate-50">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Intervention Alerts</span>
      </div>
      ${alerts.map(a => {
        const cfg = priorityConfig[a.priority] || priorityConfig.low;
        return `
        <div class="px-4 py-3 border-b border-slate-50 last:border-0 border-l-4 ${cfg.bar}">
          <div class="flex items-center gap-2 mb-1">
            ${priorityBadge(a.priority)}
            <span class="text-xs text-slate-400">${fmt(a.created_at)}</span>
            ${a.read_at ? '<span class="text-xs text-slate-300">· read</span>' : '<span class="text-xs text-blue-500 font-medium">· unread</span>'}
          </div>
          <p class="text-sm text-slate-700">${esc(a.message)}</p>
          <p class="text-xs text-slate-400 mt-1">Parent: ${esc(a.parent_name)}</p>
        </div>`;
      }).join('')}
    </div>` : ''}

    <!-- Grades by subject -->
    ${subjects.map(sub => {
      const subGrades = grades.filter(g => g.subject === sub);
      const trend = gradeTrend(subGrades);
      const avg = subGrades.filter(g=>g.score!=null&&g.max_score>0).reduce((s,g,_,a)=>s+g.score/g.max_score*100/a.length, 0);
      return `
      <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-3">
        <div class="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">${esc(sub)}</span>
          <div class="flex items-center gap-2">
            ${trend !== null && trend <= -10 ? `<span class="text-xs text-red-600 font-bold">↓ ${Math.abs(trend)}pt</span>` : ''}
            ${trend !== null && trend >= 5 ? `<span class="text-xs text-emerald-600 font-bold">↑ ${trend}pt</span>` : ''}
            ${avg > 0 ? `<span class="text-xs font-bold ${avg>=90?'text-emerald-600':avg>=80?'text-blue-600':avg>=70?'text-amber-600':'text-red-600'}">${Math.round(avg)}% avg</span>` : ''}
          </div>
        </div>
        ${subGrades.slice(0,5).map(g => `
        <div class="px-4 py-2.5 flex items-center justify-between border-b border-slate-50 last:border-0">
          <div>
            ${g.missing ? '<span class="text-xs text-red-600 font-bold mr-1">MISSING</span>' : ''}
            <span class="text-sm text-slate-700">${esc(g.assignment_title)}</span>
            <p class="text-xs text-slate-400">${fmt(g.due_date)}</p>
          </div>
          <span class="text-sm font-bold ${scoreColor(g.score, g.max_score)} ml-3">
            ${g.score != null ? `${g.score}/${g.max_score}` : '—'}
          </span>
        </div>`).join('')}
      </div>`;
    }).join('')}

    <!-- Attendance grid -->
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-3">
      <div class="px-4 py-3 border-b border-slate-50">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Attendance</span>
      </div>
      <div class="px-4 py-3 flex flex-wrap gap-1.5">
        ${attendance.slice(0,10).map(a => {
          const d = new Date(a.date);
          return `<div class="flex flex-col items-center gap-0.5">
            <span class="text-xs text-slate-400">${d.toLocaleDateString('en-US',{weekday:'short'})}</span>
            <span class="text-xs font-bold px-2 py-1 rounded-lg ${attColor(a.status)} capitalize">${a.status[0].toUpperCase()}</span>
            <span class="text-xs text-slate-300">${d.toLocaleDateString('en-US',{month:'numeric',day:'numeric'})}</span>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- Behavior -->
    ${behavior.length ? `
    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden mb-3">
      <div class="px-4 py-3 border-b border-slate-50">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Behavior Notes</span>
      </div>
      ${behavior.map(b => `
      <div class="px-4 py-3 flex items-start gap-3 border-b border-slate-50 last:border-0">
        <span class="text-xl flex-shrink-0">${b.type==='positive'?'⭐':b.type==='concern'?'⚠️':'📝'}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-slate-700">${esc(b.note)}</p>
          <p class="text-xs text-slate-400 mt-1">${esc(b.teacher_name)} · ${fmt(b.created_at)}</p>
        </div>
      </div>`).join('')}
    </div>` : ''}
  </div>`;
}

// ── Utils ─────────────────────────────────────────────────────────────────────
function spinner() {
  return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin"></div></div>`;
}

// ── Live updates via SSE ──────────────────────────────────────────────────────
let _sse = null;
function connectSSE() {
  if (_sse) _sse.close();
  _sse = new EventSource('/api/events');
  _sse.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'connected') return;
      // Invalidate all data caches so next render fetches fresh
      S.feed = null; S._feedLoaded = false;
      S.adminData = null; S._adminLoaded = false;
      S.adminStudents = null; S._stuListLoaded = false;
      S.messages = null; S._msgsLoaded = false;
      render();
    } catch (err) { console.error('SSE parse error:', err); }
  };
  _sse.onerror = () => { _sse.close(); _sse = null; setTimeout(connectSSE, 5000); };
}

// ── Boot ──────────────────────────────────────────────────────────────────────
render(); // show login immediately while auth check runs
(async () => {
  try {
    const user = await GET('/auth/me');
    S.user = user;
    connectSSE();
    nav(user.role === 'parent' ? 'feed' : user.role === 'teacher' ? 'attendance' : 'admin');
  } catch (e) {
    console.error('Boot error:', e);
    render();
  }
})();

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  user: null,
  page: 'login',
  params: {},
  history: [],
  feed: [],
  messages: [],
  sections: [],
  adminData: null,
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
  S.page = page; S.params = params;
  render(); window.scrollTo(0,0);
}
function goBack() {
  const prev = S.history.pop();
  if (!prev) return;
  S.page = prev.page; S.params = prev.params;
  render(); window.scrollTo(0,0);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const esc = s => s == null ? '' : String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const fmt = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
const fmtFull = d => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
const pct = (s,m) => m > 0 ? Math.round(s/m*100) : null;
const letterColor = g => {
  if (!g) return 'text-slate-400';
  const v = g[0];
  if (v === 'A') return 'text-emerald-600';
  if (v === 'B') return 'text-blue-600';
  if (v === 'C') return 'text-amber-600';
  return 'text-red-600';
};
const scoreColor = (s,m) => {
  const p = pct(s,m);
  if (p === null) return 'text-slate-400';
  if (p >= 90) return 'text-emerald-600';
  if (p >= 80) return 'text-blue-600';
  if (p >= 70) return 'text-amber-600';
  return 'text-red-600';
};
const statusDot = s => {
  const colors = { present:'bg-emerald-500', absent:'bg-red-500', tardy:'bg-amber-500', excused:'bg-slate-400' };
  return `<span class="inline-block w-2 h-2 rounded-full ${colors[s]||'bg-slate-300'}"></span>`;
};
const priorityBadge = p => {
  const cfg = { critical:['bg-red-100 text-red-700','CRITICAL'], high:['bg-amber-100 text-amber-700','HIGH'], low:['bg-blue-100 text-blue-700','INFO'] };
  const [cls,label] = cfg[p]||['bg-slate-100 text-slate-600',p];
  return `<span class="text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${label}</span>`;
};

// ── Render ────────────────────────────────────────────────────────────────────
function render() {
  const root = document.getElementById('app');
  if (!S.user) { root.innerHTML = renderLogin(); return; }
  root.innerHTML = renderShell();
}

// ── Login ─────────────────────────────────────────────────────────────────────
function renderLogin() {
  return `
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700 p-4">
    <div class="w-full max-w-md">
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-4">
          <svg class="w-9 h-9 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <h1 class="text-3xl font-bold text-white">SchoolBridge</h1>
        <p class="text-brand-200 mt-1 text-sm">Unified Parent Engagement Hub</p>
      </div>
      <div class="bg-white rounded-2xl shadow-2xl p-8">
        <div id="login-error" class="hidden mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm"></div>
        <form onsubmit="doLogin(event)">
          <div class="mb-4">
            <label class="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input id="login-email" type="email" required placeholder="you@school.edu"
              class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"/>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-slate-700 mb-1">Password</label>
            <input id="login-password" type="password" required placeholder="••••••••"
              class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"/>
          </div>
          <button type="submit" class="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors">
            Sign In
          </button>
        </form>
        <div class="mt-6 pt-6 border-t border-slate-100">
          <p class="text-xs text-slate-400 text-center mb-3">Demo accounts</p>
          <div class="grid grid-cols-3 gap-2">
            <button onclick="quickLogin('parent@demo.com','parent123')" class="py-2 px-3 rounded-lg bg-slate-50 hover:bg-brand-50 border border-slate-200 text-xs font-medium text-slate-600 hover:text-brand-700 transition-colors">
              👨‍👩‍👧 Parent
            </button>
            <button onclick="quickLogin('thompson@lincoln.edu','teacher123')" class="py-2 px-3 rounded-lg bg-slate-50 hover:bg-brand-50 border border-slate-200 text-xs font-medium text-slate-600 hover:text-brand-700 transition-colors">
              👨‍🏫 Teacher
            </button>
            <button onclick="quickLogin('admin@lincoln.edu','admin123')" class="py-2 px-3 rounded-lg bg-slate-50 hover:bg-brand-50 border border-slate-200 text-xs font-medium text-slate-600 hover:text-brand-700 transition-colors">
              🏫 Admin
            </button>
          </div>
        </div>
      </div>
      <p class="text-center text-brand-300 text-xs mt-6">Lincoln Middle School · Demo Environment</p>
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
      { page:'feed', label:'Home', icon:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { page:'messages', label:'Messages', icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
      { page:'privacy', label:'Privacy', icon:'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    ],
    teacher: [
      { page:'attendance', label:'Attendance', icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { page:'behavior', label:'Behavior', icon:'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
      { page:'messages', label:'Messages', icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    ],
    admin: [
      { page:'admin', label:'Overview', icon:'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-1a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z' },
      { page:'admin-students', label:'Students', icon:'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { page:'messages', label:'Messages', icon:'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z' },
    ],
  };

  const items = navItems[S.user.role] || [];
  const navHtml = items.map(n => `
    <button onclick="nav('${n.page}')" class="flex flex-col items-center gap-1 flex-1 py-2 ${S.page===n.page?'text-brand-600':'text-slate-400 hover:text-slate-600'} transition-colors">
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
    <!-- Top bar -->
    <header class="sticky top-0 z-40 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between">
      <div class="flex items-center gap-3">
        ${S.history.length > 0 ? `<button onclick="goBack()" class="text-slate-400 hover:text-slate-700 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
        </button>` : ''}
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-lg bg-brand-600 flex items-center justify-center">
            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
          </div>
          <span class="font-semibold text-slate-800 text-sm">SchoolBridge</span>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400">${esc(S.user.name)}</span>
        <button onclick="doLogout()" class="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded">Sign out</button>
      </div>
    </header>
    <!-- Page content -->
    <main class="flex-1 overflow-y-auto pb-20">
      <div class="max-w-2xl mx-auto px-4 py-6 fade-in">${pageHtml}</div>
    </main>
    <!-- Bottom nav -->
    <nav class="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex z-40">
      ${navHtml}
    </nav>
  </div>`;
}

async function doLogout() {
  await POST('/auth/logout');
  S.user = null; S.page = 'login'; S.history = []; S.feed = [];
  render();
}

// ── Parent: Feed ──────────────────────────────────────────────────────────────
function renderFeed() {
  if (!S._feedLoaded) {
    S._feedLoaded = true;
    GET('/api/feed').then(data => { S.feed = data; S._feedLoaded = false; render(); }).catch(console.error);
    return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin"></div></div>`;
  }
  if (!S.feed.length) return `<div class="text-center py-16 text-slate-400">No students linked to your account.</div>`;

  return S.feed.map(child => {
    const { student, alerts, attendance, grades, upcoming, behavior, shadow } = child;
    const criticalAlerts = alerts.filter(a => a.priority === 'critical' || a.priority === 'high');
    const todayAtt = attendance[0];
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const totalDays = attendance.length;

    return `
    <div class="mb-6">
      <!-- Student header -->
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-bold text-slate-800">${esc(student.name)}</h2>
          <p class="text-sm text-slate-400">${esc(student.grade)} · Lincoln Middle School</p>
        </div>
        <div class="text-right">
          <div class="text-sm font-semibold ${presentDays/totalDays >= 0.9 ? 'text-emerald-600' : presentDays/totalDays >= 0.8 ? 'text-amber-600' : 'text-red-600'}">
            ${totalDays > 0 ? Math.round(presentDays/totalDays*100) : 0}%
          </div>
          <div class="text-xs text-slate-400">Attendance</div>
        </div>
      </div>

      <!-- Urgent alerts -->
      ${criticalAlerts.length ? `
      <div class="mb-4 space-y-2">
        ${criticalAlerts.map(a => `
        <div class="bg-white rounded-xl p-4 priority-${a.priority} flex items-start justify-between gap-3 shadow-sm cursor-pointer" onclick="markAlertRead(${a.id}, this)">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              ${priorityBadge(a.priority)}
              <span class="text-xs text-slate-400">${fmt(a.created_at)}</span>
            </div>
            <p class="text-sm text-slate-700">${esc(a.message)}</p>
          </div>
          <svg class="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </div>`).join('')}
      </div>` : ''}

      <!-- Recent Grades (like transactions) -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Grades</span>
          <span class="text-xs text-slate-400">${grades.length} items</span>
        </div>
        ${grades.length ? grades.slice(0,5).map(g => `
        <div class="px-4 py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              ${g.missing ? '<span class="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-medium">MISSING</span>' : ''}
              <span class="text-sm font-medium text-slate-700 truncate">${esc(g.assignment_title)}</span>
            </div>
            <span class="text-xs text-slate-400">${esc(g.subject || g.section_name)} · ${fmt(g.due_date)}</span>
          </div>
          <div class="text-right ml-3 flex-shrink-0">
            ${g.missing ? '<span class="text-sm font-bold text-red-500">—</span>' :
              `<span class="text-sm font-bold ${scoreColor(g.score, g.max_score)}">${g.score !== null ? g.score : '—'}${g.max_score ? `<span class="text-xs font-normal text-slate-300">/${g.max_score}</span>` : ''}</span>`}
          </div>
        </div>`).join('') : `<div class="px-4 py-6 text-center text-sm text-slate-400">No grades yet</div>`}
      </div>

      <!-- Upcoming (like scheduled payments) -->
      ${upcoming.length ? `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Upcoming Due</span>
        </div>
        ${upcoming.map(u => `
        <div class="px-4 py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
          <div>
            <p class="text-sm font-medium text-slate-700">${esc(u.assignment_title)}</p>
            <p class="text-xs text-slate-400">${esc(u.subject)}</p>
          </div>
          <span class="text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">Due ${fmt(u.due_date)}</span>
        </div>`).join('')}
      </div>` : ''}

      <!-- Attendance this week -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Attendance</span>
        </div>
        <div class="px-4 py-3">
          <div class="grid grid-cols-5 gap-2">
            ${attendance.slice(0,10).reverse().map(a => {
              const d = new Date(a.date);
              const day = d.toLocaleDateString('en-US',{weekday:'short'});
              const colors = { present:'bg-emerald-100 text-emerald-700', absent:'bg-red-100 text-red-700', tardy:'bg-amber-100 text-amber-700', excused:'bg-slate-100 text-slate-500' };
              return `<div class="flex flex-col items-center gap-1">
                <span class="text-xs text-slate-400">${day}</span>
                <span class="text-xs font-semibold px-2 py-1 rounded-lg ${colors[a.status]||'bg-slate-100 text-slate-500'} capitalize">${a.status[0].toUpperCase()}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Behavior (if tier 2+) -->
      ${behavior.length ? `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 overflow-hidden">
        <div class="px-4 py-3 border-b border-slate-50">
          <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Behavior Notes</span>
        </div>
        ${behavior.map(b => `
        <div class="px-4 py-3 flex items-start gap-3 border-b border-slate-50 last:border-0">
          <span class="mt-0.5 text-lg">${b.type==='positive'?'⭐':b.type==='concern'?'⚠️':'📝'}</span>
          <div>
            <p class="text-sm text-slate-700">${esc(b.note)}</p>
            <p class="text-xs text-slate-400 mt-0.5">${esc(b.source)} · ${fmt(b.created_at)}</p>
          </div>
        </div>`).join('')}
      </div>` : ''}

      <!-- Quick message teacher -->
      <button onclick="nav('messages')" class="w-full py-3 rounded-xl border-2 border-dashed border-slate-200 text-sm text-slate-500 hover:border-brand-300 hover:text-brand-600 transition-colors">
        💬 Message teacher
      </button>
    </div>`;
  }).join('');
}

async function markAlertRead(id, el) {
  await POST(`/api/alerts/${id}/read`);
  el.style.opacity = '0.4';
}

// ── Messages ──────────────────────────────────────────────────────────────────
function renderMessages() {
  if (!S._msgsLoaded) {
    S._msgsLoaded = true;
    GET('/api/messages').then(data => { S.messages = data; S._msgsLoaded = false; render(); }).catch(console.error);
    return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin"></div></div>`;
  }
  return `
  <div>
    <h2 class="text-lg font-bold mb-4">Messages</h2>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-4">
      ${S.messages.length ? S.messages.map(m => `
      <div class="px-4 py-3 border-b border-slate-50 last:border-0 ${!m.read_at && m.to_id === S.user?.id ? 'bg-brand-50' : ''}">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium text-slate-700">${esc(m.from_name)}</span>
          <span class="text-xs text-slate-400">${fmt(m.created_at)}</span>
        </div>
        ${m.student_name ? `<span class="text-xs text-brand-500 font-medium">Re: ${esc(m.student_name)}</span>` : ''}
        <p class="text-sm text-slate-600 mt-0.5">${esc(m.content)}</p>
      </div>`).join('') : `<div class="px-4 py-8 text-center text-sm text-slate-400">No messages yet</div>`}
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <p class="text-sm font-medium text-slate-700 mb-3">Send a message</p>
      <textarea id="msg-content" rows="3" placeholder="Type your message..."
        class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none mb-3"></textarea>
      <button onclick="sendMessage()" class="w-full py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium transition-colors">
        Send Message
      </button>
    </div>
  </div>`;
}

async function sendMessage() {
  const content = document.getElementById('msg-content')?.value?.trim();
  if (!content) return;
  // Find a teacher to send to (first teacher linked via feed)
  try {
    await POST('/api/messages', { to_id: 2, student_id: S.feed[0]?.student?.id || null, content });
    document.getElementById('msg-content').value = '';
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
    <p class="text-sm text-slate-500 mb-6">2026 Parent Data Sovereignty Act — you control what SchoolBridge can see.</p>

    <div class="space-y-4">
      <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-sm font-semibold text-slate-800">Tier 1 — Core Data</span>
              <span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Required</span>
            </div>
            <p class="text-xs text-slate-500">Attendance, grades, assignments from your school's SIS. Required for app to function.</p>
          </div>
          <div class="w-10 h-6 bg-brand-600 rounded-full flex-shrink-0 mt-0.5"></div>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <span class="text-sm font-semibold text-slate-800">Tier 2 — Behavioral Data</span>
            <p class="text-xs text-slate-500 mt-1">Behavior notes from ClassDojo, teacher observations. Optional.</p>
            ${tier < 2 ? '<p class="text-xs text-amber-600 mt-1">⚠️ Disabled — behavior feed hidden</p>' : ''}
          </div>
          <button onclick="setTier(${tier >= 2 ? 1 : 2})"
            class="w-10 h-6 rounded-full flex-shrink-0 mt-0.5 transition-colors ${tier >= 2 ? 'bg-brand-600' : 'bg-slate-200'}">
          </button>
        </div>
      </div>

      <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1">
            <span class="text-sm font-semibold text-slate-800">Tier 3 — Shadow Apps</span>
            <p class="text-xs text-slate-500 mt-1">Remind, Seesaw, and other unofficial apps you authorize. Optional.</p>
            ${tier < 3 ? '<p class="text-xs text-amber-600 mt-1">⚠️ Disabled — shadow app data purged</p>' : ''}
          </div>
          <button onclick="setTier(${tier >= 3 ? 2 : 3})"
            class="w-10 h-6 rounded-full flex-shrink-0 mt-0.5 transition-colors ${tier >= 3 ? 'bg-brand-600' : 'bg-slate-200'}">
          </button>
        </div>
      </div>
    </div>

    <div class="mt-6 bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <h3 class="text-sm font-semibold mb-3">Data Audit Log</h3>
      <button onclick="loadAuditLog()" class="text-xs text-brand-600 hover:underline">View all data access events →</button>
      <div id="audit-log" class="mt-3 space-y-1"></div>
    </div>
  </div>`;
}

async function setTier(tier) {
  try {
    await PUT('/api/consent', { tier });
    S.user.consent_tier = tier;
    S._feedLoaded = false;
    render();
  } catch (e) { alert(e.message); }
}

async function loadAuditLog() {
  const data = await GET('/api/audit-log');
  document.getElementById('audit-log').innerHTML = data.map(e =>
    `<div class="text-xs text-slate-500">${fmt(e.created_at)} · ${esc(e.action)} · ${esc(e.source||'')}</div>`
  ).join('') || '<div class="text-xs text-slate-400">No events</div>';
}

// ── Teacher: Attendance ───────────────────────────────────────────────────────
function renderAttendance() {
  if (!S._sectionsLoaded) {
    S._sectionsLoaded = true;
    GET('/api/teacher/sections').then(data => { S.sections = data; S._sectionsLoaded = false; render(); }).catch(console.error);
    return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin"></div></div>`;
  }

  if (S.params.sectionId) return renderAttendanceSheet();

  return `
  <div>
    <h2 class="text-lg font-bold mb-4">Take Attendance</h2>
    <div class="space-y-3">
      ${S.sections.map(sec => `
      <button onclick="loadAttendanceSheet(${sec.id},'${esc(sec.name)}')"
        class="w-full bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-left hover:border-brand-200 transition-colors">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-slate-800">${esc(sec.name)}</p>
            <p class="text-sm text-slate-400">${sec.student_count} students</p>
          </div>
          <svg class="w-5 h-5 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
        </div>
      </button>`).join('') || `<div class="text-center py-8 text-slate-400 text-sm">No sections assigned</div>`}
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
  const colors = { present:'bg-emerald-100 text-emerald-700 border-emerald-300', absent:'bg-red-100 text-red-700 border-red-300', tardy:'bg-amber-100 text-amber-700 border-amber-300', excused:'bg-slate-100 text-slate-600 border-slate-300' };

  return `
  <div>
    <h2 class="text-lg font-bold">${esc(sectionName)}</h2>
    <p class="text-sm text-slate-400 mb-5">${today}</p>
    <div class="space-y-3 mb-6">
      ${students.map(s => `
      <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm">
        <p class="font-medium text-slate-800 mb-3">${esc(s.name)}</p>
        <div class="grid grid-cols-4 gap-2">
          ${statuses.map(st => `
          <button onclick="setAttendance(${s.id},'${st}')"
            class="py-1.5 rounded-lg text-xs font-semibold border transition-all ${records[s.id]===st ? colors[st]+' border-2' : 'bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100'} capitalize">
            ${st[0].toUpperCase()+st.slice(1)}
          </button>`).join('')}
        </div>
      </div>`).join('')}
    </div>
    <button onclick="submitAttendance(${sectionId})"
      class="w-full py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors">
      Submit Attendance
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
    S._sectionsLoaded = false;
    alert(`Attendance submitted for ${records.length} students. Intervention checks running.`);
    render();
  } catch (e) { alert(e.message); }
}

// ── Teacher: Behavior ─────────────────────────────────────────────────────────
function renderBehaviorForm() {
  if (!S._sectionsLoaded) {
    S._sectionsLoaded = true;
    GET('/api/teacher/sections').then(data => { S.sections = data; S._sectionsLoaded = false; render(); }).catch(console.error);
    return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin"></div></div>`;
  }
  return `
  <div>
    <h2 class="text-lg font-bold mb-4">Log Behavior Note</h2>
    <div class="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
      <div class="mb-4">
        <label class="block text-sm font-medium text-slate-700 mb-1">Section</label>
        <select id="beh-section" onchange="loadBehStudents()" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
          <option value="">Select section...</option>
          ${S.sections.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
        </select>
      </div>
      <div class="mb-4">
        <label class="block text-sm font-medium text-slate-700 mb-1">Student</label>
        <select id="beh-student" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500">
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
      <div class="mb-4">
        <label class="block text-sm font-medium text-slate-700 mb-1">Note</label>
        <textarea id="beh-note" rows="3" placeholder="Describe the behavior..."
          class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"></textarea>
      </div>
      <button onclick="submitBehavior()" class="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm transition-colors">
        Save Note
      </button>
    </div>
  </div>`;
}

let _behType = 'neutral';
function setBehType(t) {
  _behType = t;
  ['positive','neutral','concern'].forEach(type => {
    const btn = document.getElementById(`beh-type-${type}`);
    if (!btn) return;
    const active = { positive:'bg-emerald-100 text-emerald-700 border-emerald-300 border-2', neutral:'bg-slate-100 text-slate-700 border-slate-300 border-2', concern:'bg-red-100 text-red-700 border-red-300 border-2' };
    btn.className = `py-2 rounded-lg text-xs font-semibold border transition-all ${type===t ? active[type] : 'bg-slate-50 text-slate-500 border-slate-100 hover:bg-slate-100'}`;
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
    alert('Behavior note saved. Parents will be notified if intervention triggered.');
  } catch (e) { alert(e.message); }
}

// ── Admin ─────────────────────────────────────────────────────────────────────
function renderAdmin() {
  if (!S._adminLoaded) {
    S._adminLoaded = true;
    GET('/api/admin/overview').then(data => { S.adminData = data; S._adminLoaded = false; render(); }).catch(console.error);
    return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin"></div></div>`;
  }
  const d = S.adminData || {};
  return `
  <div>
    <h2 class="text-lg font-bold mb-4">School Overview</h2>
    <div class="grid grid-cols-2 gap-3 mb-6">
      ${[
        { label:'Students', value: d.students, color:'text-brand-600' },
        { label:'Teachers', value: d.teachers, color:'text-slate-700' },
        { label:'Absent Today', value: d.absent_today, color:'text-red-600' },
        { label:'Alerts Today', value: d.alerts_today, color:'text-amber-600' },
      ].map(s => `
      <div class="bg-white rounded-2xl p-4 border border-slate-100 shadow-sm text-center">
        <div class="text-2xl font-bold ${s.color}">${s.value ?? '—'}</div>
        <div class="text-xs text-slate-400 mt-0.5">${s.label}</div>
      </div>`).join('')}
    </div>

    <button onclick="runSync()" class="w-full py-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm mb-6 transition-colors">
      Run Intervention Check Now
    </button>

    <div class="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div class="px-4 py-3 border-b border-slate-50">
        <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Sync Log</span>
      </div>
      ${(d.syncs||[]).map(s => `
      <div class="px-4 py-3 flex items-center justify-between border-b border-slate-50 last:border-0">
        <div>
          <span class="text-sm font-medium text-slate-700 capitalize">${s.source} · ${s.type}</span>
          <p class="text-xs text-slate-400">${fmt(s.created_at)} · ${s.records_synced} records</p>
        </div>
        <span class="text-xs px-2 py-0.5 rounded-full font-medium ${s.status==='ok'?'bg-emerald-100 text-emerald-700':'bg-red-100 text-red-700'}">${s.status}</span>
      </div>`).join('') || `<div class="px-4 py-6 text-center text-sm text-slate-400">No syncs yet</div>`}
    </div>
  </div>`;
}

async function runSync() {
  try {
    const r = await POST('/api/admin/sync');
    S._adminLoaded = false;
    alert(`Intervention check complete. ${r.alerts_created} new alert${r.alerts_created !== 1 ? 's' : ''} created.`);
    render();
  } catch (e) { alert(e.message); }
}

function renderAdminStudents() {
  if (!S._stuListLoaded) {
    S._stuListLoaded = true;
    GET('/api/admin/students').then(data => { S.adminStudents = data; S._stuListLoaded = false; render(); }).catch(console.error);
    return `<div class="flex items-center justify-center py-20"><div class="w-8 h-8 rounded-full border-2 border-brand-600 border-t-transparent animate-spin"></div></div>`;
  }
  const students = S.adminStudents || [];
  return `
  <div>
    <h2 class="text-lg font-bold mb-4">All Students</h2>
    <input oninput="filterStudents(this.value)" placeholder="Search students..."
      class="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4"/>
    <div id="student-list" class="space-y-2">
      ${students.map(s => `
      <div class="bg-white rounded-xl p-4 border border-slate-100 shadow-sm flex items-center justify-between" data-name="${esc(s.name.toLowerCase())}">
        <div>
          <p class="font-medium text-slate-800">${esc(s.name)}</p>
          <p class="text-xs text-slate-400">${s.grade} · ${s.absences} absences · ${s.missing_assignments} missing</p>
        </div>
        <div class="flex items-center gap-2">
          ${parseInt(s.absences) >= 3 ? '<span class="w-2 h-2 rounded-full bg-red-500"></span>' : ''}
          ${parseInt(s.missing_assignments) >= 2 ? '<span class="w-2 h-2 rounded-full bg-amber-500"></span>' : ''}
        </div>
      </div>`).join('') || `<div class="text-center py-8 text-slate-400 text-sm">No students found</div>`}
    </div>
  </div>`;
}

function filterStudents(val) {
  document.querySelectorAll('[data-name]').forEach(el => {
    el.style.display = el.dataset.name.includes(val.toLowerCase()) ? '' : 'none';
  });
}

function renderStudentDetail() {
  return `<div class="text-slate-400 text-center py-8">Student detail — coming soon</div>`;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
  try {
    const user = await GET('/auth/me');
    S.user = user;
    nav(user.role === 'parent' ? 'feed' : user.role === 'teacher' ? 'attendance' : 'admin');
  } catch {
    render();
  }
})();

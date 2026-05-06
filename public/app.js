// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  user: null, page: 'login', params: {}, history: [],
  feed: null, messages: null, sections: null, adminData: null, adminStudents: null,
  lang: localStorage.getItem('sb_lang') || navigator.language.split('-')[0] || 'en',
};

// ── i18n ──────────────────────────────────────────────────────────────────────
const LANGS = { en:'English', es:'Español', zh:'中文', ht:'Kreyòl', vi:'Tiếng Việt', ar:'العربية', ko:'한국어', pt:'Português' };
const TR = {
  en:{ signin:'Sign In',email:'Email',password:'Password',home:'Home',messages:'Messages',privacy:'Privacy',attendance:'Attendance',behavior:'Behavior',overview:'Overview',students:'Students',present:'Present',absent:'Absent',tardy:'Tardy',excused:'Excused',recentGrades:'Recent Grades',upcomingDue:'Upcoming Due',behaviorNotes:'Behavior Notes',actionRequired:'Action Required',missing:'MISSING',takeAttendance:'Take Attendance',submitAttendance:'Submit Attendance',logBehavior:'Log Behavior Note',section:'Section',student:'Student',note:'Note',saveNote:'Save Note',positive:'⭐ Positive',neutral:'📝 Neutral',concern:'⚠️ Concern',newMessage:'New Message',send:'Send',noMessages:'No messages yet',dataPrivacy:'Data Privacy',runCheck:'Run Intervention Check',absentToday:'Absent Today',alertsToday:'Alerts Today',teachers:'Teachers',tapReply:'↩ Tap to reply',interventionRunning:'Intervention engine running…',behaviorSaved:'Behavior note saved',selectStudentNote:'Select a student and write a note',noRecipient:'No recipient — tap a teacher name from your feed first.',interventionComplete:'Intervention check complete',newAlerts:'new alerts generated',alreadySubmitted:'✓ Submitted today',messageParent:'Message Parent',sendReply:'Send Reply',attendanceSaved:'Attendance submitted ✓',busOnWay:'Bus on the way',busArrived:'Bus arrived at school',busHome:'At home',busUnknown:'Location unknown',justifyAbsence:'Submit Excuse',justificationSent:'Excuse submitted ✓',writeReason:'Reason for absence…',logisticallyPresent:'Scanned on bus — not yet in class' },
  es:{ signin:'Iniciar sesión',email:'Correo electrónico',password:'Contraseña',home:'Inicio',messages:'Mensajes',privacy:'Privacidad',attendance:'Asistencia',behavior:'Conducta',overview:'Resumen',students:'Estudiantes',present:'Presente',absent:'Ausente',tardy:'Tarde',excused:'Justificado',recentGrades:'Calificaciones recientes',upcomingDue:'Próximas entregas',behaviorNotes:'Notas de conducta',actionRequired:'Acción requerida',missing:'FALTANTE',takeAttendance:'Tomar asistencia',submitAttendance:'Enviar asistencia',logBehavior:'Registrar conducta',section:'Sección',student:'Estudiante',note:'Nota',saveNote:'Guardar nota',positive:'⭐ Positivo',neutral:'📝 Neutral',concern:'⚠️ Preocupación',newMessage:'Nuevo mensaje',send:'Enviar',noMessages:'Sin mensajes aún',dataPrivacy:'Privacidad de datos',runCheck:'Ejecutar verificación',absentToday:'Ausentes hoy',alertsToday:'Alertas de hoy',teachers:'Maestros',tapReply:'↩ Toca para responder',interventionRunning:'Motor de intervención ejecutando…',behaviorSaved:'Nota guardada',selectStudentNote:'Selecciona un estudiante y escribe una nota',noRecipient:'Sin destinatario — toca el nombre de un maestro primero.',interventionComplete:'Verificación completa',newAlerts:'nuevas alertas generadas',alreadySubmitted:'✓ Enviada hoy',messageParent:'Mensaje al padre',sendReply:'Enviar respuesta',attendanceSaved:'Asistencia enviada ✓',busOnWay:'Autobús en camino',busArrived:'Autobús llegó a la escuela',busHome:'En casa',busUnknown:'Ubicación desconocida',justifyAbsence:'Enviar justificación',justificationSent:'Justificación enviada ✓',writeReason:'Motivo de ausencia…',logisticallyPresent:'Escaneado en autobús — aún no en clase' },
  ht:{ signin:'Konekte',email:'Imèl',password:'Modpas',home:'Lakay',messages:'Mesaj',privacy:'Vi prive',attendance:'Prezans',behavior:'Konpòtman',overview:'Apèsi',students:'Elèv',present:'Prezan',absent:'Absan',tardy:'An reta',excused:'Eskize',recentGrades:'Nòt resan',upcomingDue:'Travay k ap vini',behaviorNotes:'Nòt konpòtman',actionRequired:'Aksyon obligatwa',missing:'MANKE',takeAttendance:'Pran prezans',submitAttendance:'Soumèt prezans',logBehavior:'Anrejistre nòt',section:'Seksyon',student:'Elèv',note:'Nòt',saveNote:'Sove nòt',positive:'⭐ Pozitif',neutral:'📝 Nèt',concern:'⚠️ Enkyetid',newMessage:'Nouvo mesaj',send:'Voye',noMessages:'Pa gen mesaj ankò',dataPrivacy:'Vi prive done',runCheck:'Kouri verifikasyon',absentToday:'Absan jodi a',alertsToday:'Alèt jodi a',teachers:'Pwofesè',tapReply:'↩ Klike pou reponn',interventionRunning:'Motè entèvansyon ap kouri…',behaviorSaved:'Nòt sove',selectStudentNote:'Chwazi yon elèv epi ekri yon nòt',noRecipient:'Pa gen destinatè — peze non pwofesè dabò.',interventionComplete:'Verifikasyon konplè',newAlerts:'nouvo alèt jenere',alreadySubmitted:'✓ Soumèt jodi a',messageParent:'Mesaj paran',sendReply:'Voye repons',attendanceSaved:'Prezans soumèt ✓' },
  vi:{ signin:'Đăng nhập',email:'Email',password:'Mật khẩu',home:'Trang chủ',messages:'Tin nhắn',privacy:'Quyền riêng tư',attendance:'Điểm danh',behavior:'Hành vi',overview:'Tổng quan',students:'Học sinh',present:'Có mặt',absent:'Vắng mặt',tardy:'Trễ',excused:'Có phép',recentGrades:'Điểm gần đây',upcomingDue:'Bài sắp hạn',behaviorNotes:'Ghi chú hành vi',actionRequired:'Cần hành động',missing:'THIẾU',takeAttendance:'Điểm danh',submitAttendance:'Gửi điểm danh',logBehavior:'Ghi chú hành vi',section:'Lớp',student:'Học sinh',note:'Ghi chú',saveNote:'Lưu ghi chú',positive:'⭐ Tích cực',neutral:'📝 Bình thường',concern:'⚠️ Đáng lo',newMessage:'Tin nhắn mới',send:'Gửi',noMessages:'Chưa có tin nhắn',dataPrivacy:'Quyền riêng tư',runCheck:'Kiểm tra can thiệp',absentToday:'Vắng mặt hôm nay',alertsToday:'Cảnh báo hôm nay',teachers:'Giáo viên',tapReply:'↩ Nhấn để trả lời',interventionRunning:'Đang kiểm tra…',behaviorSaved:'Đã lưu ghi chú',selectStudentNote:'Chọn học sinh và viết ghi chú',noRecipient:'Không có người nhận — nhấn tên giáo viên trước.',interventionComplete:'Kiểm tra hoàn tất',newAlerts:'cảnh báo mới',alreadySubmitted:'✓ Đã gửi hôm nay',messageParent:'Nhắn phụ huynh',sendReply:'Gửi trả lời',attendanceSaved:'Đã gửi điểm danh ✓' },
  ar:{ signin:'تسجيل الدخول',email:'البريد الإلكتروني',password:'كلمة المرور',home:'الرئيسية',messages:'الرسائل',privacy:'الخصوصية',attendance:'الحضور',behavior:'السلوك',overview:'نظرة عامة',students:'الطلاب',present:'حاضر',absent:'غائب',tardy:'متأخر',excused:'بعذر',recentGrades:'الدرجات الأخيرة',upcomingDue:'المهام القادمة',behaviorNotes:'ملاحظات السلوك',actionRequired:'إجراء مطلوب',missing:'مفقود',takeAttendance:'أخذ الحضور',submitAttendance:'إرسال الحضور',logBehavior:'تسجيل ملاحظة',section:'الفصل',student:'الطالب',note:'ملاحظة',saveNote:'حفظ',positive:'⭐ إيجابي',neutral:'📝 محايد',concern:'⚠️ مقلق',newMessage:'رسالة جديدة',send:'إرسال',noMessages:'لا رسائل',dataPrivacy:'خصوصية البيانات',runCheck:'فحص التدخل',absentToday:'الغائبون اليوم',alertsToday:'تنبيهات اليوم',teachers:'المعلمون',tapReply:'↩ اضغط للرد',interventionRunning:'جارٍ التحقق…',behaviorSaved:'تم حفظ الملاحظة',selectStudentNote:'اختر طالباً واكتب ملاحظة',noRecipient:'لا يوجد مستلم — اضغط اسم المعلم أولاً.',interventionComplete:'اكتمل الفحص',newAlerts:'تنبيهات جديدة',alreadySubmitted:'✓ تم الإرسال اليوم',messageParent:'مراسلة ولي الأمر',sendReply:'إرسال الرد',attendanceSaved:'تم إرسال الحضور ✓' },
  zh:{ signin:'登录',email:'电子邮件',password:'密码',home:'主页',messages:'消息',privacy:'隐私',attendance:'考勤',behavior:'行为',overview:'概览',students:'学生',present:'出席',absent:'缺席',tardy:'迟到',excused:'请假',recentGrades:'近期成绩',upcomingDue:'即将到期',behaviorNotes:'行为记录',actionRequired:'需要行动',missing:'缺交',takeAttendance:'点名',submitAttendance:'提交考勤',logBehavior:'记录行为',section:'班级',student:'学生',note:'备注',saveNote:'保存',positive:'⭐ 积极',neutral:'📝 中性',concern:'⚠️ 关注',newMessage:'新消息',send:'发送',noMessages:'暂无消息',dataPrivacy:'数据隐私',runCheck:'运行干预检查',absentToday:'今日缺席',alertsToday:'今日警报',teachers:'教师',tapReply:'↩ 点击回复',interventionRunning:'干预引擎运行中…',behaviorSaved:'行为记录已保存',selectStudentNote:'请选择学生并填写备注',noRecipient:'无收件人 — 请先点击教师姓名。',interventionComplete:'干预检查完成',newAlerts:'条新警报',alreadySubmitted:'✓ 今日已提交',messageParent:'联系家长',sendReply:'发送回复',attendanceSaved:'考勤已提交 ✓' },
  ko:{ signin:'로그인',email:'이메일',password:'비밀번호',home:'홈',messages:'메시지',privacy:'개인정보',attendance:'출석',behavior:'행동',overview:'개요',students:'학생',present:'출석',absent:'결석',tardy:'지각',excused:'공결',recentGrades:'최근 성적',upcomingDue:'제출 예정',behaviorNotes:'행동 메모',actionRequired:'조치 필요',missing:'미제출',takeAttendance:'출석 확인',submitAttendance:'출석 제출',logBehavior:'행동 메모 기록',section:'학급',student:'학생',note:'메모',saveNote:'저장',positive:'⭐ 긍정',neutral:'📝 중립',concern:'⚠️ 우려',newMessage:'새 메시지',send:'보내기',noMessages:'메시지 없음',dataPrivacy:'데이터 개인정보',runCheck:'개입 확인 실행',absentToday:'오늘 결석',alertsToday:'오늘 알림',teachers:'교사',tapReply:'↩ 답장하려면 탭하세요',interventionRunning:'개입 엔진 실행 중…',behaviorSaved:'행동 메모 저장됨',selectStudentNote:'학생을 선택하고 메모를 작성하세요',noRecipient:'수신자 없음 — 먼저 교사 이름을 탭하세요.',interventionComplete:'개입 확인 완료',newAlerts:'새 알림 생성됨',alreadySubmitted:'✓ 오늘 제출됨',messageParent:'학부모에게 메시지',sendReply:'답장 보내기',attendanceSaved:'출석 제출됨 ✓' },
  pt:{ signin:'Entrar',email:'E-mail',password:'Senha',home:'Início',messages:'Mensagens',privacy:'Privacidade',attendance:'Frequência',behavior:'Comportamento',overview:'Visão geral',students:'Alunos',present:'Presente',absent:'Ausente',tardy:'Atrasado',excused:'Justificado',recentGrades:'Notas recentes',upcomingDue:'Próximas entregas',behaviorNotes:'Notas de comportamento',actionRequired:'Ação necessária',missing:'FALTANDO',takeAttendance:'Registrar frequência',submitAttendance:'Enviar frequência',logBehavior:'Registrar comportamento',section:'Turma',student:'Aluno',note:'Nota',saveNote:'Salvar',positive:'⭐ Positivo',neutral:'📝 Neutro',concern:'⚠️ Preocupação',newMessage:'Nova mensagem',send:'Enviar',noMessages:'Nenhuma mensagem ainda',dataPrivacy:'Privacidade de dados',runCheck:'Executar verificação',absentToday:'Ausentes hoje',alertsToday:'Alertas hoje',teachers:'Professores',tapReply:'↩ Toque para responder',interventionRunning:'Motor de intervenção executando…',behaviorSaved:'Nota salva',selectStudentNote:'Selecione um aluno e escreva uma nota',noRecipient:'Sem destinatário — toque no nome de um professor primeiro.',interventionComplete:'Verificação concluída',newAlerts:'novos alertas gerados',alreadySubmitted:'✓ Enviado hoje',messageParent:'Mensagem ao responsável',sendReply:'Enviar resposta',attendanceSaved:'Frequência enviada ✓' },
};
function t(key) { return (TR[S.lang] || TR.en)[key] || TR.en[key] || key; }
function setLang(l) { S.lang = l; localStorage.setItem('sb_lang', l); document.documentElement.dir = l==='ar'?'rtl':'ltr'; render(); }

// ── Toast ─────────────────────────────────────────────────────────────────────
function showToast(msg, type='success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;width:calc(100% - 32px);max-width:400px';
    document.body.appendChild(container);
  }
  const colors = { success:'background:#16a34a;color:#fff', error:'background:#dc2626;color:#fff', info:'background:#2563eb;color:#fff' };
  const el = document.createElement('div');
  el.style.cssText = `${colors[type]||colors.info};padding:12px 16px;border-radius:12px;font-size:14px;font-weight:500;box-shadow:0 4px 12px rgba(0,0,0,.2);pointer-events:auto;text-align:center`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

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
const fmt = d => d ? new Date(d).toLocaleDateString(S.lang||'en',{month:'short',day:'numeric'}) : '—';
const fmtFull = d => d ? new Date(d).toLocaleDateString(S.lang||'en',{month:'short',day:'numeric',year:'numeric'}) : '—';
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

// ── Bus progress bar ──────────────────────────────────────────────────────────
function renderBusCard(bus, studentTransportStatus) {
  const steps = [
    { key:'home',       label:'Home',       icon:'🏠' },
    { key:'on_bus',     label:'On Bus',     icon:'🚌' },
    { key:'at_school',  label:'At School',  icon:'🏫' },
  ];
  const status = studentTransportStatus || (bus?.scan_type === 'board' ? 'on_bus' : bus?.scan_type === 'alight' ? 'at_school' : 'unknown');
  const activeIdx = steps.findIndex(s => s.key === status);

  if (status === 'unknown' || activeIdx === -1) return '';

  const stepsHtml = steps.map((s, i) => {
    const done    = i < activeIdx;
    const active  = i === activeIdx;
    const dotCls  = active ? 'bg-blue-600 ring-4 ring-blue-100' : done ? 'bg-emerald-500' : 'bg-slate-200';
    const lblCls  = active ? 'text-blue-700 font-bold' : done ? 'text-emerald-600 font-medium' : 'text-slate-400';
    return `
    <div class="flex flex-col items-center flex-1">
      <div class="w-7 h-7 rounded-full flex items-center justify-center text-sm ${dotCls} transition-all">
        ${done ? '✓' : s.icon}
      </div>
      <span class="text-xs mt-1 ${lblCls}">${s.label}</span>
    </div>`;
  }).join('');

  const lineHtml = steps.slice(0, -1).map((_, i) => {
    const filled = i < activeIdx;
    return `<div class="flex-1 h-1 rounded-full mx-1 ${filled ? 'bg-emerald-400' : 'bg-slate-200'} self-center" style="margin-top:-14px"></div>`;
  }).join('');

  const timeStr = bus?.scanned_at ? new Date(bus.scanned_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : '';

  return `
  <div class="bg-white rounded-2xl shadow-sm border border-slate-100 mb-3 overflow-hidden">
    <div class="px-4 py-3 border-b border-slate-50 flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">🚌 Bus Status</span>
      ${timeStr ? `<span class="text-xs text-slate-400">Updated ${timeStr}</span>` : ''}
    </div>
    <div class="px-4 py-4">
      <div class="flex items-start relative">
        ${stepsHtml}
      </div>
      <div class="flex px-3.5 -mt-3">
        ${lineHtml}
      </div>
      ${bus?.route_name ? `<p class="text-xs text-slate-400 text-center mt-3">Route: ${esc(bus.route_name)}</p>` : ''}
    </div>
  </div>`;
}

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
  try {
    if (!S.user) { root.innerHTML = renderLogin(); return; }
    root.innerHTML = renderShell();
  } catch (e) {
    console.error('Render error:', e);
    root.innerHTML = `<div style="padding:32px;text-align:center;font-family:sans-serif">
      <p style="font-size:32px;margin-bottom:8px">⚠️</p>
      <p style="font-weight:600;margin-bottom:4px">Something went wrong</p>
      <p style="color:#64748b;font-size:14px;margin-bottom:16px">${e.message}</p>
      <button onclick="location.reload()" style="background:#2563eb;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px">Reload</button>
    </div>`;
  }
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
            <label class="block text-sm font-medium text-slate-700 mb-1">${t('email')}</label>
            <input id="login-email" type="email" required placeholder="you@school.edu"
              class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
          </div>
          <div class="mb-6">
            <label class="block text-sm font-medium text-slate-700 mb-1">${t('password')}</label>
            <input id="login-password" type="password" required placeholder="••••••••"
              class="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"/>
          </div>
          <button type="submit" id="login-btn" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm transition-colors">
            ${t('signin')}
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

        <!-- Language picker -->
        <div class="mt-5 pt-4 border-t border-slate-100">
          <p class="text-xs text-slate-400 text-center mb-2">Language / Idioma / 语言</p>
          <div class="flex flex-wrap justify-center gap-1.5">
            ${Object.entries(LANGS).map(([k,v]) => `<button onclick="setLang('${k}')" class="text-xs px-2.5 py-1 rounded-full border transition-colors ${S.lang===k?'bg-blue-600 text-white border-blue-600':'bg-slate-50 text-slate-500 border-slate-200 hover:border-blue-300 hover:text-blue-600'}">${v}</button>`).join('')}
          </div>
        </div>

      </div>

      <p class="text-center text-blue-300 text-xs mt-4">Lincoln Middle School · Syracuse City SD · Demo</p>
    </div>
  </div>`;
}

async function doLogin(e) {
  e.preventDefault();
  const err = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');
  try {
    err.classList.add('hidden');
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
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
    if (btn) { btn.disabled = false; btn.textContent = t('signin'); }
  }
}

function quickLogin(email, pw) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = pw;
  document.querySelector('form').dispatchEvent(new Event('submit', {cancelable:true,bubbles:true}));
}

// ── Shell ─────────────────────────────────────────────────────────────────────
function renderShell() {
  const unreadMsgs = (S.messages||[]).filter(m => !m.read_at && m.to_id === S.user?.id).length;
  const msgIcon = 'M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z';
  const navItems = {
    parent: [
      { page:'feed',     label:t('home'),     icon:'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
      { page:'messages', label:t('messages'), icon:msgIcon, badge:unreadMsgs },
      { page:'privacy',  label:t('privacy'),  icon:'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
    ],
    teacher: [
      { page:'attendance', label:t('attendance'), icon:'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
      { page:'behavior',   label:t('behavior'),   icon:'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
      { page:'messages',   label:t('messages'),   icon:msgIcon, badge:unreadMsgs },
    ],
    admin: [
      { page:'admin',          label:t('overview'), icon:'M4 5a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm10 0a1 1 0 011-1h4a1 1 0 011 1v3a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm10-1a1 1 0 011-1h4a1 1 0 011 1v5a1 1 0 01-1 1h-4a1 1 0 01-1-1v-5z' },
      { page:'admin-students', label:t('students'), icon:'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
      { page:'messages',       label:t('messages'), icon:msgIcon, badge:unreadMsgs },
    ],
  };

  const items = navItems[S.user.role] || [];
  const navHtml = items.map(n => `
    <button onclick="nav('${n.page}')" class="relative flex flex-col items-center gap-1 flex-1 py-2 ${S.page===n.page||S.page.startsWith(n.page+'-')?'text-blue-600':'text-slate-400 hover:text-slate-600'} transition-colors">
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="${n.icon}"/></svg>
      ${n.badge ? `<span class="absolute top-1 right-1/4 w-4 h-4 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center" style="font-size:10px">${n.badge}</span>` : ''}
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
      <div class="flex items-center gap-2">
        <span class="text-xs text-slate-400">${esc(S.user.name)}</span>
        <button onclick="doLogout()" class="text-xs text-slate-400 hover:text-red-500 transition-colors px-2 py-1 rounded">Sign out</button>
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
    const { student, alerts, attendance, grades, upcoming, behavior, shadow, bus } = child;
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

      ${renderBusCard(bus, student.transport_status)}

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
              const canJustify = a.status === 'absent' && !a.justification;
              return `<div class="flex flex-col items-center gap-1 flex-1 min-w-[36px]">
                <span class="text-xs text-slate-400">${day}</span>
                <span title="${dt}" class="w-full text-center text-xs font-bold py-1.5 rounded-lg ${attColor(a.status)} capitalize${canJustify ? ' cursor-pointer ring-1 ring-red-300' : ''}"
                  ${canJustify ? `onclick="openJustify(${a.id},'${esc(student.name)}','${dt}')"` : ''}
                >${a.justification ? '✓' : a.status[0].toUpperCase()}</span>
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

// ── Absence Justification modal ───────────────────────────────────────────────
function openJustify(attendanceId, studentName, dateStr) {
  const existing = document.getElementById('justify-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'justify-modal';
  modal.style.cssText = 'position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,0.5);display:flex;align-items:flex-end;justify-content:center;padding:0';
  modal.innerHTML = `
    <div class="bg-white rounded-t-2xl w-full max-w-lg p-6" style="animation:slideUp .2s ease">
      <div class="flex items-center justify-between mb-4">
        <div>
          <p class="font-bold text-slate-800">Submit Excuse</p>
          <p class="text-xs text-slate-400">${esc(studentName)} · Absent ${esc(dateStr)}</p>
        </div>
        <button onclick="document.getElementById('justify-modal').remove()" class="text-slate-400 hover:text-slate-600">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <textarea id="justify-text" rows="4" placeholder="${t('writeReason')}"
        class="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-4"></textarea>
      <button onclick="submitJustification(${attendanceId})"
        class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
        ${t('justifyAbsence')}
      </button>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  setTimeout(() => document.getElementById('justify-text')?.focus(), 100);
}

async function submitJustification(attendanceId) {
  const text = document.getElementById('justify-text')?.value?.trim();
  if (!text || text.length < 5) { showToast('Please provide a reason (min 5 characters)', 'error'); return; }
  try {
    await POST(`/api/attendance/${attendanceId}/justify`, { justification: text });
    document.getElementById('justify-modal')?.remove();
    showToast(t('justificationSent'), 'success');
    S.feed = null; S._feedLoaded = false; render();
  } catch (e) { showToast(e.message, 'error'); }
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
      ${S.messages.length ? S.messages.map(m => {
        const isMine = m.from_id === S.user?.id;
        const isUnread = !m.read_at && m.to_id === S.user?.id;
        return `
      <div ${isMine ? '' : `onclick="openMessage(${m.id}, ${m.from_id}, '${esc(m.from_name)}', ${m.student_id||'null'}, '${esc(m.student_name||'')}', ${isUnread})"`}
        class="px-4 py-4 border-b border-slate-50 last:border-0 ${isMine ? 'bg-blue-50' : `cursor-pointer hover:bg-slate-50 transition-colors ${isUnread ? 'bg-sky-50 border-l-4 border-l-blue-400' : ''}`}">
        <div class="flex items-center justify-between mb-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold ${isMine ? 'text-blue-700' : 'text-slate-800'}">${isMine ? 'You → ' + esc(m.to_name||'') : esc(m.from_name)}</span>
            ${!isMine && m.from_role ? `<span class="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded capitalize">${m.from_role}</span>` : ''}
            ${isUnread ? '<span class="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>' : ''}
          </div>
          <span class="text-xs text-slate-400">${fmt(m.created_at)}</span>
        </div>
        ${m.student_name ? `<p class="text-xs text-blue-600 font-medium mb-1">Re: ${esc(m.student_name)}</p>` : ''}
        <p class="text-sm text-slate-600 leading-relaxed">${esc(m.content)}</p>
        ${isMine ? '<p class="text-xs text-slate-400 mt-1.5">✓ Sent</p>' : `<p class="text-xs text-blue-500 mt-1.5 font-medium">${t('tapReply')}</p>`}
      </div>`;
      }).join('') : `<div class="px-4 py-10 text-center text-sm text-slate-400">${t('noMessages')}</div>`}
    </div>
    <div class="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
      <p class="text-sm font-semibold text-slate-700 mb-3">New Message</p>
      ${S.params?.prefill ? `<p class="text-xs text-blue-600 font-medium mb-2">To: ${esc(S.params.prefill.to_name)} · Re: ${esc(S.params.prefill.student_name)}</p>` : ''}
      <textarea id="msg-content" rows="3" placeholder="Type your message..."
        class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none mb-3"></textarea>
      <button id="send-msg-btn" onclick="sendMessage()" class="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
        ${t('send')}
      </button>
    </div>
  </div>`;
}

async function sendMessage() {
  const content = document.getElementById('msg-content')?.value?.trim();
  if (!content) return;
  const prefill = S.params?.prefill;
  const to_id = prefill?.to_id || (S.user?.role === 'parent' ? null : 1);
  if (!to_id) { showToast(t('noRecipient'), 'error'); return; }
  const btn = document.getElementById('send-msg-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await POST('/api/messages', { to_id, student_id: prefill?.student_id || null, content });
    document.getElementById('msg-content').value = '';
    S.messages = null;
    S._msgsLoaded = false;
    showToast(t('send') + ' ✓', 'success');
    render();
  } catch (e) { showToast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = t('send'); } }
}

async function openMessage(id, fromId, fromName, studentId, studentName, isUnread) {
  if (isUnread) {
    await PUT(`/api/messages/${id}/read`, {}).catch(e => console.error('Mark read error:', e));
    const msg = S.messages?.find(m => m.id === id);
    if (msg) msg.read_at = new Date().toISOString();
  }
  S.params = { ...S.params, prefill: { to_id: fromId, to_name: fromName, student_id: studentId || null, student_name: studentName || '' } };
  render();
  setTimeout(() => document.getElementById('msg-content')?.focus(), 50);
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
  const current = S.user?.consent_tier || 3;
  if (tier < current) {
    const purgeMsg = tier < 2 ? 'This will permanently delete all behavior notes from your feed.' : 'This will permanently delete shadow app data (Remind, ClassDojo) from your feed.';
    if (!confirm(`${purgeMsg}\n\nContinue?`)) return;
  }
  try {
    await PUT('/api/consent', { tier });
    S.user.consent_tier = tier;
    S.feed = null; S._feedLoaded = false;
    showToast('Privacy settings updated', 'success');
    render();
  } catch (e) { showToast(e.message, 'error'); }
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
    <h2 class="text-lg font-bold mb-1">${t('takeAttendance')}</h2>
    <p class="text-sm text-slate-400 mb-5">${new Date().toLocaleDateString(S.lang||'en',{weekday:'long',month:'long',day:'numeric'})}</p>
    <div class="space-y-3">
      ${S.sections.map(sec => `
      <button onclick="loadAttendanceSheet(${sec.id},'${esc(sec.name)}')"
        class="w-full bg-white rounded-2xl p-4 border ${sec.submitted_today?'border-emerald-200 bg-emerald-50':'border-slate-100'} shadow-sm text-left hover:border-blue-200 hover:shadow-md transition-all">
        <div class="flex items-center justify-between">
          <div>
            <p class="font-semibold text-slate-800">${esc(sec.name)}</p>
            <p class="text-sm text-slate-400">${sec.student_count} students enrolled</p>
            ${sec.submitted_today ? `<p class="text-xs text-emerald-600 font-semibold mt-0.5">${t('alreadySubmitted')}</p>` : ''}
          </div>
          <svg class="w-5 h-5 ${sec.submitted_today?'text-emerald-400':'text-slate-300'}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${sec.submitted_today?'M5 13l4 4L19 7':'M9 5l7 7-7 7'}"/></svg>
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
    <button id="att-submit-btn" onclick="submitAttendance(${sectionId})"
      class="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors shadow-md">
      ${t('submitAttendance')} · ${students.length} students
    </button>
  </div>`;
}

function setAttendance(stuId, status) {
  S.params.records[stuId] = status;
  render();
}

async function submitAttendance(sectionId) {
  const btn = document.getElementById('att-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const today = new Date().toISOString().split('T')[0];
  const records = Object.entries(S.params.records).map(([student_id, status]) => ({
    student_id: parseInt(student_id), section_id: sectionId, date: today, status
  }));
  try {
    await POST('/api/teacher/attendance', { records });
    S.params = {};
    S.sections = null; S._sectionsLoaded = false;
    showToast(t('attendanceSaved'), 'success');
    render();
  } catch (e) { showToast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = t('submitAttendance'); } }
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
        <label class="block text-sm font-medium text-slate-700 mb-1">${t('student')}</label>
        <select id="beh-student" onchange="loadBehHistory(this.value)" class="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
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
      <button id="beh-submit-btn" onclick="submitBehavior()" class="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm transition-colors">
        ${t('saveNote')}
      </button>
      <div id="beh-history" class="mt-4 space-y-2 hidden">
        <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent Notes for This Student</p>
      </div>
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

async function loadBehHistory(stuId) {
  const hist = document.getElementById('beh-history');
  if (!hist || !stuId) return;
  try {
    const data = await GET(`/api/teacher/behavior-history/${stuId}`);
    if (!data.length) { hist.classList.add('hidden'); return; }
    hist.classList.remove('hidden');
    hist.innerHTML = `<p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Recent Notes</p>` +
      data.slice(0,3).map(b => `<div class="flex items-start gap-2 bg-slate-50 rounded-lg p-2.5">
        <span class="text-base flex-shrink-0">${b.type==='positive'?'⭐':b.type==='concern'?'⚠️':'📝'}</span>
        <div><p class="text-xs text-slate-700">${esc(b.note)}</p><p class="text-xs text-slate-400 mt-0.5">${fmt(b.created_at)}</p></div>
      </div>`).join('');
  } catch (_) {}
}

async function submitBehavior() {
  const student_id = document.getElementById('beh-student')?.value;
  const section_id = document.getElementById('beh-section')?.value;
  const note = document.getElementById('beh-note')?.value?.trim();
  if (!student_id || !note) { showToast(t('selectStudentNote'), 'error'); return; }
  const btn = document.getElementById('beh-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    await POST('/api/teacher/behavior', { student_id: parseInt(student_id), section_id: parseInt(section_id), type: _behType, note });
    document.getElementById('beh-note').value = '';
    if (btn) { btn.disabled = false; btn.textContent = t('saveNote'); }
    showToast(t('behaviorSaved') + ' · ' + t('interventionRunning'), 'success');
    loadBehHistory(student_id);
  } catch (e) { showToast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = t('saveNote'); } }
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
  const btn = document.querySelector('[onclick="runSync()"]');
  if (btn) { btn.disabled = true; btn.textContent = t('interventionRunning'); }
  try {
    const r = await POST('/api/admin/sync');
    S.adminData = null; S._adminLoaded = false;
    S.adminStudents = null; S._stuListLoaded = false;
    showToast(`${t('interventionComplete')} · ${r.alerts_created} ${t('newAlerts')}`, 'success');
    render();
  } catch (e) { showToast(e.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = '⚡ ' + t('runCheck'); } }
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

  const { student, attendance, grades, behavior, alerts, parents, stats } = data;
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

    ${(parents||[]).map(p => `
    <button onclick="nav('messages',{prefill:{to_id:${p.id},to_name:'${esc(p.name)}',student_id:${student.id},student_name:'${esc(student.name)}'}})"
      class="w-full mb-4 py-3 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
      💬 ${t('messageParent')}: ${esc(p.name)}
    </button>`).join('')}

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

// ── Offline banner ────────────────────────────────────────────────────────────
function initOfflineBanner() {
  const banner = document.createElement('div');
  banner.id = 'offline-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#92400e;color:#fff;text-align:center;padding:8px 16px;font-size:13px;font-weight:500;display:none';
  banner.textContent = '📶 You\'re offline — showing cached data. Changes will sync when reconnected.';
  document.body.prepend(banner);

  window.addEventListener('online',  () => { banner.style.display = 'none';  S.offline = false; });
  window.addEventListener('offline', () => { banner.style.display = 'block'; S.offline = true;  });
  if (!navigator.onLine) { banner.style.display = 'block'; S.offline = true; }
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
initOfflineBanner();
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

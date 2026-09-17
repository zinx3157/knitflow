'use strict';
/* ============ KnitFlow OS — frontend SPA ============ */

const STAGES = ['Order Confirmed','Material Sourcing','Ready for Dyeing','Dyeing','Fabric Ready','Production','Packing','Shipped','Delivered'];
const STAGE_COLORS = { 'Order Confirmed':'#64748b','Material Sourcing':'#f59e0b','Ready for Dyeing':'#06b6d4','Dyeing':'#8b5cf6','Fabric Ready':'#14b8a6','Production':'#3b82f6','Packing':'#f97316','Shipped':'#6366f1','Delivered':'#10b981' };
const STAGE_PILL = { 'Order Confirmed':'p-slate','Material Sourcing':'p-amber','Ready for Dyeing':'p-cyan','Dyeing':'p-purple','Fabric Ready':'p-teal','Production':'p-blue','Packing':'p-orange','Shipped':'p-indigo','Delivered':'p-green' };
const REQ_PILL = { 'Pending Approval':'p-amber','Approved':'p-blue','Ordered':'p-purple','Received':'p-green','Rejected':'p-red' };
const PO_PILL = { 'Draft':'p-slate','Sent':'p-blue','Partial':'p-amber','Received':'p-green' };
const BATCH_PILL = { 'Queued':'p-slate','Dyeing':'p-purple','Drying':'p-cyan','QC':'p-amber','Passed':'p-green','Rework':'p-red' };
const SHIP_PILL = { 'Packing':'p-orange','Booked':'p-blue','In Transit':'p-indigo','Delivered':'p-green' };
const SHIP_NEXT = { 'Packing':'Booked','Booked':'In Transit','In Transit':'Delivered' };
const SHIP_MODES = { Sea: { color: '#0ea5e9', icon: 'ship', tag: 'SEA' }, Air: { color: '#8b5cf6', icon: 'airplane', tag: 'AIR' }, Courier: { color: '#f59e0b', icon: 'package', tag: 'COURIER' } };
const MODE_PILL = { Sea: 'p-sky', Air: 'p-purple', Courier: 'p-amber' };
const BATCH_NEXT = { 'Queued':'Dyeing','Dyeing':'Drying','Drying':'QC' };
const DEPT_COLORS = { 'Merchandising':'#6366f1','Purchase':'#f59e0b','Dye House':'#8b5cf6','Shipping':'#0ea5e9','Management':'#10b981','Production':'#ea580c','Quality Control':'#0d9488','Human Resources':'#db2777','Finance':'#16a34a' };
const DEPT_PERMS = { admin: ['orders','buyers','samples','reqs','pos','suppliers','materials','batches','shipments','production','machines','inspections','hr','finance'], merchandising: ['orders','buyers','samples'], purchase: ['reqs','pos','suppliers','materials'], dye: ['batches'], production: ['production','machines'], qc: ['inspections'], shipping: ['shipments'], hr: ['hr'], finance: ['finance'] };
const SAMPLE_PILL = { 'Requested':'p-slate','Sent':'p-blue','Approved':'p-green','Rejected':'p-red','Comments':'p-amber' };
const INSP_PILL = { 'Pending':'p-amber','Pass':'p-green','Fail':'p-red' };
const MACH_PILL = { 'Running':'p-green','Idle':'p-slate','Maintenance':'p-red','Dyeing':'p-purple','Drying':'p-cyan' };
const MACHINES = ['D-01','D-02','D-03','D-04','D-05','D-06'];
const PORTS = ['Hamburg (DEHAM)','Felixstowe (GBFXT)','New York (USNYC)','Le Havre (FRLEH)','Rotterdam (NLRTM)','Copenhagen (DKCPH)'];

const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) {} },
  del(k) { try { window.localStorage.removeItem(k); } catch (e) {} }
};

const state = { user: null, token: null, view: 'dashboard', arg: null, purchaseTab: 'reqs', orderSearch: '', orderStage: 'All', dyeFilter: 'All', activityDept: 'All', invCat: 'All', popOpen: false };

const $ = s => document.querySelector(s);
const root = $('#root');
const modalRoot = $('#modal-root');
const toastRoot = $('#toast-root');

/* ---------------- utilities ---------------- */

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
function money(n, dec) { return '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: dec == null ? 0 : dec, minimumFractionDigits: dec || 0 }); }
function num(n) { return (Number(n) || 0).toLocaleString('en-US'); }
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtDT(d) { if (!d) return '—'; const dt = new Date(d); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ', ' + dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); }
function daysUntil(d) { if (!d) return null; return Math.ceil((new Date(d) - new Date()) / 864e5); }
function dueBadge(d) {
  const n = daysUntil(d);
  if (n == null) return '';
  if (n < 0) return '<span class="due late">' + Math.abs(n) + 'd overdue</span>';
  if (n <= 30) return '<span class="due warn">' + n + 'd left</span>';
  return '<span class="due ok">' + n + 'd left</span>';
}
function initials(name) { return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
function can(perm) { return state.user && (state.user.role === 'admin' || (DEPT_PERMS[state.user.role] || []).includes(perm)); }
function pill(map, status) { return '<span class="pill ' + (map[status] || 'p-slate') + '">' + esc(status) + '</span>'; }

async function api(path, opts = {}) {
  const headers = {};
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch('/api' + path, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });
  let data = {};
  try { data = await res.json(); } catch (e) {}
  if (res.status === 401) { logoutLocal(); throw new Error(data.error || 'Session expired'); }
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

function toast(msg, type) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'success');
  el.innerHTML = (type === 'error' ? ICONS.alert : ICONS.check) + '<span>' + esc(msg) + '</span>';
  toastRoot.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 320); }, 3400);
}

function openModal({ title, body, wide, onSubmit, submitText }) {
  modalRoot.innerHTML =
    '<div class="modal-back" id="mback"><div class="modal ' + (wide ? 'wide' : '') + '">' +
    '<div class="modal-head"><h3>' + title + '</h3><button class="icon-btn" type="button" data-close>' + ICONS.x + '</button></div>' +
    '<form id="mform"><div class="modal-body">' + body + '</div>' +
    '<div class="modal-foot"><button type="button" class="btn" data-close>Cancel</button>' +
    (onSubmit ? '<button type="submit" class="btn primary">' + (submitText || 'Save') + '</button>' : '') +
    '</div></form></div></div>';
  $('#mback').addEventListener('mousedown', e => { if (e.target.id === 'mback') closeModal(); });
  modalRoot.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
  if (onSubmit) {
    $('#mform').addEventListener('submit', async e => {
      e.preventDefault();
      const btn = $('#mform').querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Working…';
      try { await onSubmit(new FormData($('#mform'))); closeModal(); }
      catch (err) { toast(err.message, 'error'); btn.disabled = false; btn.textContent = submitText || 'Save'; }
    });
  }
  const first = modalRoot.querySelector('input,select,textarea');
  if (first) first.focus();
}
function closeModal() { modalRoot.innerHTML = ''; }

/* ---------------- icons ---------------- */

const ICONS = {
  logo: '<svg width="30" height="30" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#4F46E5"/><path d="M8 10l8 8 8-8M8 17l8 8 8-8" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dashboard: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>',
  orders: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h6"/></svg>',
  purchase: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.6 11.5a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/></svg>',
  dye: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.5"/></svg>',
  shipping: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V9l4-3 4 3v8"/><path d="M11 17v-6l4-3 4 3v6"/><path d="M2 20h20"/></svg>',
  inventory: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.5v9L12 22l-9-4.5v-9L12 4l9 4.5z"/><path d="M3.3 8.6L12 13l8.7-4.4"/><path d="M12 13v9"/></svg>',
  directory: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 15.2c2.3.2 4 1.6 4.5 4.3"/></svg>',
  activity: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2.5-6 4 12 2.5-6h5"/></svg>',
  bell: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 9a6 6 0 1 0-12 0c0 6-2.5 7-2.5 7h17S18 15 18 9z"/><path d="M10.3 20a2 2 0 0 0 3.4 0"/></svg>',
  logout: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
  plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  x: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  alert: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>',
  doc: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6"/></svg>',
  arrow: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  print: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/></svg>',
  airplane: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>',
  package: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.5v9L12 22l-9-4.5v-9L12 4l9 4.5z"/><path d="M3.3 8.6L12 13l8.7-4.4"/><path d="M12 13v9"/></svg>',
  barcode: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6v12M8 6v12M11 6v12M14 6v12M18 6v12M21 6v12"/></svg>',
  flame: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/></svg>',
  cart: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.6"/><circle cx="17" cy="20" r="1.6"/><path d="M3 4h2l2.6 11.5a1.5 1.5 0 0 0 1.5 1.2h7.6a1.5 1.5 0 0 0 1.5-1.2L20 8H6"/></svg>',
  ship: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17V9l4-3 4 3v8M11 17v-6l4-3 4 3v6M2 20h20"/></svg>',
  users: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 15.2c2.3.2 4 1.6 4.5 4.3"/></svg>',
  menu: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>'
};

/* ---------------- auth ---------------- */

function logoutLocal() { store.del('kf_token'); state.token = null; state.user = null; render(); }
async function doLogout() { try { await api('/logout', { method: 'POST' }); } catch (e) {} logoutLocal(); }

async function quickLogin(email) {
  $('#login-email').value = email; $('#login-pass').value = 'knit123';
  $('#login-form').dispatchEvent(new Event('submit', { cancelable: true }));
}

function renderLogin(err) {
  const roles = [
    { email: 'admin@knitflow.io', n: 'Amina R.', r: 'Management', c: '#10b981' },
    { email: 'merch@knitflow.io', n: 'Hery A.', r: 'Merchandising', c: '#6366f1' },
    { email: 'purchase@knitflow.io', n: 'Niry R.', r: 'Purchase', c: '#f59e0b' },
    { email: 'dye@knitflow.io', n: 'Tiana R.', r: 'Dye House', c: '#8b5cf6' },
    { email: 'production@knitflow.io', n: 'Faniry R.', r: 'Production', c: '#ea580c' },
    { email: 'qc@knitflow.io', n: 'Voahangy R.', r: 'Quality Control', c: '#0d9488' },
    { email: 'shipping@knitflow.io', n: 'Tojo V.', r: 'Shipping', c: '#0ea5e9' },
    { email: 'finance@knitflow.io', n: 'Rivo R.', r: 'Finance', c: '#16a34a' },
    { email: 'hr@knitflow.io', n: 'Mialy R.', r: 'Human Resources', c: '#db2777' }
  ];
  root.innerHTML =
  '<div class="auth">' +
    '<div class="auth-left">' +
      '<div class="auth-logo">' + ICONS.logo + ' KnitFlow <span style="font-weight:500;color:#a5b4fc">OS</span></div>' +
      '<div class="auth-hero">' +
        '<h1>Every department.<br><em>One roof. One flow.</em></h1>' +
        '<p>The unified operating system for your knitwear company — merchandising, purchase, dye house and shipping working from a single live thread, from buyer PO to POD.</p>' +
        '<div class="auth-feats">' +
          '<div class="feat"><div class="fi" style="color:#a5b4fc">' + ICONS.orders + '</div><div><b>Merchandising</b><span>Orders, buyers &amp; styles — requisitions raised automatically</span></div></div>' +
          '<div class="feat"><div class="fi" style="color:#fbbf24">' + ICONS.purchase + '</div><div><b>Purchase</b><span>Approve demands, place &amp; receive POs into the store</span></div></div>' +
          '<div class="feat"><div class="fi" style="color:#c4b5fd">' + ICONS.dye + '</div><div><b>Dye House</b><span>Batch board, recipes, machine load &amp; QC — shades auto-tracked</span></div></div>' +
          '<div class="feat"><div class="fi" style="color:#7dd3fc">' + ICONS.shipping + '</div><div><b>Shipping</b><span>Bookings, packing lists &amp; commercial invoices in one click</span></div></div>' +
          '<div class="feat"><div class="fi" style="color:#fdba74">' + ICONS.production + '</div><div><b>Production &amp; Quality</b><span>Knitting, cutting, sewing, finishing — AQL gates every shipment</span></div></div>' +
          '<div class="feat"><div class="fi" style="color:#6ee7b7">' + ICONS.finance + '</div><div><b>Finance &amp; HR</b><span>Costing &amp; margins, invoices, receivables, payroll &amp; attendance</span></div></div>' +
        '</div>' +
      '</div>' +
      '<div style="font-size:12px;color:#818cf8">Analamanga Knitwear Co. · Antananarivo · © 2026 KnitFlow OS</div>' +
    '</div>' +
    '<div class="auth-right"><div class="auth-card">' +
      '<h2>Sign in</h2><div class="sub">One workspace for the whole company.</div>' +
      '<button class="btn primary" id="open-demo" style="width:100%;justify-content:center;padding:13px;font-size:15px;margin-bottom:14px">Open company workspace &rarr;</button>' +
      '<form class="auth-form" id="login-form">' +
        (err ? '<div class="auth-error">' + esc(err) + '</div>' : '') +
        '<div class="field"><label>Email</label><input id="login-email" type="email" placeholder="you@knitflow.io" autocomplete="username" required></div>' +
        '<div class="field"><label>Password</label><input id="login-pass" type="password" placeholder="••••••••" autocomplete="current-password" required></div>' +
        '<button class="btn primary" style="width:100%;justify-content:center;padding:11px" type="submit">Enter workspace ' + ICONS.arrow + '</button>' +
      '</form>' +
      '<div class="quick-title">One-click department logins · password: knit123</div>' +
      '<div class="quick-grid">' +
        roles.map(r => '<button type="button" class="quick-card" data-email="' + r.email + '"><span class="qa" style="background:' + r.c + '">' + esc(r.n.split(' ').map(w => w[0]).join('')) + '</span><span><b>' + esc(r.r) + '</b><span>' + esc(r.email) + '</span></span></button>').join('') +
      '</div>' +
      '<div class="auth-foot">Demo environment — all changes persist in the workspace database.</div>' +
    '</div></div>' +
  '</div>';
  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    try {
      const r = await api('/login', { method: 'POST', body: { email: $('#login-email').value, password: $('#login-pass').value } });
      state.token = r.token; state.user = r.user;
      store.set('kf_token', r.token);
      try {
        location.hash = '#/dashboard';
        render();
        toast('Welcome back, ' + r.user.name.split(' ')[0] + ' — ' + r.user.dept + ' console ready');
      } catch (e3) { toast('Signed in, but display hit a snag: ' + e3.message, 'error'); console.error(e3); }
    } catch (e2) { renderLogin(e2.message); }
  });
  document.querySelectorAll('.quick-card').forEach(c => c.addEventListener('click', () => quickLogin(c.dataset.email)));
  const od = $('#open-demo');
  if (od) od.addEventListener('click', () => quickLogin('admin@knitflow.io'));
}

/* ---------------- shell ---------------- */

const NAV = [
  { label: 'Overview' },
  { id: 'dashboard', icon: 'dashboard', text: 'Factory Dashboard' },
  { id: 'activity', icon: 'activity', text: 'Activity Thread' },
  { label: 'Commercial' },
  { id: 'orders', icon: 'orders', text: 'Merchandising' },
  { id: 'sampling', icon: 'sampling', text: 'Sampling & Development' },
  { id: 'purchase', icon: 'purchase', text: 'Purchase' },
  { label: 'The Mill' },
  { id: 'inventory', icon: 'inventory', text: 'Yarn & Trims Store' },
  { id: 'dye', icon: 'dye', text: 'Dye House' },
  { label: 'The Factory' },
  { id: 'machineboard', icon: 'production', text: 'Machine Board' },
  { id: 'production', icon: 'production', text: 'Production Floors' },
  { id: 'scan', icon: 'barcode', text: 'Floor Scanning' },
  { id: 'quality', icon: 'quality', text: 'Quality Control' },
  { label: 'Dispatch' },
  { id: 'shipping', icon: 'shipping', text: 'Shipping' },
  { label: 'Company' },
  { id: 'finance', icon: 'finance', text: 'Finance & Costing' },
  { id: 'hr', icon: 'hr', text: 'HR & Payroll' },
  { id: 'reports', icon: 'reports', text: 'Reports Center' },
  { id: 'directory', icon: 'directory', text: 'Company Hub' },
  { id: 'settings', icon: 'settings', text: 'Settings' }
];

function renderShell() {
  const DOCK = [
    { key: 'home', label: 'Home', icon: 'dashboard', direct: 'dashboard', views: 'dashboard,activity', items: [
      { id: 'dashboard', icon: 'dashboard', text: 'Factory Dashboard' },
      { id: 'activity', icon: 'activity', text: 'Activity Thread' } ] },
    { key: 'commercial', label: 'Commercial', icon: 'orders', views: 'orders,sampling,purchase', items: [
      { id: 'orders', icon: 'orders', text: 'Merchandising' },
      { id: 'sampling', icon: 'sampling', text: 'Sampling & Development' },
      { id: 'purchase', icon: 'purchase', text: 'Purchase' } ] },
    { key: 'mill', label: 'The Mill', icon: 'inventory', views: 'inventory,dye', items: [
      { id: 'inventory', icon: 'inventory', text: 'Yarn & Trims Store' },
      { id: 'dye', icon: 'dye', text: 'Dye House' } ] },
    { key: 'factory', label: 'Factory', icon: 'production', views: 'machineboard,production,scan,quality', items: [
      { id: 'machineboard', icon: 'production', text: 'Machine Board' },
      { id: 'production', icon: 'production', text: 'Production Floors' },
      { id: 'scan', icon: 'barcode', text: 'Floor Scanning' },
      { id: 'quality', icon: 'quality', text: 'Quality Control' } ] },
    { key: 'dispatch', label: 'Dispatch', icon: 'shipping', direct: 'shipping', views: 'shipping', items: [
      { id: 'shipping', icon: 'shipping', text: 'Shipping' } ] },
    { key: 'company', label: 'Company', icon: 'finance', views: 'finance,hr,reports,directory,settings', items: [
      { id: 'finance', icon: 'finance', text: 'Finance & Costing' },
      { id: 'hr', icon: 'hr', text: 'HR & Payroll' },
      { id: 'reports', icon: 'reports', text: 'Reports Center' },
      { id: 'directory', icon: 'directory', text: 'Company Hub' },
      { id: 'settings', icon: 'settings', text: 'Settings' } ] }
  ];
  window.KF_DOCK = DOCK;
  const dockBtn = g =>
    '<button class="dock-btn" data-dockgroup="' + g.key + '" data-views="' + g.views + '"' + (g.direct ? ' data-nav="' + g.direct + '"' : ' data-dockmenu="' + g.key + '"') + '>' +
    ICONS[g.icon] + '<span>' + g.label + '</span>' +
    '<span class="dock-badge" data-dockbadge="' + g.key + '" style="display:none"></span>' +
    '</button>';
  const dockMenus = DOCK.filter(g => !g.direct).map(g =>
    '<div class="dock-menu" id="dockmenu-' + g.key + '" style="display:none">' +
    '<div class="dock-menu-h">' + g.label + '</div>' +
    g.items.map(it => '<button class="nav-item" data-nav="' + it.id + '">' + ICONS[it.icon] + '<span>' + it.text + '</span><span class="nav-badge" data-badge="' + it.id + '" style="display:none"></span></button>').join('') +
    '</div>').join('');

  root.innerHTML =
  '<div class="app app-docked">' +
    '<div class="main">' +
      '<header class="topbar">' +
        '<div class="tb-logo">' + ICONS.logo + ' <span><b>KnitFlow</b> <em>OS</em></span></div>' +
        '<div class="tb-title"><h1 id="tb-title"></h1><p id="tb-sub"></p></div>' +
        '<div class="tb-actions">' +
          '<button class="icon-btn" id="bell-btn" title="Alerts">' + ICONS.bell + '<span class="dot-alert" id="bell-dot" style="display:none"></span></button>' +
          '<div class="user-chip"><span class="avatar" style="width:28px;height:28px;font-size:11px;background:' + (DEPT_COLORS[state.user.dept] || '#6366f1') + '">' + esc(initials(state.user.name)) + '</span><span><div class="uc-n">' + esc(state.user.name) + '</div><div class="uc-r">' + esc(state.user.title) + '</div></span></div>' +
          '<div class="pop" id="bell-pop" style="display:none"></div>' +
        '</div>' +
      '</header>' +
      '<div class="page" id="view"></div>' +
    '</div>' +
    '<nav class="dock" id="dock">' + DOCK.map(dockBtn).join('') + '</nav>' +
    dockMenus +
  '</div>';
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => { closeDockMenus(); location.hash = '#/' + b.dataset.nav; }));
  document.querySelectorAll('[data-dockmenu]').forEach(b => b.addEventListener('click', () => toggleDockMenu(b.dataset.dockmenu)));
  $('#bell-btn').addEventListener('click', toggleBellPop);
  document.addEventListener('mousedown', onDocClick);
  updateDockActive();
}

function updateDockActive() {
  document.querySelectorAll('.dock-btn').forEach(b => {
    const views = (b.dataset.views || '').split(',');
    b.classList.toggle('active', views.indexOf(state.view) >= 0);
  });
}
function toggleDockMenu(key) {
  const menu = $('#dockmenu-' + key);
  const wasOpen = menu && menu.style.display !== 'none';
  closeDockMenus();
  if (!wasOpen && menu) menu.style.display = 'flex';
}
function closeDockMenus() { document.querySelectorAll('.dock-menu').forEach(m => { m.style.display = 'none'; }); }

function onDocClick(e) {
  const pop = $('#bell-pop');
  if (pop && state.popOpen && !pop.contains(e.target) && !$('#bell-btn').contains(e.target)) { pop.style.display = 'none'; state.popOpen = false; }
  let inDock = false;
  if (e.target.closest && (e.target.closest('.dock') || e.target.closest('.dock-menu'))) inDock = true;
  if (!inDock) closeDockMenus();
}

async function toggleBellPop() {
  const pop = $('#bell-pop');
  if (state.popOpen) { pop.style.display = 'none'; state.popOpen = false; return; }
  const d = await api('/dashboard');
  let html = '<div class="pop-h">Company alerts</div>';
  if (!d.lowStockList.length && !d.tasks.dueSoon.length && !d.tasks.qcQueue && !d.tasks.reqsPending) html += '<div class="pop-item">All clear — nothing needs attention.</div>';
  for (const mm of d.lowStockList) html += '<div class="pop-item" data-go="inventory"><span style="color:var(--red)">' + ICONS.alert + '</span><span><b>' + esc(mm.code) + '</b> below reorder — ' + num(mm.stock) + ' / ' + num(mm.reorder) + ' ' + esc(mm.unit) + '<div class="mini">Purchase should reorder</div></span></div>';
  if (d.tasks.reqsPending) html += '<div class="pop-item" data-go="purchase"><span style="color:var(--amber)">' + ICONS.cart + '</span><span><b>' + d.tasks.reqsPending + ' requisition(s)</b> waiting for Purchase approval<div class="mini">Merchandising is waiting on you</div></span></div>';
  if (d.tasks.qcQueue) html += '<div class="pop-item" data-go="dye"><span style="color:var(--purple)">' + ICONS.flame + '</span><span><b>' + d.tasks.qcQueue + ' dye batch(es)</b> in QC queue<div class="mini">Dye House sign-off needed</div></span></div>';
  if (d.tasks.inspectionsPending) html += '<div class="pop-item" data-go="quality"><span style="color:var(--teal)">' + ICONS.quality + '</span><span><b>' + d.tasks.inspectionsPending + ' inspection(s)</b> awaiting result<div class="mini">Quality Control desk</div></span></div>';
  if (d.tasks.samplesWaiting) html += '<div class="pop-item" data-go="sampling"><span style="color:var(--indigo)">' + ICONS.sampling + '</span><span><b>' + d.tasks.samplesWaiting + ' sample(s)</b> waiting on buyers<div class="mini">Sampling desk</div></span></div>';
  for (const o of d.tasks.dueSoon.slice(0, 4)) html += '<div class="pop-item" data-go="orders"><span style="color:var(--orange)">' + ICONS.ship + '</span><span><b>' + esc(o.id) + '</b> — ' + esc(o.style) + '<div class="mini">Delivers ' + fmtDate(o.deliveryDate) + ' · ' + esc(o.stage) + '</div></span></div>';
  pop.innerHTML = html;
  pop.style.display = 'block';
  state.popOpen = true;
  pop.querySelectorAll('[data-go]').forEach(i => i.addEventListener('click', () => { location.hash = '#/' + i.dataset.go; pop.style.display = 'none'; state.popOpen = false; }));
}

function setTitle(t, s) { $('#tb-title').textContent = t; $('#tb-sub').textContent = s || ''; }

/* ---------------- router ---------------- */

async function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, arg] = h.split('/');
  state.view = name || 'dashboard';
  state.arg = arg || null;
  if (!state.user) return;
  const titles = {
    dashboard: ['Dashboard', 'The whole company, one screen — ' + new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })],
    orders: ['Merchandising', 'Orders, buyers & styles — the pipeline starts here'],
    sampling: ['Sampling & Development', 'Proto, fit, PP & TOP samples — buyer approvals tracked'],
    purchase: ['Purchase Department', 'Requisitions, purchase orders & suppliers'],
    dye: ['Dye House', 'Batch board — recipes, machines & QC'],
    machineboard: ['Machine Board', 'Live machines — output, utilization & downtime'],
    scan: ['Floor Scanning', 'Scan bundles — live WIP, piece counting & worker efficiency'],
    production: ['Production Floors', 'Knitting → cutting → sewing → finishing — WIP live'],
    quality: ['Quality Control', 'Inline & final AQL inspections — nothing ships without a pass'],
    shipping: ['Shipping Department', 'Bookings, documents & deliveries'],
    inventory: ['Yarn & Trims Store', 'Yarn, dyes, chemicals, trims & packing — live stock'],
    finance: ['Finance & Costing', 'Costing sheets, margins, invoices, receivables & expenses'],
    hr: ['HR & Payroll', 'Employees, attendance & monthly payroll'],
    reports: ['Reports Center', 'Printable management reports — every department'],
    directory: ['Company Hub', 'Departments, team, buyers, suppliers & company profile'],
    settings: ['Settings', 'Company profile, users & access'],
    activity: ['Activity Thread', 'Every department, every move — one live feed']
  };
  const t = titles[state.view] || ['KnitFlow', ''];
  setTitle(t[0], state.arg ? 'Order ' + state.arg : t[1]);
  document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === state.view));
  updateDockActive();
  const view = $('#view');
  view.innerHTML = '<div class="boot" style="height:40vh"><div class="spinner"></div></div>';
  try {
    if (state.view === 'dashboard') await viewDashboard(view);
    else if (state.view === 'orders' && state.arg) await viewOrderDetail(view, state.arg);
    else if (state.view === 'orders') await viewOrders(view);
    else if (state.view === 'purchase') await viewPurchase(view);
    else if (state.view === 'dye') await viewDye(view);
    else if (state.view === 'shipping') await viewShipping(view);
    else if (state.view === 'inventory') await viewInventory(view);
    else if (state.view === 'directory') await viewDirectory(view);
    else if (state.view === 'activity') await viewActivity(view);
    else if (state.view === 'sampling') await viewSampling(view);
    else if (state.view === 'production') await viewProduction(view);
    else if (state.view === 'machineboard') await viewMachineBoard(view);
    else if (state.view === 'scan') await viewScan(view);
    else if (state.view === 'quality') await viewQuality(view);
    else if (state.view === 'hr') await viewHR(view);
    else if (state.view === 'finance') await viewFinance(view);
    else if (state.view === 'reports') await viewReports(view);
    else if (state.view === 'settings') await viewSettings(view);
    else view.innerHTML = '<div class="card">Page not found.</div>';
  } catch (e) { view.innerHTML = '<div class="card" style="color:var(--red)">' + esc(e.message) + '</div>'; }
  refreshBadges();
}

async function refreshBadges() {
  try {
    const d = await api('/dashboard');
    const set = (id, v) => { const el = document.querySelector('[data-badge="' + id + '"]'); if (!el) return; el.style.display = v ? 'inline' : 'none'; el.textContent = v; };
    set('orders', d.kpis.activeOrders);
    set('purchase', (d.tasks.reqsPending || 0) + (d.kpis.openPOs || 0));
    set('dye', d.kpis.inDyeing);
    set('sampling', d.kpis.samplesOpen);
    set('production', d.kpis.wipOrders);
    set('quality', d.kpis.qcPending);
    set('shipping', (d.kpis.inTransit || 0) + (d.tasks.packingQueue || 0));
    const dock = (id, v) => { const el = document.querySelector('[data-dockbadge="' + id + '"]'); if (el) { el.style.display = v ? 'inline' : 'none'; el.textContent = v; } };
    dock('commercial', (d.tasks.reqsPending || 0) + (d.kpis.samplesOpen || 0));
    dock('mill', (d.kpis.inDyeing || 0) + (d.kpis.lowStock || 0));
    dock('factory', (d.kpis.wipOrders || 0) + (d.kpis.qcPending || 0));
    dock('dispatch', (d.kpis.inTransit || 0) + (d.tasks.packingQueue || 0));
    const dot = $('#bell-dot');
    if (dot) dot.style.display = (d.kpis.lowStock || d.tasks.reqsPending) ? 'block' : 'none';
  } catch (e) {}
}

/* ---------------- shared render helpers ---------------- */

function kpi(label, value, sub, color) {
  return '<div class="kpi" style="--kc:' + color + '"><div class="k-l">' + label + '</div><div class="k-v num">' + value + '</div><div class="k-s">' + sub + '</div></div>';
}
function feedItem(a, withTime) {
  const c = DEPT_COLORS[a.dept] || '#64748b';
  return '<div class="feed-item"><span class="fd" style="background:' + c + '"></span><div><b>' + esc(a.actor) + '</b> <span class="dept-tag" style="background:' + c + '18;color:' + c + '">' + esc(a.dept) + '</span><div class="mini">' + esc(a.text) + (withTime ? ' · ' + fmtDT(a.ts) : '') + '</div></div></div>';
}
function donutSvg(segments) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const R = 15.915;
  if (!total) return '<svg width="150" height="150" viewBox="0 0 42 42"><circle cx="21" cy="21" r="' + R + '" fill="none" stroke="#e2e8f0" stroke-width="5.5"/><text x="21" y="23" text-anchor="middle" font-size="6" fill="#94a3b8" font-weight="700">NO DATA</text></svg>';
  let off = 25, segs = '';
  for (const s of segments) {
    if (!s.value) continue;
    const pct = s.value / total * 100;
    segs += '<circle cx="21" cy="21" r="' + R + '" fill="none" stroke="' + s.color + '" stroke-width="5.5" stroke-dasharray="' + pct + ' ' + (100 - pct) + '" stroke-dashoffset="' + off + '" stroke-linecap="butt"/>';
    off -= pct;
  }
  return '<svg width="150" height="150" viewBox="0 0 42 42">' + segs + '<text x="21" y="20" text-anchor="middle" font-size="7.5" fill="#0f172a" font-weight="800">' + total + '</text><text x="21" y="26.5" text-anchor="middle" font-size="3" fill="#94a3b8" font-weight="600" letter-spacing="1">ORDERS</text></svg>';
}

/* ---------------- dashboard ---------------- */

async function viewDashboard(view) {
  const d = await api('/dashboard');
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // the factory flow: how every knitwear order travels, buyer PO to cash
  const flow = [
    { n: 1, label: 'Buyer Orders', count: d.kpis.activeOrders, sub: money(d.kpis.activeValue) + ' in pipeline', color: '#6366f1', go: '#/orders', icon: 'orders' },
    { n: 2, label: 'Yarn & Trims', count: d.kpis.openPOs + d.kpis.lowStock, sub: d.kpis.lowStock + ' low · ' + money(d.kpis.openPOValue) + ' inbound', color: '#f59e0b', go: '#/purchase', icon: 'purchase' },
    { n: 3, label: 'Dye House', count: d.kpis.inDyeing, sub: num(d.kpis.dyeingKg) + ' kg on machines', color: '#8b5cf6', go: '#/dye', icon: 'dye' },
    { n: 4, label: 'Knit & Sew', count: d.kpis.wipOrders, sub: num(d.kpis.dyedReadyKg) + ' kg dyed fabric ready', color: '#ea580c', go: '#/production', icon: 'production' },
    { n: 5, label: 'QC & Packing', count: (d.tasks.qcQueue || 0) + (d.tasks.packingQueue || 0), sub: d.tasks.inspectionsPending + ' inspection(s) open', color: '#0d9488', go: '#/quality', icon: 'quality' },
    { n: 6, label: 'Shipped & Cash', count: d.kpis.inTransit, sub: money(d.kpis.receivable) + ' to collect', color: '#0ea5e9', go: '#/shipping', icon: 'shipping' }
  ];
  const flowHtml = '<div class="flow-strip">' + flow.map((x, i) =>
    '<div class="flow-card" data-go="' + x.go + '" style="--fc:' + x.color + '">' +
    '<div class="flow-top"><span class="flow-n">' + x.n + '</span><span class="flow-lb">' + x.label + '</span></div>' +
    '<div class="flow-count num">' + x.count + '</div><div class="flow-sub">' + x.sub + '</div></div>' +
    (i < flow.length - 1 ? '<div class="flow-arrow">' + ICONS.arrow + '</div>' : '')
  ).join('') + '</div>';

  // department launcher tiles
  const tiles = [
    ['orders', 'Merchandising', d.kpis.activeOrders + ' live orders', '#/orders', '#6366f1'],
    ['sampling', 'Sampling', d.kpis.samplesOpen + ' with buyers', '#/sampling', '#818cf8'],
    ['purchase', 'Purchase', d.tasks.reqsPending + ' reqs to approve', '#/purchase', '#f59e0b'],
    ['inventory', 'Yarn & Trims Store', d.kpis.lowStock + ' items low', '#/inventory', '#d97706'],
    ['dye', 'Dye House', d.kpis.inDyeing + ' batches running', '#/dye', '#8b5cf6'],
    ['production', 'Production Floors', d.kpis.wipOrders + ' orders on floor', '#/production', '#ea580c'],
    ['quality', 'Quality Control', d.kpis.qcPending + ' inspections open', '#/quality', '#0d9488'],
    ['shipping', 'Shipping & Dispatch', (d.kpis.inTransit + d.tasks.packingQueue) + ' shipments moving', '#/shipping', '#0ea5e9'],
    ['finance', 'Finance', money(d.kpis.receivable) + ' receivable', '#/finance', '#16a34a'],
    ['hr', 'HR & Payroll', d.kpis.headcount + ' employees', '#/hr', '#db2777']
  ];
  const tilesHtml = '<div class="dept-tiles">' + tiles.map(t =>
    '<div class="dept-tile" data-go="' + t[3] + '" style="--tc:' + t[4] + '">' +
    '<span class="dt-ic" style="background:' + t[4] + '">' + ICONS[t[0]] + '</span>' +
    '<b>' + t[1] + '</b><span class="mini">' + t[2] + '</span></div>'
  ).join('') + '</div>';

  const tasks =
    taskRow('purchase', '#f59e0b', d.tasks.reqsPending, 'Requisitions awaiting approval', 'Purchase desk', '#/purchase') +
    taskRow('dye', '#8b5cf6', d.tasks.qcQueue, 'Dye batches in QC queue', 'Dye House lab', '#/dye') +
    taskRow('dye', '#ef4444', d.tasks.rework, 'Batches sent to rework', 'Shade repair', '#/dye') +
    taskRow('quality', '#0d9488', d.tasks.inspectionsPending, 'Inspections awaiting result', 'Quality Control', '#/quality') +
    taskRow('sampling', '#6366f1', d.tasks.samplesWaiting, 'Samples waiting on buyers', 'Sampling desk', '#/sampling') +
    taskRow('shipping', '#0ea5e9', d.tasks.packingQueue, 'Shipments being packed', 'Packing floor', '#/shipping');
  const due = d.tasks.dueSoon.slice(0, 4).map(o =>
    '<div class="task" data-go="#/orders/' + esc(o.id) + '"><span class="count-orb" style="background:' + STAGE_COLORS[o.stage] + '">' + esc(o.id.replace('ORD-', '')) + '</span><div class="tn"><b>' + esc(o.style) + '</b><div class="mini">' + esc(o.buyerName) + ' · ' + esc(o.stage) + ' · ' + fmtDate(o.deliveryDate) + '</div></div></div>'
  ).join('');

  view.innerHTML =
    '<div class="card hero mb"><h2>' + hello + ', ' + esc(state.user.name.split(' ')[0]) + ' — here is your factory, end to end.</h2><p>Follow an order left to right: buyer PO → yarn & trims → dye house → knitting & sewing → QC & packing → shipped & paid.</p>' +
    '<div class="h-stats"><div class="hs"><b class="num">' + money(d.kpis.activeValue) + '</b><span>Order book</span></div><div class="hs"><b class="num">' + num(d.kpis.dyedReadyKg) + ' kg</b><span>Dyed fabric ready</span></div><div class="hs"><b class="num">' + money(d.kpis.shippedValue) + '</b><span>Shipped to date</span></div><div class="hs"><b class="num">' + money(d.kpis.receivable) + '</b><span>To collect</span></div></div></div>' +
    '<div class="card mb"><div class="card-head"><span class="card-title">The flow — every order, stage by stage</span><span class="right mini">click any stage to open it</span></div>' + flowHtml + '</div>' +
    '<div class="grid g-main">' +
      '<div class="card"><div class="card-head"><span class="card-title">Needs attention today</span></div>' + (tasks + due || '<div class="empty">Nothing pending — rare and beautiful.</div>') + '</div>' +
      '<div class="card"><div class="card-head"><span class="card-title">Stock alerts — mill inputs</span><span class="right"><button class="linklike" data-go="#/inventory">Open store ' + ICONS.arrow + '</button></span></div>' +
      (d.lowStockList.length ? d.lowStockList.map(mm =>
        '<div class="alert-item"><div style="min-width:130px"><b>' + esc(mm.code) + '</b><div class="mini">' + esc(mm.name) + '</div></div><div class="ai-bar"><i style="width:' + Math.min(100, mm.stock / mm.reorder * 100) + '%"></i></div><span class="mini b num" style="min-width:86px;text-align:right">' + num(mm.stock) + ' / ' + num(mm.reorder) + '</span></div>'
      ).join('') : '<div class="empty">All yarn, dyes & trims above reorder levels.</div>') + '</div>' +
    '</div>' +
    '<div class="card mt mb"><div class="card-head"><span class="card-title">Open a department</span><span class="right mini">everyone under one roof</span></div>' + tilesHtml + '</div>' +
    '<div class="card"><div class="card-head"><span class="card-title">Live activity — all departments</span><span class="right"><button class="linklike" data-go="#/activity">Full thread ' + ICONS.arrow + '</button></span></div>' + d.recentActivity.map(a => feedItem(a, true)).join('') + '</div>';

  view.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}
function taskRow(icon, color, count, title, sub, go) {
  if (!count) return '';
  return '<div class="task" data-go="' + go + '"><span class="count-orb" style="background:' + color + '">' + count + '</span><div class="tn"><b>' + title + '</b><div class="mini">' + sub + '</div></div></div>';
}

/* ---------------- orders (merchandising) ---------------- */

async function viewOrders(view) {
  const [{ orders }, { buyers }, { materials }] = await Promise.all([api('/orders'), api('/buyers'), api('/materials')]);
  const q = state.orderSearch.toLowerCase();
  let list = orders.filter(o =>
    (state.orderStage === 'All' || o.stage === state.orderStage) &&
    (!q || (o.id + ' ' + o.po + ' ' + o.style + ' ' + (o.buyerName || '')).toLowerCase().includes(q))
  );
  const chips = '<div class="toolbar"><input class="search-input" id="ord-q" placeholder="Search orders, buyers, styles…" value="' + esc(state.orderSearch) + '">' +
    ['All'].concat(STAGES).map(s => '<button class="chip ' + (state.orderStage === s ? 'active' : '') + '" data-stage="' + esc(s) + '">' + esc(s) + (s === 'All' ? ' (' + orders.length + ')' : '') + '</button>').join('') +
    '<span class="spacer"></span>' +
    (can('orders') ? '<button class="btn primary" id="new-order">' + ICONS.plus + ' New order</button>' : '') +
    '</div>';

  const rows = list.map(o =>
    '<tr class="clickable" data-order="' + esc(o.id) + '">' +
    '<td><div class="cell-main">' + esc(o.id) + '</div><div class="cell-sub">' + esc(o.po || '—') + '</div></td>' +
    '<td><div class="cell-main">' + esc(o.buyerName || '—') + '</div><div class="cell-sub">' + esc(o.style) + '</div></td>' +
    '<td class="num">' + num(o.qty) + '<div class="cell-sub">' + esc(o.gauge) + ' · ' + (o.weightPerPc ? o.weightPerPc + ' kg/pc' : '') + '</div></td>' +
    '<td><div class="swatches">' + (o.colors || []).map(c => '<span class="swatch" title="' + esc(c.name) + ' ' + c.share + '%"><i style="background:' + c.hex + '"></i>' + esc(c.name) + '</span>').join('') + '</div></td>' +
    '<td class="num">' + money(o.value) + '</td>' +
    '<td>' + fmtDate(o.deliveryDate) + '<div class="cell-sub">' + dueBadge(o.deliveryDate) + '</div></td>' +
    '<td>' + pill(STAGE_PILL, o.stage) + '</td></tr>'
  ).join('');

  view.innerHTML = chips +
    '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th>Buyer / Style</th><th class="r">Qty</th><th>Shades</th><th class="r">Value</th><th>Delivery</th><th>Stage</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="7"><div class="empty">No orders match.</div></td></tr>') +
    '</tbody></table></div></div>';

  view.querySelectorAll('[data-order]').forEach(r => r.addEventListener('click', () => { location.hash = '#/orders/' + r.dataset.order; }));
  view.querySelectorAll('[data-stage]').forEach(c => c.addEventListener('click', () => { state.orderStage = c.dataset.stage; viewOrders(view); }));
  const qInput = $('#ord-q');
  qInput.addEventListener('input', () => { state.orderSearch = qInput.value; const pos = qInput.selectionStart; viewOrders(view); const nq = $('#ord-q'); nq.focus(); nq.setSelectionRange(pos, pos); });
  const nb = $('#new-order');
  if (nb) nb.addEventListener('click', () => orderModal(buyers, materials));
}

function orderModal(buyers, materials) {
  const yarns = materials.filter(m => m.category === 'Yarn');
  const body =
    '<div class="hint">' + ICONS.alert + ' On save, KnitFlow <b>auto-raises purchase requisitions</b> (yarn + trims) so Purchase can start sourcing immediately. No WhatsApp, no spreadsheets.</div>' +
    '<div class="form-grid">' +
    '<div class="field"><label>Buyer <span class="req">*</span></label><select name="buyerId">' + buyers.map(b => '<option value="' + b.id + '">' + esc(b.name) + ' — ' + esc(b.country) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Buyer PO no.</label><input name="po" placeholder="e.g. NW/26/0950"></div>' +
    '<div class="field full"><label>Style name <span class="req">*</span></label><input name="style" placeholder="e.g. Men\'s Crew Neck Sweater 12GG" required></div>' +
    '<div class="field"><label>Quantity (pcs) <span class="req">*</span></label><input name="qty" type="number" min="1" placeholder="20000" required></div>' +
    '<div class="field"><label>Weight / pc (kg)</label><input name="weightPerPc" type="number" step="0.01" min="0" placeholder="0.42"></div>' +
    '<div class="field"><label>Unit price ($/pc)</label><input name="unitPrice" type="number" step="0.05" min="0" placeholder="7.80"></div>' +
    '<div class="field"><label>Yarn (for auto-requisition)</label><select name="yarnMaterialId">' + yarns.map(y => '<option value="' + y.id + '">' + esc(y.name) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Gauge</label><select name="gauge">' + ['5GG','7GG','8GG','12GG','14GG'].map(g => '<option' + (g === '12GG' ? ' selected' : '') + '>' + g + '</option>').join('') + '</select></div>' +
    '<div class="field"><label>Incoterm</label><select name="incoterm"><option>FOB</option><option>CIF</option><option>EXW</option><option>DDP</option></select></div>' +
    '<div class="field"><label>Delivery date</label><input name="deliveryDate" type="date"></div>' +
    '<div class="field"><label>Buttons per pc</label><input name="buttonsPerPc" type="number" step="1" min="0" value="0"></div>' +
    '<div class="field full"><label>Colorways (name · Pantone/HEX · share %)</label><div id="color-rows"></div>' +
    '<button type="button" class="btn sm" id="add-color">' + ICONS.plus + ' Add color</button></div>' +
    '</div>';
  openModal({
    title: 'New order — Merchandising', body, wide: true, submitText: 'Confirm order & raise requisitions',
    onSubmit: async (fd) => {
      const colors = [...modalRoot.querySelectorAll('.color-row')].map(r => ({
        name: r.querySelector('[name=cname]').value.trim(), hex: r.querySelector('[name=chex]').value, share: Number(r.querySelector('[name=cshare]').value) || 0
      })).filter(c => c.name);
      const o = await api('/orders', { method: 'POST', body: {
        buyerId: fd.get('buyerId'), po: fd.get('po'), style: fd.get('style'), qty: fd.get('qty'),
        weightPerPc: fd.get('weightPerPc'), unitPrice: fd.get('unitPrice'), yarnMaterialId: fd.get('yarnMaterialId'),
        gauge: fd.get('gauge'), incoterm: fd.get('incoterm'), deliveryDate: fd.get('deliveryDate'),
        buttonsPerPc: fd.get('buttonsPerPc'), colors
      }});
      toast('Order ' + o.id + ' confirmed — ' + o.requisitionsRaised + ' requisitions sent to Purchase');
      route();
    }
  });
  const rowsEl = $('#color-rows');
  const addRow = (n, h, s) => {
    const div = document.createElement('div');
    div.className = 'color-row';
    div.innerHTML = '<input name="cname" placeholder="Color e.g. Navy" value="' + esc(n || '') + '"><input name="chex" type="color" value="' + (h || '#4F46E5') + '"><input name="cshare" type="number" min="0" max="100" placeholder="%" value="' + (s || '') + '"><button type="button" class="btn sm red" data-rm>' + ICONS.x + '</button>';
    div.querySelector('[data-rm]').addEventListener('click', () => div.remove());
    rowsEl.appendChild(div);
  };
  addRow('Navy', '#1F2A44', 60); addRow('Ecru', '#EFE8D8', 40);
  $('#add-color').addEventListener('click', () => addRow());
}

/* ---------------- order detail ---------------- */

async function viewOrderDetail(view, id) {
  const d = await api('/orders/' + encodeURIComponent(id));
  const o = d.order;
  const curIdx = STAGES.indexOf(o.stage);
  const stepper = '<div class="stepper">' + STAGES.map((s, i) => {
    const cls = i < curIdx ? 'done' : i === curIdx ? 'current' : '';
    return '<div class="step ' + cls + '"><div class="step-col"><div class="step-dot">' + (i < curIdx ? '✓' : i + 1) + '</div><div class="step-lb">' + esc(s) + '</div></div>' + (i < STAGES.length - 1 ? '<div class="step-line"></div>' : '') + '</div>';
  }).join('') + '</div>';

  const reqRows = d.requisitions.map(r =>
    '<tr><td class="cell-main">' + esc(r.id) + '</td><td>' + esc(r.materialName || r.materialId) + '<div class="cell-sub">' + esc(r.note || '') + '</div></td><td class="num">' + num(r.qty) + ' ' + esc(r.unit || '') + '</td><td>' + pill(REQ_PILL, r.status) + '</td></tr>'
  ).join('');
  const poRows = d.pos.map(p =>
    '<tr><td class="cell-main">' + esc(p.id) + '</td><td>' + esc(p.supplierName) + '</td><td>' + p.items.map(i => esc(i.materialName || i.materialId) + ' × ' + num(i.qty)).join('<br>') + '</td><td class="num">' + money(p.items.reduce((s, i) => s + i.qty * i.rate, 0)) + '</td><td>' + fmtDate(p.eta) + '</td><td>' + pill(PO_PILL, p.status) + '</td></tr>'
  ).join('');
  const batchRows = d.batches.map(b =>
    '<tr><td class="cell-main">' + esc(b.id) + '</td><td><span class="swatch"><i style="background:' + b.hex + '"></i>' + esc(b.color) + '</span></td><td class="num">' + num(b.qtyKg) + ' kg</td><td>' + esc(b.machine) + '</td><td>' + esc(b.recipe || '—') + '</td><td>' + pill(BATCH_PILL, b.status) + '</td></tr>'
  ).join('');
  const shipRows = d.shipments.map(s => {
    const mode = s.mode || 'Sea';
    const ref = mode === 'Air' ? esc(s.flightNo || '—') + ' · AWB ' + esc(s.airwaybill || '—') : mode === 'Courier' ? esc(s.carrier || '—') + ' · ' + esc(s.trackingNo || '—') : esc(s.vessel || '—') + ' · ' + esc(s.booking || '—');
    return '<tr><td><span class="cell-main">' + esc(s.id) + '</span> <span class="pill ' + MODE_PILL[mode] + '">' + SHIP_MODES[mode].tag + '</span></td><td class="num">' + num(s.cartons) + ' ctns · ' + num(s.grossKg) + ' kg</td><td>' + ref + '<div class="cell-sub">' + esc(s.portLoading) + ' → ' + esc(s.portDischarge) + '</div></td><td>ETD ' + fmtDate(s.etd) + '<div class="cell-sub">ETA ' + fmtDate(s.eta) + '</div></td><td>' + pill(SHIP_PILL, s.status) + '</td></tr>';
  }).join('');

  const extraCards = [];
  if (d.samples.length) extraCards.push('<div class="card"><div class="card-head"><span class="card-title">Samples & approvals</span></div><table class="tbl"><thead><tr><th>Sample</th><th>Type</th><th>Status</th><th>Sent</th><th>Approved</th><th>Note</th></tr></thead><tbody>' + d.samples.map(sm => '<tr><td class="cell-main">' + esc(sm.id) + '</td><td>' + esc(sm.type) + '</td><td>' + pill(SAMPLE_PILL, sm.status) + '</td><td>' + fmtDate(sm.sentDate) + '</td><td>' + fmtDate(sm.approvedDate) + '</td><td class="mini">' + esc(sm.note || '—') + '</td></tr>').join('') + '</tbody></table></div>');
  if (d.production.length) {
    extraCards.push('<div class="card"><div class="card-head"><span class="card-title">Production floors</span></div>' + d.production.map(pr => {
      const floors = [['Knitting', pr.knit], ['Cutting', pr.cut], ['Sewing', pr.sew], ['Finishing', pr.finish]];
      return '<div style="margin-bottom:12px"><div class="mini b" style="margin-bottom:6px">' + esc(pr.id) + (pr.status === 'Done' ? ' · completed' : ' · in progress') + ' — target ' + num(pr.target) + ' pcs · machines ' + esc(pr.machines.join(', ') || '—') + '</div>' +
        floors.map(f => '<div class="pipe-row sm"><span class="pl">' + f[0] + '</span><div class="pipe-bar"><div class="pipe-fill" style="width:' + Math.min(100, pr.target ? f[1] / pr.target * 100 : 0) + '%;background:' + (f[1] >= pr.target ? 'var(--green)' : '#ea580c') + '"></div></div><span class="pc num">' + num(f[1]) + '</span></div>').join('') + '</div>';
    }).join('') + '</div>');
  }
  if (d.inspections.length) extraCards.push('<div class="card"><div class="card-head"><span class="card-title">Quality inspections</span></div><table class="tbl"><thead><tr><th>Inspection</th><th>Type</th><th class="r">Sample</th><th class="r">Defects C/M/m</th><th>Result</th><th>Date</th></tr></thead><tbody>' + d.inspections.map(i => '<tr><td class="cell-main">' + esc(i.id) + '</td><td>' + esc(i.type) + '</td><td class="num">' + num(i.sampleSize) + '</td><td class="num">' + i.crit + ' / ' + i.major + ' / ' + i.minor + '</td><td>' + pill(INSP_PILL, i.result) + '</td><td>' + fmtDate(i.date) + '</td></tr>').join('') + '</tbody></table></div>');
  if (d.costsheet && can('finance')) {
    const cc = costCalc(o, d.costsheet);
    const mPill = cc.marginPct >= 25 ? 'p-green' : cc.marginPct >= 10 ? 'p-amber' : 'p-red';
    extraCards.push('<div class="card"><div class="card-head"><span class="card-title">Costing & margin — Finance</span><span class="right"><span class="pill ' + mPill + '">' + cc.marginPct.toFixed(1) + '% margin</span></span></div><table class="tbl"><tbody>' +
      '<tr><td class="mini">Yarn (' + num(d.costsheet.yarnKg) + ' kg @ $' + d.costsheet.yarnRate + ')</td><td class="r num">' + money(cc.yarn) + '</td></tr>' +
      '<tr><td class="mini">Dye & chemicals</td><td class="r num">' + money(cc.chem) + '</td></tr>' +
      '<tr><td class="mini">CM (cut, make, trim)</td><td class="r num">' + money(cc.cm) + '</td></tr>' +
      '<tr><td class="mini">Trims & packing</td><td class="r num">' + money(cc.trims) + '</td></tr>' +
      '<tr><td class="mini">Freight</td><td class="r num">' + money(cc.freight) + '</td></tr>' +
      '<tr><td class="mini">Overhead @ ' + d.costsheet.overheadPct + '%</td><td class="r num">' + money(cc.ovh) + '</td></tr>' +
      '<tr><td><b>Total cost</b></td><td class="r num"><b>' + money(cc.total) + '</b></td></tr>' +
      '<tr><td><b>Revenue</b></td><td class="r num"><b>' + money(cc.revenue) + '</b></td></tr>' +
      '<tr><td class="mini"><b>Profit</b></td><td class="r num"><b style="color:var(--green)">' + money(cc.profit) + '</b></td></tr>' +
      '</tbody></table></div>');
  }
  const extraHtml = extraCards.length ? '<div class="grid g-2 mt">' + extraCards.join('') + '</div>' : '';

  // contextual actions
  const acts = [];
  if (can('orders')) {
    if (o.stage === 'Order Confirmed') acts.push('<button class="btn primary" id="a-reqs">' + ICONS.cart + ' Raise material requisitions</button>');
    if (o.stage === 'Fabric Ready') acts.push('<button class="btn primary" id="a-prod">' + ICONS.orders + ' Start production (cut & sew)</button>');
    if (o.stage === 'Production') acts.push('<button class="btn primary" id="a-pack">' + ICONS.shipping + ' Hand over to Shipping</button>');
    if (!['Delivered'].includes(o.stage)) {
      const opts = STAGES.filter(s => s !== o.stage).map(s => '<option value="' + esc(s) + '">' + esc(s) + '</option>').join('');
      acts.push('<select id="a-move" class="btn" style="padding:8px 10px"><option value="">Move stage…</option>' + opts + '</select>');
    }
  }
  if (can('batches') && ['Ready for Dyeing', 'Dyeing', 'Fabric Ready'].includes(o.stage)) acts.push('<button class="btn" id="a-batch" style="border-color:var(--purple);color:var(--purple)">' + ICONS.flame + ' Schedule dye batch</button>');
  if (can('shipments') && ['Production', 'Fabric Ready', 'Packing'].includes(o.stage)) acts.push('<button class="btn" id="a-ship" style="border-color:var(--sky);color:#0369a1">' + ICONS.ship + ' Create shipment</button>');
  if (can('samples') && !['Shipped', 'Delivered'].includes(o.stage)) acts.push('<button class="btn" id="a-sample" style="border-color:var(--indigo);color:var(--indigo)">' + ICONS.sampling + ' Request sample</button>');
  if (can('production') && ['Fabric Ready', 'Production', 'Packing'].includes(o.stage)) acts.push('<button class="btn" id="a-prodopen" style="border-color:var(--orange);color:var(--orange)">' + ICONS.production + ' Open production order</button>');
  if (can('inspections') && ['Production', 'Packing', 'Shipped'].includes(o.stage)) acts.push('<button class="btn" id="a-inspect" style="border-color:var(--teal);color:var(--teal)">' + ICONS.quality + ' Record inspection</button>');

  view.innerHTML =
    '<button class="backlink" id="back">' + ICONS.arrow.replace('M5 12h14M13 6l6 6-6 6', 'M19 12H5M11 18l-6-6 6-6') + ' Back to orders</button>' +
    '<div class="card mb"><div class="oh-head">' +
      '<div style="flex:1;min-width:260px"><div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><h2 style="font-size:20px">' + esc(o.id) + '</h2>' + pill(STAGE_PILL, o.stage) + dueBadge(o.deliveryDate) + '</div>' +
      '<div class="mini" style="margin-top:3px">Buyer PO ' + esc(o.po || '—') + ' · raised ' + fmtDate(o.createdAt) + ' by merchandising</div>' +
      '<div style="margin-top:8px;font-size:15px;font-weight:700">' + esc(o.style) + '</div>' +
      '<div class="swatches">' + o.colors.map(c => '<span class="swatch"><i style="background:' + c.hex + '"></i>' + esc(c.name) + ' · ' + c.share + '%</span>').join('') + '</div></div>' +
      '<div class="oh-meta" style="flex:1.4;min-width:320px;margin-top:0">' +
        '<div class="m"><label>Buyer</label><b>' + esc(o.buyerName || '—') + '</b></div>' +
        '<div class="m"><label>Order value</label><b class="num">' + money(o.value) + '</b></div>' +
        '<div class="m"><label>Quantity</label><b class="num">' + num(o.qty) + ' pcs</b></div>' +
        '<div class="m"><label>Incoterm</label><b>' + esc(o.incoterm) + ' Toamasina</b></div>' +
        '<div class="m"><label>Gauge / fabric</label><b>' + esc(o.gauge) + ' · ' + esc(d.yarn ? d.yarn.name : o.yarnMaterialId) + '</b></div>' +
        '<div class="m"><label>Weight / pc</label><b class="num">' + o.weightPerPc + ' kg</b></div>' +
        '<div class="m"><label>Delivery date</label><b>' + fmtDate(o.deliveryDate) + '</b></div>' +
        '<div class="m"><label>Yarn req.</label><b class="num">' + num(Math.round(o.qty * o.weightPerPc * 1.1)) + ' kg</b></div>' +
      '</div></div>' +
      '<div class="mt">' + stepper + '</div>' +
      (acts.length ? '<div class="actions-bar">' + acts.join('') + '</div>' : '') +
    '</div>' +
    '<div class="grid g-2">' +
      '<div class="card"><div class="card-head"><span class="card-title">Material requisitions</span><span class="right mini">auto-raised at order entry</span></div>' +
      (reqRows ? '<table class="tbl"><thead><tr><th>Req</th><th>Material</th><th class="r">Qty</th><th>Status</th></tr></thead><tbody>' + reqRows + '</tbody></table>' : '<div class="empty">No requisitions yet.</div>') + '</div>' +
      '<div class="card"><div class="card-head"><span class="card-title">Purchase orders</span><span class="right mini">raised by Purchase</span></div>' +
      (poRows ? '<table class="tbl"><thead><tr><th>PO</th><th>Supplier</th><th>Items</th><th class="r">Value</th><th>ETA</th><th>Status</th></tr></thead><tbody>' + poRows + '</tbody></table>' : '<div class="empty">No POs yet.</div>') + '</div>' +
      '<div class="card"><div class="card-head"><span class="card-title">Dye batches</span><span class="right mini">Dye House floor</span></div>' +
      (batchRows ? '<table class="tbl"><thead><tr><th>Batch</th><th>Shade</th><th class="r">Qty</th><th>Machine</th><th>Recipe</th><th>Status</th></tr></thead><tbody>' + batchRows + '</tbody></table>' : '<div class="empty">No dye batches yet.</div>') + '</div>' +
      '<div class="card"><div class="card-head"><span class="card-title">Shipments</span><span class="right mini">Shipping desk</span></div>' +
      (shipRows ? '<table class="tbl"><thead><tr><th>Shipment</th><th class="r">Load</th><th>Vessel / Route</th><th>Window</th><th>Status</th></tr></thead><tbody>' + shipRows + '</tbody></table>' : '<div class="empty">Not shipped yet.</div>') + '</div>' +
    '</div>' +
    extraHtml + '<div class="card mt"><div class="card-head"><span class="card-title">Order history — who did what</span></div>' + (d.activity.map(a => feedItem(a, true)).join('') || '<div class="empty">No history yet.</div>') + '</div>';

  $('#back').addEventListener('click', () => { location.hash = '#/orders'; });
  const on = (sel, fn) => { const el = $(sel); if (el) el.addEventListener('click', fn); };
  on('#a-reqs', async () => { const r = await api('/orders/' + o.id + '/requisitions', { method: 'POST' }); toast(r.raised + ' requisitions raised — Purchase notified'); route(); });
  on('#a-prod', async () => { await api('/orders/' + o.id, { method: 'PATCH', body: { stage: 'Production' } }); toast(o.id + ' moved to Production'); route(); });
  on('#a-pack', async () => { await api('/orders/' + o.id, { method: 'PATCH', body: { stage: 'Packing' } }); toast(o.id + ' handed to Shipping — they are notified'); route(); });
  on('#a-batch', () => batchModal([o]));
  on('#a-ship', () => shipmentModal([o]));
  on('#a-sample', () => sampleModal([o]));
  on('#a-prodopen', () => productionOpenModal([o]));
  on('#a-inspect', () => inspectionModal([o]));
  const mv = $('#a-move');
  if (mv) mv.addEventListener('change', async () => { if (!mv.value) return; await api('/orders/' + o.id, { method: 'PATCH', body: { stage: mv.value } }); toast(o.id + ' moved to ' + mv.value); route(); });
}

/* ---------------- purchase ---------------- */

async function viewPurchase(view) {
  const tab = state.purchaseTab;
  view.innerHTML = '<div class="toolbar"><div class="tabs">' +
    '<button class="tab ' + (tab === 'reqs' ? 'active' : '') + '" data-tab="reqs">Requisitions</button>' +
    '<button class="tab ' + (tab === 'pos' ? 'active' : '') + '" data-tab="pos">Purchase Orders</button>' +
    '<button class="tab ' + (tab === 'sup' ? 'active' : '') + '" data-tab="sup">Suppliers</button>' +
    '</div><span class="spacer"></span><span class="mini">' + (can('pos') ? 'You can act on this desk' : 'Read-only — Purchase desk') + '</span></div><div id="pur-body"></div>';
  view.querySelectorAll('[data-tab]').forEach(t => t.addEventListener('click', () => { state.purchaseTab = t.dataset.tab; viewPurchase(view); }));
  const body = $('#pur-body');
  if (tab === 'reqs') await purchaseReqs(body, view);
  else if (tab === 'pos') await purchasePOs(body, view);
  else await purchaseSuppliers(body, view);
}

async function purchaseReqs(body, view) {
  const { requisitions } = await api('/requisitions');
  const actable = can('reqs');
  const rows = requisitions.map((r, i) =>
    '<tr><td><input type="checkbox" class="req-sel" data-id="' + esc(r.id) + '" data-status="' + esc(r.status) + '"' + (r.status === 'Approved' ? '' : ' disabled') + (state['sel_' + r.id] ? ' checked' : '') + '></td>' +
    '<td><div class="cell-main">' + esc(r.id) + '</div><div class="cell-sub">' + fmtDate(r.createdAt) + '</div></td>' +
    '<td><div class="cell-main">' + esc(r.orderId) + '</div><div class="cell-sub">' + esc(r.buyerName || '') + ' · ' + esc(r.orderPo || '') + '</div></td>' +
    '<td><div class="cell-main">' + esc(r.materialName) + '</div><div class="cell-sub">' + esc(r.note || '') + '</div></td>' +
    '<td class="num">' + num(r.qty) + ' ' + esc(r.unit || '') + '</td><td>' + pill(REQ_PILL, r.status) + '</td>' +
    '<td>' + (actable && r.status === 'Pending Approval' ? '<button class="btn sm green" data-approve="' + esc(r.id) + '">Approve</button> <button class="btn sm red" data-reject="' + esc(r.id) + '">Reject</button>' : '') + '</td></tr>'
  ).join('');
  body.innerHTML =
    '<div class="toolbar"><span class="mini">Demand raised by Merchandising → Purchase approves → POs placed → goods received into store.</span><span class="spacer"></span>' +
    '<button class="btn primary" id="po-from-reqs" disabled>' + ICONS.cart + ' Create PO from selected</button></div>' +
    '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th></th><th>Req</th><th>Order</th><th>Material</th><th class="r">Qty</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  body.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', async () => { await api('/requisitions/' + b.dataset.approve + '/approve', { method: 'POST' }); toast('Requisition approved'); viewPurchase(view); }));
  body.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', async () => { await api('/requisitions/' + b.dataset.reject + '/reject', { method: 'POST' }); toast('Requisition rejected', 'error'); viewPurchase(view); }));
  body.querySelectorAll('.req-sel').forEach(c => c.addEventListener('change', () => { state['sel_' + c.dataset.id] = c.checked; syncPoBtn(); }));
  function syncPoBtn() {
    const any = [...body.querySelectorAll('.req-sel')].some(c => c.checked);
    $('#po-from-reqs').disabled = !any;
  }
  $('#po-from-reqs').addEventListener('click', async () => {
    const ids = [...body.querySelectorAll('.req-sel')].filter(c => c.checked).map(c => c.dataset.id);
    const [{ materials }, { suppliers }] = await Promise.all([api('/materials'), api('/suppliers')]);
    const sel = requisitions.filter(r => ids.includes(r.id));
    const itemsHtml = sel.map(r => {
      const mat = materials.find(m => m.id === r.materialId) || {};
      return '<div class="color-row" style="grid-template-columns:1.6fr 1fr .8fr"><input value="' + esc(mat.name || '') + '" disabled><input type="number" name="qty_' + r.id + '" value="' + r.qty + '" min="1"><input type="number" name="rate_' + r.id + '" value="' + (mat.cost || 0) + '" step="0.01" min="0" placeholder="rate"></div>';
    }).join('');
    openModal({
      title: 'New purchase order', wide: true, submitText: 'Raise PO',
      body: '<div class="hint">Selected requisitions will be marked <b>Ordered</b> and linked to this PO.</div>' +
        '<div class="field"><label>Supplier <span class="req">*</span></label><select name="supplierId">' + suppliers.map(s => '<option value="' + s.id + '">' + esc(s.name) + ' — ' + esc(s.type) + ' · ' + esc(s.location) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Link to order</label><select name="orderId"><option value="">— general stock —</option><option value="' + esc(sel[0].orderId) + '" selected>' + esc(sel[0].orderId) + '</option></select></div>' +
        '<div class="field"><label>Line items (qty / rate $)</label>' + itemsHtml + '</div>' +
        '<div class="field"><label>ETA</label><input type="date" name="eta"></div>',
      onSubmit: async fd => {
        const items = sel.map(r => ({ materialId: r.materialId, qty: fd.get('qty_' + r.id), rate: fd.get('rate_' + r.id) }));
        const po = await api('/pos', { method: 'POST', body: { supplierId: fd.get('supplierId'), orderId: fd.get('orderId'), items, requisitionIds: ids, eta: fd.get('eta') } });
        toast(po.id + ' created — send it to the supplier');
        viewPurchase(view);
      }
    });
  });
}

async function purchasePOs(body, view) {
  const { pos } = await api('/pos');
  const rows = pos.map(p =>
    '<tr><td><div class="cell-main">' + esc(p.id) + '</div><div class="cell-sub">' + fmtDate(p.createdAt) + '</div></td>' +
    '<td class="cell-main">' + esc(p.supplierName) + '</td>' +
    '<td>' + (p.orderPo ? esc(p.orderId || '') + ' <span class="cell-sub">' + esc(p.orderPo) + '</span>' : '<span class="mini">general stock</span>') + '</td>' +
    '<td>' + p.items.map(i => esc(i.materialName) + ' <b class="num">× ' + num(i.qty) + ' ' + esc(i.unit || '') + '</b> @ $' + i.rate).join('<br>') + '</td>' +
    '<td class="num">' + money(p.value) + '</td><td>' + fmtDate(p.eta) + '</td><td>' + pill(PO_PILL, p.status) + '</td>' +
    '<td>' + (can('pos') ? (
      p.status === 'Draft' ? '<button class="btn sm dark" data-send="' + esc(p.id) + '">Send to supplier</button>' :
      p.status === 'Partial' || p.status === 'Sent' ? '<button class="btn sm green" data-rec="' + esc(p.id) + '">Receive goods</button>' : '<span class="mini">into store ✓</span>'
    ) : '') + '</td></tr>'
  ).join('');
  body.innerHTML = '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>PO</th><th>Supplier</th><th>Order</th><th>Items</th><th class="r">Value</th><th>ETA</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  body.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', async () => { await api('/pos/' + b.dataset.send + '/send', { method: 'POST' }); toast('PO sent to supplier'); viewPurchase(view); }));
  body.querySelectorAll('[data-rec]').forEach(b => b.addEventListener('click', async () => {
    const po = pos.find(x => x.id === b.dataset.rec);
    openModal({
      title: 'Receive goods — ' + po.id, submitText: 'Receive into store',
      body: '<div class="hint">Received quantities go straight into <b>Inventory</b> and linked orders advance automatically.</div>' +
        po.items.map(i => '<div class="field"><label>' + esc(i.materialName) + ' (' + esc(i.unit) + ') — ordered ' + num(i.qty) + '</label><input type="number" name="' + i.materialId + '" value="' + i.qty + '" min="0"></div>').join(''),
      onSubmit: async fd => {
        const lines = po.items.map(i => ({ materialId: i.materialId, qty: Number(fd.get(i.materialId)) || 0 }));
        await api('/pos/' + po.id + '/receive', { method: 'POST', body: { lines } });
        toast('Goods received — store updated, merchandising notified');
        viewPurchase(view);
      }
    });
  }));
}

async function purchaseSuppliers(body, view) {
  const { suppliers } = await api('/suppliers');
  const cards = suppliers.map(s =>
    '<div class="card"><div style="display:flex;gap:12px;align-items:center"><span class="avatar" style="background:var(--amber)">' + esc(initials(s.name)) + '</span><div style="flex:1"><b>' + esc(s.name) + '</b><div class="mini">' + esc(s.type) + ' · ' + esc(s.location) + '</div></div><span class="pill p-amber">★ ' + s.rating + '</span></div><div class="mini" style="margin-top:9px">' + esc(s.email) + '</div></div>'
  ).join('');
  body.innerHTML = '<div class="toolbar"><span class="mini">' + suppliers.length + ' approved suppliers</span><span class="spacer"></span>' +
    (can('suppliers') ? '<button class="btn primary" id="add-sup">' + ICONS.plus + ' Add supplier</button>' : '') + '</div>' +
    '<div class="grid g-3">' + cards + '</div>';
  const btn = $('#add-sup');
  if (btn) btn.addEventListener('click', () => openModal({
    title: 'Register supplier', submitText: 'Add supplier',
    body: '<div class="field"><label>Name <span class="req">*</span></label><input name="name" required></div>' +
      '<div class="field"><label>Type</label><select name="type"><option>Yarn</option><option>Dyes & Chemicals</option><option>Trims & Accessories</option><option>Packaging</option></select></div>' +
      '<div class="field"><label>Location</label><input name="location" placeholder="City, Country"></div>' +
      '<div class="field"><label>Email</label><input name="email" type="email"></div>' +
      '<div class="field"><label>Rating</label><input name="rating" type="number" step="0.1" min="1" max="5" value="4.0"></div>',
    onSubmit: async fd => { await api('/suppliers', { method: 'POST', body: Object.fromEntries(fd) }); toast('Supplier registered'); viewPurchase(view); }
  }));
}

/* ---------------- dye house ---------------- */

async function viewDye(view) {
  const [{ batches, dyeSummary }, { orders }] = await Promise.all([api('/batches'), api('/orders')]);
  const actionable = can('batches');
  const cols = [
    { key: 'Queued', color: '#64748b' }, { key: 'Dyeing', color: '#8b5cf6' }, { key: 'Drying', color: '#06b6d4' },
    { key: 'QC', color: '#f59e0b' }, { key: 'Rework', color: '#ef4444' }, { key: 'Passed', color: '#10b981' }
  ];
  const q = orders.filter(o => ['Material Sourcing', 'Ready for Dyeing', 'Dyeing', 'Fabric Ready'].includes(o.stage));
  const machHtml = MACHINES.map(mc => {
    const busy = batches.find(b => b.machine === mc && ['Dyeing', 'Drying'].includes(b.status));
    return '<span class="mach-chip ' + (busy ? '' : 'idle') + '"><i style="' + (busy ? 'background:' + busy.hex + '' : '') + '"></i>' + mc + (busy ? ' · ' + esc(busy.color) + ' (' + esc(busy.status) + ')' : ' · idle') + '</span>';
  }).join('');

  const cardFor = b => {
    const order = orders.find(o => o.id === b.orderId) || {};
    let actions = '';
    if (actionable) {
      if (BATCH_NEXT[b.status]) actions += '<button class="btn sm primary" data-adv="' + esc(b.id) + '">' + (b.status === 'Queued' ? 'Start dyeing' : 'To ' + BATCH_NEXT[b.status]) + '</button>';
      if (b.status === 'QC') actions += '<button class="btn sm green" data-pass="' + esc(b.id) + '">Pass QC</button><button class="btn sm red" data-fail="' + esc(b.id) + '">Fail</button>';
      if (b.status === 'Rework') actions += '<button class="btn sm primary" data-adv="' + esc(b.id) + '">Re-dye</button>';
      actions += '<button class="btn sm" data-res="' + esc(b.id) + '">Usage</button>';
    }
    return '<div class="kb-card" style="--bc:' + b.hex + '">' +
      '<div class="kb-title">' + esc(b.id) + ' <span class="swatch"><i style="background:' + b.hex + '"></i>' + esc(b.color) + '</span></div>' +
      '<div class="kb-sub">' + esc(b.orderId) + ' (' + esc(b.orderPo || '') + ')<br>' + num(b.qtyKg) + ' kg · ' + esc(b.machine) + ' · ' + esc(b.recipe || 'no recipe') + (b.reworks ? ' · rework #' + b.reworks : '') +
      (b.waterPerKg != null ? '<br><span style="color:' + (b.waterPerKg > (dyeSummary ? dyeSummary.std.waterLPkg : 60) * 1.15 ? '#b91c1c' : '#0f766e') + '">💧 ' + b.waterPerKg + ' L/kg · ' + b.powerPerKg + ' kWh/kg</span>' : '') + '</div>' +
      '<div class="kb-actions">' + actions + '</div></div>';
  };

  const kanban = '<div class="kanban">' + cols.map(c => {
    const list = batches.filter(b => b.status === c.key);
    return '<div class="kb-col"><div class="kb-head"><span style="width:9px;height:9px;border-radius:50%;background:' + c.color + '"></span><b>' + c.key + '</b><span class="kb-count">' + list.length + '</span></div>' +
      (list.map(cardFor).join('') || '<div class="mini" style="text-align:center;padding:16px 4px;color:#94a3b8">—</div>') + '</div>';
  }).join('') + '</div>';

  const totalKg = batches.filter(b => ['Queued','Dyeing','Drying','QC'].includes(b.status)).reduce((s, b) => s + b.qtyKg, 0);
  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
      '<span class="s-chip"><b class="num">' + num(totalKg) + ' kg</b><span>on the floor</span></span>' +
      '<span class="s-chip"><b class="num" style="color:' + (dyeSummary && dyeSummary.rftPct >= 90 ? 'var(--green)' : '#b45309') + '">' + (dyeSummary ? dyeSummary.rftPct : '—') + '%</b><span>right-first-time</span></span>' +
      '<span class="s-chip"><b class="num">' + (dyeSummary && dyeSummary.waterAvgLPkg != null ? dyeSummary.waterAvgLPkg : '—') + ' L/kg</b><span>avg water (std ' + (dyeSummary ? dyeSummary.std.waterLPkg : 60) + ')</span></span>' +
      '<span class="s-chip"><b class="num">' + (dyeSummary && dyeSummary.powerAvgKwhPkg != null ? dyeSummary.powerAvgKwhPkg : '—') + ' kWh/kg</b><span>avg power (std ' + (dyeSummary ? dyeSummary.std.powerKwhPkg : 1.2) + ')</span></span>' +
      '<span class="s-chip"><b class="num">' + batches.filter(b => b.status === 'Passed').reduce((s, b) => s + b.qtyKg, 0).toLocaleString() + ' kg</b><span>dyed &amp; passed</span></span>' +
      '<span class="s-chip"><b class="num">' + batches.filter(b => b.status === 'Rework').length + '</b><span>in rework</span></span>' +
    '</div><span class="spacer"></span>' +
    (actionable ? '<button class="btn primary" id="new-batch">' + ICONS.flame + ' Schedule dye batch</button>' : '') + '</div>' +
    '<div class="mach-chips">' + machHtml + '</div>' + kanban;

  const on = (sel, fn) => view.querySelectorAll(sel).forEach(b => b.addEventListener('click', fn));
  on('[data-adv]', async e => {
    try { const b = await api('/batches/' + e.currentTarget.dataset.adv + '/advance', { method: 'POST' }); toast('Batch ' + b.id + ' → ' + b.status); viewDye(view); }
    catch (err) { toast(err.message, 'error'); }
  });
  on('[data-pass]', async e => { const b = await api('/batches/' + e.currentTarget.dataset.pass + '/complete', { method: 'POST', body: { pass: true } }); toast('Batch ' + b.id + ' passed QC — fabric to floor'); viewDye(view); });
  on('[data-fail]', async e => { const b = await api('/batches/' + e.currentTarget.dataset.fail + '/complete', { method: 'POST', body: { pass: false } }); toast('Batch ' + b.id + ' failed — sent to rework', 'error'); viewDye(view); });
  view.querySelectorAll('[data-res]').forEach(b => b.addEventListener('click', () => {
    const bt = batches.find(x => x.id === b.dataset.res);
    const stdW = Math.round(bt.qtyKg * (dyeSummary ? dyeSummary.std.waterLPkg : 60));
    const stdP = Math.round(bt.qtyKg * (dyeSummary ? dyeSummary.std.powerKwhPkg : 1.2));
    openModal({
      title: 'Resource usage — ' + bt.id, submitText: 'Save usage',
      body: '<div class="hint">Standard for ' + num(bt.qtyKg) + ' kg: <b>' + num(stdW) + ' L water · ' + num(stdP) + ' kWh</b>. Enter what the machine actually used.</div>' +
        '<div class="form-grid">' +
        '<div class="field"><label>Water (L)</label><input name="waterL" type="number" min="0" value="' + (bt.resources ? bt.resources.waterL : stdW) + '"></div>' +
        '<div class="field"><label>Electricity (kWh)</label><input name="powerKwh" type="number" min="0" step="0.1" value="' + (bt.resources ? bt.resources.powerKwh : stdP) + '"></div>' +
        '<div class="field"><label>Steam (kg)</label><input name="steamKg" type="number" min="0" value="' + (bt.resources ? bt.resources.steamKg : Math.round(bt.qtyKg * 5)) + '"></div>' +
        '<div class="field"><label>Dye & chemicals cost ($)</label><input name="chemCost" type="number" min="0" step="0.01" value="' + (bt.resources ? bt.resources.chemCost : Math.round(bt.qtyKg * 0.85 * 100) / 100) + '"></div>' +
        '</div>',
      onSubmit: async fd => {
        await api('/batches/' + bt.id + '/resources', { method: 'PATCH', body: Object.fromEntries(fd) });
        toast('Usage recorded — KPIs updated');
        viewDye(view);
      }
    });
  }));
  const nb = $('#new-batch');
  if (nb) nb.addEventListener('click', () => batchModal(q));
}

function batchModal(orders) {
  const usable = orders.filter(o => o.colors && o.colors.length);
  if (!usable.length) return toast('No orders ready for dyeing', 'error');
  openModal({
    title: 'Schedule dye batch — Dye House', submitText: 'Add to board',
    body: '<div class="hint">Starting a batch <b>auto-issues yarn from the store</b>; passing QC pushes the order toward <b>Fabric Ready</b>.</div>' +
      '<div class="field"><label>Order <span class="req">*</span></label><select name="orderId" id="bo">' + usable.map(o => '<option value="' + o.id + '">' + o.id + ' — ' + esc(o.style) + '</option>').join('') + '</select></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Shade</label><select name="color" id="bc"></select></div>' +
      '<div class="field"><label>Quantity (kg)</label><input name="qtyKg" type="number" min="1" value="3000" required></div>' +
      '<div class="field"><label>Machine</label><select name="machine">' + MACHINES.map(mc => '<option>' + mc + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Recipe code</label><input name="recipe" placeholder="e.g. CTN-NVY-11"></div>' +
      '</div>',
    onSubmit: async fd => {
      const b = await api('/batches', { method: 'POST', body: { orderId: fd.get('orderId'), color: fd.get('color'), qtyKg: fd.get('qtyKg'), machine: fd.get('machine'), recipe: fd.get('recipe') } });
      toast('Batch ' + b.id + ' queued — yarn will be issued at start');
      route();
    }
  });
  const sync = () => {
    const o = usable.find(x => x.id === $('#bo').value);
    $('#bc').innerHTML = o.colors.map(c => '<option value="' + esc(c.name) + '">' + esc(c.name) + '</option>').join('');
  };
  $('#bo').addEventListener('change', sync); sync();
}

/* ---------------- shipping ---------------- */

async function viewShipping(view) {
  const { shipments } = await api('/shipments');
  const { orders } = await api('/orders');
  const actionable = can('shipments');
  const modeOf = sh => sh.mode || 'Sea';
  if (!state.shipMode) state.shipMode = 'All';
  const filtered = shipments.filter(sh => state.shipMode === 'All' || modeOf(sh) === state.shipMode);
  const inTransit = shipments.filter(s => s.status === 'In Transit');
  const transitByMode = { Sea: inTransit.filter(s => modeOf(s) === 'Sea').length, Air: inTransit.filter(s => modeOf(s) === 'Air').length, Courier: inTransit.filter(s => modeOf(s) === 'Courier').length };
  const deliveredThisMonth = shipments.filter(s => s.status === 'Delivered' && (s.eta || '').startsWith(new Date().toISOString().slice(0, 7)));

  const cards = shipments.map(s => {
    const next = SHIP_NEXT[s.status];
    const late = s.status !== 'Delivered' && s.eta && daysUntil(s.eta) < 0;
    let actions = '';
    if (actionable && next) actions += '<button class="btn sm primary" data-adv="' + esc(s.id) + '">' + (next === 'Booked' ? (modeOf(s) === 'Sea' ? 'Confirm booking' : modeOf(s) === 'Air' ? 'Confirm AWB' : 'Hand to courier') : next === 'In Transit' ? (modeOf(s) === 'Sea' ? 'On board / sailed' : modeOf(s) === 'Air' ? 'Departed' : 'Picked up') : 'Mark delivered') + '</button>';
    actions += '<button class="btn sm" data-doc="' + esc(s.id) + '" data-type="packing-list">' + ICONS.doc + ' Packing list</button>' +
               '<button class="btn sm" data-doc="' + esc(s.id) + '" data-type="invoice">' + ICONS.doc + ' Invoice</button>';
    const mo = SHIP_MODES[modeOf(s)];
    return '<div class="card" style="border-top:4px solid ' + mo.color + '">' +
      '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap"><b style="font-size:15px">' + esc(s.id) + '</b><span class="pill ' + MODE_PILL[modeOf(s)] + '">' + ICONS[mo.icon] + ' ' + mo.tag + '</span>' + pill(SHIP_PILL, s.status) + (late ? '<span class="due late">ETA passed</span>' : '') + '<span style="margin-left:auto" class="mini">' + esc(s.incoterm) + '</span></div>' +
      '<div class="mini" style="margin:8px 0 2px"><b class="mini b">' + esc(s.orderId) + '</b> (' + esc(s.orderPo || '') + ') · ' + esc(s.buyerName) + '</div>' +
      '<div class="mini">' + esc(s.style) + ' · ' + num(s.orderQty || 0) + ' pcs</div>' +
      '<table class="tbl" style="margin-top:10px"><tbody>' +
        '<tr><td class="mini">Load</td><td class="num"><b>' + num(s.cartons) + '</b> cartons · ' + num(s.cbm) + ' CBM · ' + num(s.grossKg) + ' kg</td></tr>' +
        '<tr><td class="mini">' + (modeOf(s) === 'Sea' ? 'Vessel' : modeOf(s) === 'Air' ? 'Flight' : 'Courier') + '</td><td>' + esc(modeOf(s) === 'Sea' ? (s.vessel || '—') : modeOf(s) === 'Air' ? (s.flightNo || '—') : (s.carrier || '—')) + '<div class="cell-sub">' + (modeOf(s) === 'Sea' ? 'Booking ' + esc(s.booking || '—') : modeOf(s) === 'Air' ? 'AWB ' + esc(s.airwaybill || '—') : 'Tracking ' + esc(s.trackingNo || '—')) + '</div></td></tr>' +
        '<tr><td class="mini">Route</td><td>' + esc(s.portLoading) + ' → ' + esc(s.portDischarge || '—') + '</td></tr>' +
        '<tr><td class="mini">Window</td><td>ETD <b>' + fmtDate(s.etd) + '</b> · ETA <b>' + fmtDate(s.eta) + '</b></td></tr>' +
      '</tbody></table>' +
      '<div class="kb-actions" style="margin-top:6px">' + actions + '</div></div>';
  }).join('');

  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
      '<span class="s-chip"><b class="num">' + inTransit.length + '</b><span>on the water</span></span>' +
      '<span class="s-chip"><b class="num">' + deliveredThisMonth.length + '</b><span>delivered this month</span></span>' +
      '<span class="s-chip"><b class="num">' + num(shipments.reduce((a, s) => a + (s.cartons || 0), 0)) + '</b><span>cartons shipped YTD</span></span>' +
    '</div><span class="spacer"></span>' +
    (actionable ? '<button class="btn primary" id="new-ship">' + ICONS.plus + ' New shipment</button>' : '') + '</div>' +
    '<div class="toolbar"><div class="tabs">' +
    ['All', 'Sea', 'Air', 'Courier'].map(mo2 => '<button class="tab ' + (state.shipMode === mo2 ? 'active' : '') + '" data-shipmode="' + mo2 + '">' + (mo2 === 'All' ? 'All (' + shipments.length + ')' : mo2 === 'Sea' ? ICONS.ship + ' Sea (' + transitByMode.Sea + ' moving)' : mo2 === 'Air' ? ICONS.airplane + ' Air (' + transitByMode.Air + ')' : ICONS.package + ' Courier (' + transitByMode.Courier + ')') + '</button>').join('') +
    '</div></div>' +
    '<div class="grid g-2">' + cards + '</div>';

  view.querySelectorAll('[data-shipmode]').forEach(t => t.addEventListener('click', () => { state.shipMode = t.dataset.shipmode; viewShipping(view); }));
  view.querySelectorAll('[data-adv]').forEach(b => b.addEventListener('click', async () => {
    const s = await api('/shipments/' + b.dataset.adv + '/advance', { method: 'POST' });
    toast('Shipment ' + s.id + ' → ' + s.status);
    viewShipping(view);
  }));
  view.querySelectorAll('[data-doc]').forEach(b => b.addEventListener('click', async () => {
    const res = await fetch('/api/shipments/' + b.dataset.doc + '/docs/' + b.dataset.type, { headers: { Authorization: 'Bearer ' + state.token } });
    const html = await res.text();
    openModal({
      title: (b.dataset.type === 'invoice' ? 'Commercial invoice' : 'Packing list') + ' — ' + b.dataset.doc, wide: true,
      body: '<iframe class="doc-frame" id="docframe"></iframe>',
      onSubmit: null
    });
    const fr = $('#docframe');
    fr.srcdoc = html;
    const foot = modalRoot.querySelector('.modal-foot');
    foot.innerHTML = '<button class="btn" id="doc-print">' + ICONS.print + ' Print / save PDF</button><button class="btn primary" data-close>Close</button>';
    modalRoot.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', closeModal));
    $('#doc-print').addEventListener('click', () => { try { fr.contentWindow.print(); } catch (e) { toast('Printing is blocked in this preview — download the app to print', 'error'); } });
  }));
  const nb = $('#new-ship');
  if (nb) nb.addEventListener('click', () => {
    const usable = orders.filter(o => !['Shipped', 'Delivered'].includes(o.stage));
    if (!usable.length) return toast('No orders ready for shipment', 'error');
    shipmentModal(usable);
  });
}

function shipmentModal(orders) {
  const DEST = ['Toamasina (MGTGA)', 'Antananarivo (TNR)', 'Hamburg (DEHAM)', 'Felixstowe (GBFXT)', 'New York (USNYC)', 'Le Havre (FRLEH)', 'Rotterdam (NLRTM)', 'Copenhagen (DKCPH)', 'Paris CDG (FRCDG)', 'London LHR (GBLHR)', 'Frankfurt (FRA)', 'Dubai DXB (AEDXB)', 'Hong Kong HKG', 'Johannesburg (JNB)'];
  openModal({
    title: 'New shipment — choose the mode', wide: true, submitText: 'Open shipment & start packing',
    body: '<div class="hint">' + ICONS.ship + ' <b>Sea</b> = full containers (vessel + booking). ' + ICONS.airplane + ' <b>Air</b> = rush orders (flight + AWB). ' + ICONS.package + ' <b>Courier</b> = samples, docs & top-ups (DHL/FedEx + tracking).</div>' +
      '<div class="field"><label>Transport mode</label><div class="tabs" id="ship-mode-tabs">' +
      ['Sea', 'Air', 'Courier'].map((m2, i) => '<button type="button" class="tab' + (i === 0 ? ' active' : '') + '" data-mode="' + m2 + '">' + ICONS[SHIP_MODES[m2].icon] + ' ' + m2 + '</button>').join('') +
      '</div><input type="hidden" name="mode" id="ship-mode" value="Sea"></div>' +
      '<div class="field"><label>Order <span class="req">*</span></label><select name="orderId">' + orders.map(o => '<option value="' + o.id + '">' + o.id + ' — ' + esc(o.style) + ' (' + esc(o.stage) + ')</option>').join('') + '</select></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Cartons</label><input name="cartons" type="number" min="1" value="400"></div>' +
      '<div class="field"><label id="lbl-cbm">' + ICONS.ship + ' Volume (CBM)</label><input name="cbm" type="number" step="0.1" min="0" value="52"></div>' +
      '<div class="field"><label>Gross weight (kg)</label><input name="grossKg" type="number" min="0" value="6300"></div>' +
      '<div class="field"><label>Incoterm</label><select name="incoterm"><option>FOB</option><option>CIF</option><option>EXW</option><option>DDP</option></select></div>' +
      '</div>' +
      '<div id="f-sea"><div class="form-grid">' +
      '<div class="field"><label>Vessel / Voyage</label><input name="vessel" placeholder="Maersk Sentosa V.418E"></div>' +
      '<div class="field"><label>Booking no.</label><input name="booking" placeholder="MAEU8811204"></div>' +
      '</div></div>' +
      '<div id="f-air" style="display:none"><div class="form-grid">' +
      '<div class="field"><label>Flight / Voyage</label><input name="flightNo" placeholder="ET852 TNR→CDG"></div>' +
      '<div class="field"><label>AWB no.</label><input name="airwaybill" placeholder="071-88234761"></div>' +
      '</div></div>' +
      '<div id="f-courier" style="display:none"><div class="form-grid">' +
      '<div class="field"><label>Courier</label><select name="carrier"><option>DHL</option><option>FedEx</option><option>UPS</option><option>Aramex</option><option>TNT</option></select></div>' +
      '<div class="field"><label>Tracking no.</label><input name="trackingNo" placeholder="JD014600003812345678"></div>' +
      '</div></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Origin</label><input name="portLoading" value="Toamasina (MGTGA)"></div>' +
      '<div class="field"><label>Destination</label><input name="portDischarge" list="dest-dl" placeholder="port or airport"><datalist id="dest-dl">' + DEST.map(dd => '<option value="' + dd + '">').join('') + '</datalist></div>' +
      '<div class="field"><label>Departure (ETD)</label><input name="etd" type="date"></div>' +
      '<div class="field"><label>Arrival (ETA)</label><input name="eta" type="date"></div>' +
      '<div class="field full"><label>Note</label><input name="note" placeholder="e.g. rush 1,200 pcs — buyer launch deadline"></div>' +
      '</div>',
    onSubmit: async fd => {
      const body = Object.fromEntries(fd);
      const s = await api('/shipments', { method: 'POST', body });
      toast('Shipment ' + s.id + ' opened — ' + s.mode + ' mode, packing floor notified');
      route();
    }
  });
  document.querySelectorAll('#ship-mode-tabs .tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('#ship-mode-tabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const m2 = t.dataset.mode;
    $('#ship-mode').value = m2;
    $('#f-sea').style.display = m2 === 'Sea' ? '' : 'none';
    $('#f-air').style.display = m2 === 'Air' ? '' : 'none';
    $('#f-courier').style.display = m2 === 'Courier' ? '' : 'none';
    $('#lbl-cbm').innerHTML = (m2 === 'Courier' ? ICONS.package : m2 === 'Air' ? ICONS.airplane : ICONS.ship) + (m2 === 'Courier' ? ' Packages' : ' Volume (CBM)');
    const cart = modalRoot.querySelector('[name=cartons]');
    if (cart) cart.value = m2 === 'Courier' ? 1 : m2 === 'Air' ? 22 : 400;
  }));
}

/* ---------------- inventory ---------------- */

async function viewInventory(view) {
  const { materials } = await api('/materials');
  const cats = ['All'].concat([...new Set(materials.map(m => m.category))]);
  const list = materials.filter(m => state.invCat === 'All' || m.category === state.invCat);
  const totalValue = materials.reduce((s, m) => s + m.stock * m.cost, 0);
  const lowCount = materials.filter(m => m.stock < m.reorder).length;
  const colorFor = c => ({ Yarn: '#6366f1', Dye: '#8b5cf6', Chemical: '#06b6d4', Accessory: '#f59e0b' }[c] || '#64748b');

  const rows = list.map(mm => {
    const low = mm.stock < mm.reorder;
    const pct = Math.min(100, mm.stock / (mm.reorder * 2) * 100);
    return '<tr><td><div class="cell-main">' + esc(mm.code) + '</div><div class="cell-sub">' + esc(mm.category) + '</div></td>' +
      '<td class="cell-main">' + esc(mm.name) + '</td>' +
      '<td><div style="display:flex;align-items:center;gap:9px"><span class="num" style="min-width:86px;font-weight:700">' + num(mm.stock) + ' ' + esc(mm.unit) + '</span><span class="inv-bar" style="flex:1"><i style="width:' + pct + '%;background:' + (low ? 'var(--red)' : colorFor(mm.category)) + '"></i></span></div></td>' +
      '<td class="num">' + num(mm.reorder) + '</td>' +
      '<td class="num">$' + mm.cost.toFixed(mm.cost < 0.05 ? 3 : 2) + '</td>' +
      '<td class="num">' + money(mm.stock * mm.cost) + '</td>' +
      '<td>' + (low ? '<span class="pill p-red">Below reorder</span>' : '<span class="pill p-green">OK</span>') + '</td>' +
      '<td>' + (can('materials') ? '<button class="btn sm" data-adj="' + esc(mm.id) + '" data-unit="' + esc(mm.unit) + '" data-name="' + esc(mm.name) + '">Adjust</button>' : '') + '</td></tr>';
  }).join('');

  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
      '<span class="s-chip"><b class="num">' + money(totalValue) + '</b><span>stock value</span></span>' +
      '<span class="s-chip"><b class="num">' + materials.length + '</b><span>SKUs tracked</span></span>' +
      '<span class="s-chip"><b class="num" style="color:' + (lowCount ? 'var(--red)' : 'var(--green)') + '">' + lowCount + '</b><span>below reorder</span></span>' +
    '</div><span class="spacer"></span>' + cats.map(c => '<button class="chip ' + (state.invCat === c ? 'active' : '') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>' +
    '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Code</th><th>Material</th><th>Stock vs reorder</th><th class="r">Reorder at</th><th class="r">Unit cost</th><th class="r">Value</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>';

  view.querySelectorAll('[data-cat]').forEach(c => c.addEventListener('click', () => { state.invCat = c.dataset.cat; viewInventory(view); }));
  view.querySelectorAll('[data-adj]').forEach(b => b.addEventListener('click', () => {
    openModal({
      title: 'Adjust stock — ' + b.dataset.name, submitText: 'Apply',
      body: '<div class="field"><label>Movement</label><select name="dir"><option value="1">Receive (+)</option><option value="-1">Issue (−)</option></select></div>' +
        '<div class="field"><label>Quantity (' + b.dataset.unit + ')</label><input name="qty" type="number" min="0" step="any" required></div>' +
        '<div class="field"><label>Note</label><input name="note" placeholder="e.g. physical count correction"></div>',
      onSubmit: async fd => {
        const q = Number(fd.get('qty')) || 0;
        await api('/materials/' + b.dataset.adj, { method: 'PATCH', body: { delta: q * Number(fd.get('dir')), note: fd.get('note') } });
        toast('Stock updated — activity logged');
        viewInventory(view);
      }
    });
  }));
}

/* ---------------- directory ---------------- */

async function viewDirectory(view) {
  const [{ users }, { buyers }, { suppliers }, { settings }, hr] = await Promise.all([api('/users'), api('/buyers'), api('/suppliers'), api('/settings'), api('/hr')]);
  const payrollByDept = hr.byDept || {};
  const depts = ['Management', 'Merchandising', 'Purchase', 'Dye House', 'Production', 'Quality Control', 'Shipping', 'Human Resources', 'Finance'];
  const icons = { Management: ICONS.dashboard, Merchandising: ICONS.orders, Purchase: ICONS.purchase, 'Dye House': ICONS.dye, Production: ICONS.production, 'Quality Control': ICONS.quality, Shipping: ICONS.shipping, 'Human Resources': ICONS.hr, Finance: ICONS.finance };

  const deptCards = depts.map(dp => {
    const members = users.filter(u => u.dept === dp);
    const payroll = (payrollByDept[dp] || {}).payroll || 0;
    const c = DEPT_COLORS[dp] || '#6366f1';
    return '<div class="card org-card" style="--oc:' + c + '">' +
      '<div class="org-head"><span class="org-ic" style="background:' + c + '">' + (icons[dp] || '') + '</span>' +
      '<div style="flex:1;min-width:0"><b>' + dp + '</b><div class="mini">' + members.length + ' on the desk · ' + money(payroll) + '/mo payroll</div></div></div>' +
      members.slice(0, 3).map(u => '<div class="member"><span class="avatar" style="background:' + c + ';width:26px;height:26px;font-size:10px">' + esc(initials(u.name)) + '</span><div style="flex:1;min-width:0"><div class="m-n" style="font-size:12px">' + esc(u.name) + '</div><div class="m-t">' + esc(u.title) + '</div></div></div>').join('') +
      (members.length > 3 ? '<div class="mini" style="margin-top:6px">+' + (members.length - 3) + ' more…</div>' : '') +
      '</div>';
  }).join('');

  const buyerRows = buyers.map(b => '<tr><td class="cell-main">' + esc(b.name) + '</td><td>' + esc(b.country) + '</td><td>' + esc(b.contact) + '</td><td class="mini">' + esc(b.email) + '</td></tr>').join('');
  const supRows = suppliers.map(sp => '<tr><td class="cell-main">' + esc(sp.name) + '</td><td>' + esc(sp.type) + '</td><td>' + esc(sp.location) + '</td><td><span class="pill p-amber">★ ' + sp.rating + '</span></td></tr>').join('');

  view.innerHTML =
    '<div class="card mb"><div class="org-profile">' +
    '<div class="op-logo">' + ICONS.logo + '</div>' +
    '<div style="flex:1;min-width:240px"><b style="font-size:17px">' + esc(settings.name) + '</b><div class="mini" style="margin-top:3px">' + esc(settings.address) + '</div>' +
    '<div class="mini">' + esc(settings.phone) + ' · ' + esc(settings.email) + ' · ' + esc(settings.vat) + '</div></div>' +
    '<div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + hr.employees.length + '</b><span>employees</span></span>' +
    '<span class="s-chip"><b class="num">' + money(hr.totalPayroll) + '</b><span>monthly payroll</span></span>' +
    '<span class="s-chip"><b class="num">' + buyers.length + '</b><span>buyers</span></span>' +
    '<span class="s-chip"><b class="num">' + suppliers.length + '</b><span>suppliers</span></span>' +
    '</div></div></div>' +
    '<div class="hint mb">' + ICONS.users + ' <b>One roof, one truth.</b> Nine departments working the same live data — merchandising to dispatch, everyone under this roof.</div>' +
    '<h3 style="margin:0 0 10px;font-size:13px;color:var(--mut);letter-spacing:.5px;text-transform:uppercase">Departments</h3>' +
    '<div class="org-grid mb">' + deptCards + '</div>' +
    '<div class="grid g-2">' +
    '<div class="card"><div class="card-head"><span class="card-title">Our buyers — ' + buyers.length + '</span><span class="right"><button class="linklike" data-go="#/orders">Their orders ' + ICONS.arrow + '</button></span></div>' +
    '<table class="tbl"><thead><tr><th>Buyer</th><th>Country</th><th>Contact</th><th>Email</th></tr></thead><tbody>' + buyerRows + '</tbody></table></div>' +
    '<div class="card"><div class="card-head"><span class="card-title">Approved suppliers — ' + suppliers.length + '</span><span class="right"><button class="linklike" data-go="#/purchase">Purchase desk ' + ICONS.arrow + '</button></span></div>' +
    '<table class="tbl"><thead><tr><th>Supplier</th><th>Type</th><th>Location</th><th>Rating</th></tr></thead><tbody>' + supRows + '</tbody></table></div>' +
    '</div>';
  view.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => { location.hash = el.dataset.go; }));
}

/* ---------------- activity ---------------- */

async function viewActivity(view) {
  const { activity } = await api('/activity');
  const depts = ['All'].concat([...new Set(activity.map(a => a.dept))]);
  const list = activity.filter(a => state.activityDept === 'All' || a.dept === state.activityDept);
  view.innerHTML =
    '<div class="toolbar">' + depts.map(d => '<button class="chip ' + (state.activityDept === d ? 'active' : '') + '" data-dept="' + esc(d) + '">' + esc(d) + '</button>').join('') + '</div>' +
    '<div class="card">' + (list.map(a => feedItem(a, true)).join('') || '<div class="empty">Nothing yet from this department.</div>') + '</div>';
  view.querySelectorAll('[data-dept]').forEach(c => c.addEventListener('click', () => { state.activityDept = c.dataset.dept; viewActivity(view); }));
}


/* ---------------- sampling ---------------- */

function sampleModal(orders) {
  const usable = orders.filter(o => !['Shipped', 'Delivered'].includes(o.stage));
  if (!usable.length) return toast('No orders available for sampling', 'error');
  openModal({
    title: 'Request sample — Sampling desk', submitText: 'Create sample request',
    body: '<div class="field"><label>Order <span class="req">*</span></label><select name="orderId">' + usable.map(o => '<option value="' + o.id + '">' + o.id + ' — ' + esc(o.style) + '</option>').join('') + '</select></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Sample type</label><select name="type"><option>Proto Sample</option><option>Fit Sample</option><option>PP Sample</option><option>TOP Sample</option><option>Shipment Sample</option></select></div>' +
      '<div class="field"><label>Courier date (optional)</label><input type="date" name="sentDate"></div>' +
      '</div><div class="field"><label>Note</label><input name="note" placeholder="e.g. buyer asked for a lighter shade"></div>',
    onSubmit: async fd => {
      const sm = await api('/samples', { method: 'POST', body: { orderId: fd.get('orderId'), type: fd.get('type'), sentDate: fd.get('sentDate'), note: fd.get('note') } });
      toast('Sample ' + sm.id + ' created — status ' + sm.status);
      route();
    }
  });
}

async function viewSampling(view) {
  const [{ samples }, { orders }] = await Promise.all([api('/samples'), api('/orders')]);
  const editable = can('samples');
  const open = samples.filter(x => ['Requested', 'Sent', 'Comments'].includes(x.status)).length;
  const approved = samples.filter(x => x.status === 'Approved').length;
  // Dalang-style sampling fast-lane: SLA days per sample type
  const SLA = { 'Proto Sample': 3, 'Fit Sample': 5, 'PP Sample': 7, 'TOP Sample': 7, 'Shipment Sample': 3 };
  const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
  const slaCell = sm => {
    if (!sm.sentDate || sm.status === 'Approved') {
      if (sm.status === 'Approved' && sm.sentDate && sm.approvedDate) {
        const d = daysBetween(sm.sentDate, sm.approvedDate);
        const sla = SLA[sm.type] || 5;
        return d <= sla ? '<span class="due ok">' + d + 'd ✓</span>' : '<span class="due late">' + d + 'd late</span>';
      }
      return '<span class="mini">—</span>';
    }
    const sla = SLA[sm.type] || 5;
    const elapsed = daysBetween(sm.sentDate, new Date().toISOString().slice(0, 10));
    const left = sla - elapsed;
    if (left < 0) return '<span class="due late">' + Math.abs(left) + 'd late</span>';
    if (left <= 1) return '<span class="due warn">' + left + 'd left</span>';
    return '<span class="due ok">' + left + 'd left</span>';
  };
  const lateCount = samples.filter(x => ['Sent', 'Comments'].includes(x.status) && x.sentDate && daysBetween(x.sentDate, new Date().toISOString().slice(0, 10)) > (SLA[x.type] || 5)).length;
  const approvedOnTime = samples.filter(x => x.status === 'Approved' && x.sentDate && x.approvedDate);
  const onTimePct = approvedOnTime.length ? Math.round(approvedOnTime.filter(x => daysBetween(x.sentDate, x.approvedDate) <= (SLA[x.type] || 5)).length / approvedOnTime.length * 100) : null;
  const rows = samples.map(sm =>
    '<tr><td><div class="cell-main">' + esc(sm.id) + '</div><div class="cell-sub">' + esc(sm.type) + '</div></td>' +
    '<td><a href="#/orders/' + esc(sm.orderId) + '" class="cell-main">' + esc(sm.orderId) + '</a><div class="cell-sub">' + esc(sm.style) + ' · ' + esc(sm.buyerName) + '</div></td>' +
    '<td>' + pill(SAMPLE_PILL, sm.status) + '</td>' +
    '<td>' + fmtDate(sm.sentDate) + '</td><td>' + fmtDate(sm.approvedDate) + '</td>' +
    '<td>' + slaCell(sm) + '</td>' +
    '<td class="mini">' + esc(sm.note || '—') + '</td>' +
    '<td>' + (editable ? (
      sm.status === 'Approved' ? '<span class="mini">sealed ✓</span>' :
      '<div style="display:flex;gap:5px;flex-wrap:wrap">' +
      (sm.status === 'Requested' ? '<button class="btn sm dark" data-send="' + esc(sm.id) + '">Mark sent</button>' : '') +
      '<button class="btn sm green" data-status="Approved" data-id="' + esc(sm.id) + '">Approve</button>' +
      (sm.status !== 'Comments' ? '<button class="btn sm" style="border-color:#fde68a;color:#b45309" data-status="Comments" data-id="' + esc(sm.id) + '">Comments</button>' : '') +
      '<button class="btn sm red" data-status="Rejected" data-id="' + esc(sm.id) + '">Reject</button></div>'
    ) : '') + '</td></tr>'
  ).join('');
  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + open + '</b><span>in approval flow</span></span>' +
    '<span class="s-chip"><b class="num">' + approved + '</b><span>approved seals</span></span>' +
    '<span class="s-chip"><b class="num" style="color:' + (onTimePct != null && onTimePct >= 80 ? 'var(--green)' : '#b45309') + '">' + (onTimePct != null ? onTimePct + '%' : '—') + '</b><span>SLA on-time rate</span></span>' +
    '<span class="s-chip"><b class="num" style="color:' + (lateCount ? 'var(--red)' : 'var(--ink)') + '">' + lateCount + '</b><span>past SLA — chase buyer</span></span>' +
    '</div><span class="spacer"></span>' +
    (editable ? '<button class="btn primary" id="new-sample">' + ICONS.plus + ' Request sample</button>' : '') + '</div>' +
    '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Sample</th><th>Order / Buyer</th><th>Status</th><th>Sent</th><th>Approved</th><th>SLA</th><th>Note</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="8"><div class="empty">No samples yet.</div></td></tr>') + '</tbody></table></div></div>';
  view.querySelectorAll('[data-send]').forEach(b => b.addEventListener('click', async () => {
    await api('/samples/' + b.dataset.send, { method: 'PATCH', body: { sentDate: new Date().toISOString().slice(0, 10) } });
    toast('Sample marked as sent to buyer');
    viewSampling(view);
  }));
  view.querySelectorAll('[data-status]').forEach(b => b.addEventListener('click', async () => {
    await api('/samples/' + b.dataset.id, { method: 'PATCH', body: { status: b.dataset.status } });
    toast('Sample → ' + b.dataset.status, b.dataset.status === 'Rejected' ? 'error' : 'success');
    viewSampling(view);
  }));
  const nb = $('#new-sample');
  if (nb) nb.addEventListener('click', () => sampleModal(orders));
}

/* ---------------- production ---------------- */

function productionOpenModal(orders) {
  return api('/machines').then(({ machines }) => {
    const knits = machines.filter(mc => mc.type === 'Knitting');
    openModal({
      title: 'Open production order — Floors', submitText: 'Open & start',
      body: '<div class="hint">Logging output updates the floor bars live; completing the order hands it to <b>Packing</b> automatically.</div>' +
        '<div class="field"><label>Order <span class="req">*</span></label><select name="orderId">' + orders.map(o => '<option value="' + o.id + '">' + o.id + ' — ' + esc(o.style) + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>Target pcs (blank = order quantity)</label><input name="target" type="number" min="1" placeholder="auto"></div>' +
        '<div class="field"><label>Assign knitting machines</label><div style="display:flex;gap:8px;flex-wrap:wrap">' +
        knits.map(mc => '<label class="swatch" style="cursor:pointer"><input type="checkbox" name="mach" value="' + esc(mc.code) + '" style="accent-color:var(--primary)"> ' + esc(mc.code) + ' · ' + esc(mc.gauge) + '</label>').join('') +
        '</div></div>',
      onSubmit: async fd => {
        const pr = await api('/production', { method: 'POST', body: { orderId: fd.get('orderId'), target: fd.get('target'), machines: fd.getAll('mach') } });
        toast('Production order ' + pr.id + ' opened — floors notified');
        route();
      }
    });
  });
}

function logModal(prodId, floor) {
  openModal({
    title: 'Log production output', submitText: 'Log pcs',
    body: '<div class="form-grid">' +
      '<div class="field"><label>Floor</label><select name="floor">' + ['Knitting', 'Cutting', 'Sewing', 'Finishing'].map(f => '<option' + (f === floor ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Pieces produced</label><input name="pcs" type="number" min="1" value="500" required></div>' +
      '<div class="field full"><label>Date</label><input name="date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>',
    onSubmit: async fd => {
      await api('/production/' + prodId + '/log', { method: 'POST', body: { floor: fd.get('floor'), pcs: fd.get('pcs'), date: fd.get('date') } });
      toast('Output logged — progress updated');
      route();
    }
  });
}

async function viewProduction(view) {
  const [{ production, capacity }, { machines }, { orders }] = await Promise.all([api('/production'), api('/machines'), api('/orders')]);
  const editable = can('production');
  const open = production.filter(p => p.status !== 'Done');
  const done = production.filter(p => p.status === 'Done');
  const todayKey = new Date().toISOString().slice(0, 10);
  const pcsToday = production.reduce((s, p) => s + p.logs.filter(l => l.date === todayKey).reduce((a, l) => a + l.pcs, 0), 0);
  const knitting = machines.filter(mc => mc.type === 'Knitting');
  const runningKnit = knitting.filter(mc => mc.status === 'Running').length;

  const card = pr => {
    const floors = [['Knitting', pr.knit], ['Cutting', pr.cut], ['Sewing', pr.sew], ['Finishing', pr.finish]];
    const pct = pr.target ? Math.round(pr.finish / pr.target * 100) : 0;
    const nextFloor = (floors.find(f => f[1] < pr.target) || floors[3])[0];
    return '<div class="card" style="border-left:4px solid #ea580c">' +
      '<div style="display:flex;gap:9px;align-items:center;flex-wrap:wrap"><b style="font-size:15px">' + esc(pr.id) + '</b><span class="mini b"><a href="#/orders/' + esc(pr.orderId) + '">' + esc(pr.orderId) + '</a></span>' + (pr.status === 'Done' ? '<span class="pill p-green">Done</span>' : '<span class="pill p-orange">' + pct + '% finished</span>') + '</div>' +
      '<div class="mini" style="margin:6px 0 10px">' + esc(pr.style) + ' · target ' + num(pr.target) + ' pcs · started ' + fmtDate(pr.startedAt) + ' · ' + esc(pr.machines.join(', ') || 'no machines assigned') + '</div>' +
      floors.map(f => '<div class="pipe-row sm"><span class="pl">' + f[0] + '</span><div class="pipe-bar"><div class="pipe-fill" style="width:' + Math.min(100, pr.target ? f[1] / pr.target * 100 : 0) + '%;background:' + (pr.target && f[1] >= pr.target ? 'var(--green)' : '#ea580c') + '"></div></div><span class="pc num">' + num(f[1]) + '</span></div>').join('') +
      (editable && pr.status !== 'Done' ? '<div class="kb-actions" style="margin-top:10px"><button class="btn sm primary" data-log="' + esc(pr.id) + '" data-floor="' + nextFloor + '">Log output</button><button class="btn sm green" data-done="' + esc(pr.id) + '">Complete → Packing</button></div>' : '') +
      (pr.logs.length ? '<div class="mini" style="margin-top:9px">Last: ' + pr.logs.slice(0, 3).map(l => esc(l.floor) + ' +' + num(l.pcs) + ' (' + esc(l.date) + ')').join(' · ') + '</div>' : '') +
      '</div>';
  };

  const machCards = knitting.map(mc =>
    '<div class="card" style="padding:12px 14px"><div style="display:flex;align-items:center;gap:8px"><b>' + esc(mc.code) + '</b>' + pill(MACH_PILL, mc.status) + '<span class="mini" style="margin-left:auto">' + esc(mc.gauge) + '</span></div>' +
    '<div class="mini" style="margin-top:5px">' + esc(mc.model) + '</div>' +
    '<div class="mini">assigned: <b>' + esc(mc.assigned || '—') + '</b></div>' +
    (editable ? '<select class="btn sm" style="margin-top:8px;width:100%" data-mach="' + esc(mc.id) + '">' + ['Running', 'Idle', 'Maintenance'].map(st => '<option' + (mc.status === st ? ' selected' : '') + '>' + st + '</option>').join('') + '</select>' : '') +
    '</div>').join('');

  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + open.length + '</b><span>WIP orders</span></span>' +
    '<span class="s-chip"><b class="num">' + num(pcsToday) + '</b><span>pcs logged today</span></span>' +
    '<span class="s-chip"><b class="num">' + runningKnit + '/' + knitting.length + '</b><span>knit machines running</span></span>' +
    '</div><span class="spacer"></span>' +
    (editable ? '<button class="btn" id="make-bundles">' + ICONS.barcode + ' Create scan bundles</button> <button class="btn primary" id="new-prod">' + ICONS.plus + ' Open production order</button>' : '') + '</div>' +
    '<div class="card mb"><div class="card-head"><span class="card-title">Knitting capacity planner</span><span class="right mini">machine-hours booked vs available</span></div>' +
    '<div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + (capacity ? capacity.machines : '—') + '</b><span>knit machines</span></span>' +
    '<span class="s-chip"><b class="num">' + (capacity ? num(capacity.availableHoursWeek) : '—') + ' h</b><span>available / week</span></span>' +
    '<span class="s-chip"><b class="num">' + (capacity ? num(capacity.bookedHours) : '—') + ' h</b><span>booked by open orders</span></span>' +
    '<span class="s-chip"><b class="num" style="color:' + (capacity && capacity.weeklyLoadPct > 85 ? 'var(--red)' : capacity && capacity.weeklyLoadPct > 65 ? '#b45309' : 'var(--green)') + '">' + (capacity ? capacity.weeklyLoadPct : '—') + '%</b><span>load on week 1 capacity</span></span>' +
    '<span class="s-chip"><b class="num">' + (capacity ? capacity.weeksToClear : '—') + ' wks</b><span>to clear the backlog</span></span>' +
    '</div>' +
    (capacity ? '<div class="inv-bar" style="height:10px;margin-top:10px"><i style="width:' + capacity.weeklyLoadPct + '%;background:' + (capacity.weeklyLoadPct > 85 ? 'var(--red)' : capacity.weeklyLoadPct > 65 ? 'var(--amber)' : 'var(--green)') + '"></i></div>' : '') +
    '</div>' +
    '<div class="grid g-2">' + (open.map(card).join('') || '<div class="card empty">No production running — open a production order from a Fabric Ready / Production order.</div>') + '</div>' +
    (done.length ? '<h3 style="margin:18px 0 10px;font-size:14px;color:var(--mut)">Completed</h3><div class="grid g-2">' + done.map(card).join('') + '</div>' : '') +
    '<h3 style="margin:22px 0 10px;font-size:14px;color:var(--mut)">Knitting machine registry</h3><div class="mach-grid">' + machCards + '</div>';

  view.querySelectorAll('[data-log]').forEach(b => b.addEventListener('click', () => logModal(b.dataset.log, b.dataset.floor)));
  view.querySelectorAll('[data-done]').forEach(b => b.addEventListener('click', async () => {
    try {
      await api('/production/' + b.dataset.done + '/complete', { method: 'POST' });
      toast('Production complete — order handed to Packing');
      viewProduction(view);
    } catch (e) { toast(e.message, 'error'); }
  }));
  view.querySelectorAll('[data-mach]').forEach(sel => sel.addEventListener('change', async () => {
    await api('/machines/' + sel.dataset.mach, { method: 'PATCH', body: { status: sel.value } });
    toast('Machine → ' + sel.value);
    viewProduction(view);
  }));
  const mb = $('#make-bundles');
  if (mb) mb.addEventListener('click', () => bundlesModal(orders));
  const nb = $('#new-prod');
  if (nb) nb.addEventListener('click', async () => {
    const { orders: fresh } = await api('/orders');
    const usable = fresh.filter(o => ['Fabric Ready', 'Production', 'Packing'].includes(o.stage));
    if (!usable.length) return toast('No orders ready for production', 'error');
    productionOpenModal(usable);
  });
}

/* ---------- bundles & scan station ---------- */

function bundlesModal(orders) {
  const usable = orders.filter(o => ['Fabric Ready', 'Production', 'Packing'].includes(o.stage));
  if (!usable.length) return toast('No orders in production to bundle', 'error');
  openModal({
    title: 'Create scan bundles', submitText: 'Create bundles',
    body: '<div class="hint">Each bundle gets a <b>barcode</b>. Print it, tie it to the bundle — the floor scans it at every step (knit → cut → sew → finish) and KnitFlow counts pieces live.</div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Order <span class="req">*</span></label><select name="orderId">' + usable.map(o => '<option value="' + o.id + '">' + o.id + ' — ' + esc(o.style) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Pieces per bundle</label><input name="qty" type="number" min="1" value="100"></div>' +
      '<div class="field full"><label>How many bundles</label><input name="count" type="number" min="1" max="50" value="5"></div>' +
      '</div>',
    onSubmit: async fd => {
      const r = await api('/bundles', { method: 'POST', body: Object.fromEntries(fd) });
      toast(r.created.length + ' bundles created — barcodes ready');
      route();
    }
  });
}

async function viewScan(view) {
  const [{ bundles, workers }, { orders }, { employees }] = await Promise.all([api('/bundles'), api('/orders'), api('/hr')]);
  const editable = can('production');
  const totalPcs7 = workers.reduce((s, w) => s + w.pcs, 0);
  const scannedToday = bundles.reduce((s, b) => s + (b.scans || []).filter(x => x.date === new Date().toISOString().slice(0, 10)).reduce((a, x) => a + x.pcs, 0), 0);

  const FLOORS = ['Knitting', 'Cutting', 'Sewing', 'Finishing'];
  const rows = bundles.slice(0, 30).map(bd =>
    '<tr><td><span class="mono b">' + esc(bd.barcode) + '</span><div class="cell-sub">' + esc(bd.id) + '</div></td>' +
    '<td><div class="cell-main">' + esc(bd.orderId) + '</div><div class="cell-sub">' + esc(bd.style) + '</div></td>' +
    '<td class="num">' + num(bd.qty) + '</td>' +
    '<td><div class="floor-dots">' + FLOORS.map(f => {
      const done = (bd.floorsDone && bd.floorsDone[f]) || 0;
      const full = done >= bd.qty;
      return '<span class="fdot' + (full ? ' full' : done > 0 ? ' part' : '') + '" title="' + f + ': ' + done + '/' + bd.qty + '">' + f[0] + '</span>';
    }).join('') + '</div><div class="cell-sub">' + FLOORS.map(f => f[0] + ' ' + ((bd.floorsDone && bd.floorsDone[f]) || 0)).join(' · ') + '</div></td>' +
    '<td><span class="pill ' + (bd.position === 'Finishing' ? 'p-green' : bd.position === 'Not started' ? 'p-slate' : 'p-blue') + '">' + esc(bd.position) + '</span></td>' +
    '</tr>'
  ).join('');
  const workerRows = workers.slice(0, 10).map(w =>
    '<tr><td><div class="cell-main">' + esc(w.worker) + '</div><div class="cell-sub">' + Object.entries(w.floors).map(e => e[0] + ': ' + num(e[1])).join(' · ') + '</div></td>' +
    '<td class="num"><b>' + num(w.pcs) + '</b> pcs</td></tr>'
  ).join('');

  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + num(scannedToday) + '</b><span>pcs scanned today</span></span>' +
    '<span class="s-chip"><b class="num">' + num(totalPcs7) + '</b><span>pcs scanned (7 days)</span></span>' +
    '<span class="s-chip"><b class="num">' + bundles.length + '</b><span>bundles tracked</span></span>' +
    '</div><span class="spacer"></span>' +
    (editable ? '<button class="btn primary" id="make-bundles2">' + ICONS.barcode + ' Create bundles</button>' : '') + '</div>' +
    '<div class="grid g-2 mb">' +
    '<div class="card"><div class="card-head"><span class="card-title">Scan station</span><span class="right mini">knit → cut → sew → finish</span></div>' +
    (editable ?
      '<div class="field"><label>Barcode</label><input id="scan-bc" class="scan-big" placeholder="scan or type… e.g. 900001" autocomplete="off"></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label>Floor</label><select id="scan-floor">' + FLOORS.map(f => '<option>' + f + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Pieces</label><input id="scan-pcs" type="number" min="1" value="100"></div>' +
      '</div>' +
      '<div class="field"><label>Worker</label><input id="scan-worker" list="workers-dl" placeholder="name"><datalist id="workers-dl">' + employees.map(e => '<option value="' + esc(e.name) + '">').join('') + '</datalist></div>' +
      '<button class="btn primary" id="scan-btn" style="width:100%;justify-content:center;padding:12px;font-size:15px">' + ICONS.check + ' Scan pieces</button>' +
      '<div id="scan-result" class="mini" style="margin-top:10px"></div>'
      : '<div class="empty">Production department can scan.</div>') +
    '</div>' +
    '<div class="card"><div class="card-head"><span class="card-title">Worker efficiency — 7 days</span></div>' +
    (workerRows ? '<table class="tbl"><thead><tr><th>Worker</th><th class="r">Output</th></tr></thead><tbody>' + workerRows + '</tbody></table>' : '<div class="empty">No scans yet this week.</div>') +
    '</div></div>' +
    '<div class="card"><div class="card-head"><span class="card-title">Bundles in the factory</span></div>' +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Barcode</th><th>Order</th><th class="r">Pcs</th><th>Floor progress</th><th>Position</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="5"><div class="empty">No bundles yet — create some from an order in production.</div></td></tr>') +
    '</tbody></table></div></div>';

  const mb2 = $('#make-bundles2');
  if (mb2) mb2.addEventListener('click', () => bundlesModal(orders));
  const doScan = async () => {
    const bc = $('#scan-bc').value.trim();
    if (!bc) { $('#scan-result').innerHTML = '<span style="color:var(--red)">Type or scan a barcode first</span>'; return; }
    try {
      const r = await api('/scan', { method: 'POST', body: { barcode: bc, floor: $('#scan-floor').value, pcs: $('#scan-pcs').value, worker: $('#scan-worker').value } });
      $('#scan-result').innerHTML = '<span style="color:var(--green)">✓ ' + num($('#scan-pcs').value || 0) + ' pcs at ' + $('#scan-floor').value + ' — bundle ' + r.bundle.id + (r.prodUpdated ? ' · production counters updated' : '') + '</span>';
      toast('Scan saved — ' + $('#scan-floor').value + ' +' + $('#scan-pcs').value + ' pcs');
      setTimeout(() => viewScan(view), 600);
    } catch (e) {
      $('#scan-result').innerHTML = '<span style="color:var(--red)">' + esc(e.message) + '</span>';
    }
  };
  const sb = $('#scan-btn');
  if (sb) { sb.addEventListener('click', doScan); $('#scan-bc').addEventListener('keydown', e => { if (e.key === 'Enter') doScan(); }); $('#scan-bc').focus(); }
}

/* ---------- machine board ---------- */

async function viewMachineBoard(view) {
  const { machines } = await api('/machines');
  const editable = can('machines');
  const knit = machines.filter(m => m.type === 'Knitting');
  const avgUtil = knit.length ? Math.round(knit.reduce((s, m) => s + m.stats.utilization, 0) / knit.length) : 0;
  const pcsToday = knit.reduce((s, m) => s + m.stats.pcsToday, 0);
  const downH = knit.reduce((s, m) => s + m.stats.downHours7, 0);
  const utilColor = u => u >= 80 ? 'var(--green)' : u >= 55 ? '#b45309' : 'var(--red)';

  const cards = knit.map(mc => {
    const st = mc.stats;
    const todayPct = st.targetToday ? Math.min(100, Math.round(st.pcsToday / st.targetToday * 100)) : 0;
    const downs = st.lastEvents.filter(e => e.type === 'down').slice(0, 2);
    return '<div class="card" style="border-top:4px solid ' + (mc.status === 'Running' ? '#10b981' : mc.status === 'Maintenance' ? '#ef4444' : '#94a3b8') + '">' +
      '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="font-size:15px">' + esc(mc.code) + '</b>' + pill(MACH_PILL, mc.status) + '<span class="mini" style="margin-left:auto">' + esc(mc.assigned || 'unassigned') + '</span></div>' +
      '<div class="mini" style="margin:4px 0 8px">' + esc(mc.model) + ' · ' + esc(mc.gauge) + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:8px"><span class="num" style="font-size:30px;font-weight:800;color:' + utilColor(st.utilization) + '">' + st.utilization + '%</span><span class="mini">7-day utilization</span></div>' +
      '<div class="mini" style="margin:7px 0 3px">Today: <b class="num">' + st.pcsToday + '</b> / ' + st.targetToday + ' pcs</div>' +
      '<div class="inv-bar"><i style="width:' + todayPct + '%;background:' + utilColor(todayPct) + '"></i></div>' +
      '<div class="mini" style="margin-top:7px">7d output <b class="num">' + num(st.produced7) + '</b> pcs · downtime <b class="num">' + st.downHours7 + ' h</b></div>' +
      (downs.length ? '<div class="mini" style="color:var(--red);margin-top:3px">' + downs.map(d => esc(d.date) + ': ' + d.hours + 'h ' + esc(d.reason || '')).join('<br>') + '</div>' : '') +
      (editable ? '<div class="kb-actions" style="margin-top:9px"><button class="btn sm primary" data-run="' + esc(mc.id) + '">Log output</button><button class="btn sm red" data-down="' + esc(mc.id) + '">Downtime</button><button class="btn sm" data-target="' + esc(mc.id) + '">Target</button></div>' : '') +
      '</div>';
  }).join('');

  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
    '<span class="s-chip"><b class="num" style="color:' + utilColor(avgUtil) + '">' + avgUtil + '%</b><span>fleet utilization (7d)</span></span>' +
    '<span class="s-chip"><b class="num">' + num(pcsToday) + '</b><span>pcs knitted today</span></span>' +
    '<span class="s-chip"><b class="num" style="color:' + (downH > 40 ? 'var(--red)' : 'var(--ink)') + '">' + downH + ' h</b><span>downtime this week</span></span>' +
    '</div><span class="spacer"></span><span class="mini">Puyuan-style live machine board — put this on a factory TV</span></div>' +
    '<div class="mach-grid">' + cards + '</div>';

  view.querySelectorAll('[data-run]').forEach(b => b.addEventListener('click', () => machineEventModal(b.dataset.run, 'run', view)));
  view.querySelectorAll('[data-down]').forEach(b => b.addEventListener('click', () => machineEventModal(b.dataset.down, 'down', view)));
  view.querySelectorAll('[data-target]').forEach(b => b.addEventListener('click', () => {
    const mc = machines.find(x => x.id === b.dataset.target);
    openModal({
      title: 'Target speed — ' + mc.code, submitText: 'Save target',
      body: '<div class="field"><label>Pieces per day (at 20 running hours)</label><input name="targetPerDay" type="number" min="1" value="' + (mc.targetPerDay || 12) + '"></div>',
      onSubmit: async fd => {
        await api('/machines/' + mc.id, { method: 'PATCH', body: Object.fromEntries(fd) });
        toast('Target saved');
        viewMachineBoard(view);
      }
    });
  }));
}

function machineEventModal(machineId, type, view) {
  openModal({
    title: type === 'run' ? 'Log machine output' : 'Log machine downtime', submitText: type === 'run' ? 'Save output' : 'Save downtime',
    body: type === 'run' ?
      '<div class="form-grid"><div class="field"><label>Date</label><input name="date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div class="field"><label>Pieces produced</label><input name="pcs" type="number" min="0" value="12"></div>' +
      '<div class="field full"><label>Running hours</label><input name="hours" type="number" min="0" value="20"></div></div>' :
      '<div class="form-grid"><div class="field"><label>Date</label><input name="date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div class="field"><label>Down hours</label><input name="hours" type="number" min="0" value="2"></div>' +
      '<div class="field full"><label>Reason</label><select name="reason"><option>Yarn wait</option><option>Breakdown</option><option>Program change</option><option>Planned maintenance</option><option>No operator</option></select></div></div>',
    onSubmit: async fd => {
      await api('/machines/' + machineId + '/events', { method: 'POST', body: Object.assign({ type }, Object.fromEntries(fd)) });
      toast(type === 'run' ? 'Output logged' : 'Downtime logged');
      viewMachineBoard(view);
    }
  });
}

/* ---------------- quality ---------------- */

function inspectionModal(orders) {
  const usable = orders.filter(o => !['Delivered'].includes(o.stage));
  if (!usable.length) return toast('No orders available for inspection', 'error');
  openModal({
    title: 'Record inspection — Quality Control', submitText: 'Save inspection',
    body: '<div class="form-grid">' +
      '<div class="field"><label>Order <span class="req">*</span></label><select name="orderId">' + usable.map(o => '<option value="' + o.id + '">' + o.id + ' — ' + esc(o.style) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Type</label><select name="type"><option>Final AQL 2.5</option><option>Inline Knitting</option><option>Inline Mid-Sewing</option><option>Pre-Final</option></select></div>' +
      '<div class="field"><label>Sample size (pcs)</label><input name="sampleSize" type="number" min="1" value="200"></div>' +
      '<div class="field"><label>Result</label><select name="result"><option>Pass</option><option>Fail</option><option>Pending</option></select></div>' +
      '<div class="field"><label>Critical defects</label><input name="crit" type="number" min="0" value="0"></div>' +
      '<div class="field"><label>Major defects</label><input name="major" type="number" min="0" value="0"></div>' +
      '<div class="field"><label>Minor defects</label><input name="minor" type="number" min="0" value="2"></div>' +
      '<div class="field full"><label>Note</label><input name="note" placeholder="observations, corrective actions…"></div></div>',
    onSubmit: async fd => {
      const ins = await api('/inspections', { method: 'POST', body: { orderId: fd.get('orderId'), type: fd.get('type'), sampleSize: fd.get('sampleSize'), result: fd.get('result'), crit: fd.get('crit'), major: fd.get('major'), minor: fd.get('minor'), note: fd.get('note') } });
      toast('Inspection ' + ins.id + ' recorded — ' + ins.result.toUpperCase());
      route();
    }
  });
}

async function viewQuality(view) {
  const { inspections } = await api('/inspections');
  const editable = can('inspections');
  const pending = inspections.filter(i => i.result === 'Pending');
  const closed = inspections.filter(i => i.result !== 'Pending');
  const passRate = closed.length ? Math.round(closed.filter(i => i.result === 'Pass').length / closed.length * 100) : 100;
  const rows = inspections.map(i =>
    '<tr><td><div class="cell-main">' + esc(i.id) + '</div><div class="cell-sub">' + esc(i.inspector) + '</div></td>' +
    '<td>' + esc(i.type) + '<div class="cell-sub"><a href="#/orders/' + esc(i.orderId) + '">' + esc(i.orderId) + '</a> · ' + esc(i.style) + '</div></td>' +
    '<td class="num">' + num(i.sampleSize) + '</td>' +
    '<td class="num">' + i.crit + ' / ' + i.major + ' / ' + i.minor + '</td>' +
    '<td>' + pill(INSP_PILL, i.result) + '</td><td>' + fmtDate(i.date) + '</td>' +
    '<td class="mini">' + esc(i.note || '—') + '</td>' +
    '<td>' + (editable && i.result === 'Pending' ? '<button class="btn sm green" data-result="Pass" data-id="' + esc(i.id) + '">Pass</button> <button class="btn sm red" data-result="Fail" data-id="' + esc(i.id) + '">Fail</button>' : '') + '</td></tr>'
  ).join('');
  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + pending.length + '</b><span>awaiting result</span></span>' +
    '<span class="s-chip"><b class="num">' + passRate + '%</b><span>pass rate</span></span>' +
    '<span class="s-chip"><b class="num">' + inspections.length + '</b><span>inspections total</span></span>' +
    '</div><span class="spacer"></span>' +
    (editable ? '<button class="btn primary" id="new-insp">' + ICONS.plus + ' Record inspection</button>' : '') + '</div>' +
    '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Inspection</th><th>Order</th><th class="r">Sample</th><th class="r">Defects C/M/m</th><th>Result</th><th>Date</th><th>Note</th><th></th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="8"><div class="empty">No inspections yet.</div></td></tr>') + '</tbody></table></div></div>';
  view.querySelectorAll('[data-result]').forEach(b => b.addEventListener('click', async () => {
    await api('/inspections/' + b.dataset.id, { method: 'PATCH', body: { result: b.dataset.result } });
    toast('Inspection ' + b.dataset.id + ' → ' + b.dataset.result.toUpperCase(), b.dataset.result === 'Fail' ? 'error' : 'success');
    viewQuality(view);
  }));
  const nb = $('#new-insp');
  if (nb) nb.addEventListener('click', async () => {
    const { orders } = await api('/orders');
    inspectionModal(orders);
  });
}

/* ---------------- HR & payroll ---------------- */

async function viewHR(view) {
  const d = await api('/hr');
  const editable = can('hr');
  if (!viewHR.att || viewHR.attDate !== d.date) { viewHR.att = Object.assign({}, d.attendance); viewHR.attDate = d.date; }
  const att = viewHR.att;
  const cnt = v => Object.values(att).filter(x => x === v).length;

  function attBtns(id) {
    return ['P', 'A', 'L'].map(v => {
      const on = att[id] === v;
      const cls = on ? (v === 'P' ? 'on-p' : v === 'A' ? 'on-a' : 'on-l') : '';
      return '<button class="att-btn ' + cls + '" data-att="' + v + '" data-emp="' + esc(id) + '">' + v + '</button>';
    }).join('');
  }
  const rows = d.employees.map(e =>
    '<tr><td><div class="cell-main">' + esc(e.name) + '</div><div class="cell-sub">' + esc(e.id) + ' · joined ' + fmtDate(e.joined) + '</div></td>' +
    '<td>' + esc(e.dept) + '</td><td>' + esc(e.position) + '</td><td class="num">' + money(e.salary) + '</td>' +
    '<td>' + (editable ? '<span data-empbtns="' + esc(e.id) + '" style="display:inline-flex;gap:5px">' + attBtns(e.id) + '</span>' : '<b>' + esc(att[e.id] || '—') + '</b>') + '</td></tr>'
  ).join('');

  view.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + d.employees.length + '</b><span>headcount</span></span>' +
    '<span class="s-chip"><b class="num" style="color:var(--green)">' + cnt('P') + '</b><span>present today</span></span>' +
    '<span class="s-chip"><b class="num" style="color:var(--red)">' + cnt('A') + '</b><span>absent</span></span>' +
    '<span class="s-chip"><b class="num">' + cnt('L') + '</b><span>on leave</span></span>' +
    '<span class="s-chip"><b class="num">' + money(d.totalPayroll) + '</b><span>monthly payroll</span></span>' +
    '</div><span class="spacer"></span>' +
    (editable ? '<button class="btn green" id="att-save">' + ICONS.check + ' Save attendance</button> <button class="btn primary" id="new-emp">' + ICONS.plus + ' Add employee</button>' : '') + '</div>' +
    '<div class="card mb"><div class="card-head"><span class="card-title">Attendance — ' + fmtDate(d.date) + '</span><span class="right mini">P present · A absent · L leave</span></div>' +
    '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Employee</th><th>Department</th><th>Position</th><th class="r">Salary</th><th>Status</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
    '<div class="card"><div class="card-head"><span class="card-title">Payroll by department (monthly)</span></div><div class="summary-chips">' +
    Object.entries(d.byDept).map(e => '<span class="s-chip"><b class="num">' + e[1].headcount + '</b><span>' + esc(e[0]) + ' · ' + money(e[1].payroll) + '/mo</span></span>').join('') +
    '</div></div>';

  view.querySelectorAll('[data-att]').forEach(b => b.addEventListener('click', () => {
    att[b.dataset.emp] = b.dataset.att;
    const span = view.querySelector('[data-empbtns="' + b.dataset.emp + '"]');
    if (span) span.innerHTML = attBtns(b.dataset.emp);
    const btns = span ? span.querySelectorAll('[data-att]') : [];
    btns.forEach(bb => bb.addEventListener('click', () => {
      att[bb.dataset.emp] = bb.dataset.att;
      span.innerHTML = attBtns(bb.dataset.emp);
    }));
  }));
  const sb = $('#att-save');
  if (sb) sb.addEventListener('click', async () => {
    await api('/attendance', { method: 'POST', body: { date: d.date, records: att } });
    toast('Attendance saved — ' + Object.values(att).filter(v => v === 'P').length + ' present');
    viewHR.att = null;
    viewHR(view);
  });
  const ne = $('#new-emp');
  if (ne) ne.addEventListener('click', () => openModal({
    title: 'Add employee', submitText: 'Onboard',
    body: '<div class="form-grid">' +
      '<div class="field"><label>Full name <span class="req">*</span></label><input name="name" required></div>' +
      '<div class="field"><label>Department</label><select name="dept">' + ['Management', 'Merchandising', 'Purchase', 'Dye House', 'Production', 'Quality Control', 'Shipping', 'Finance', 'Human Resources'].map(x => '<option>' + x + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Position</label><input name="position" placeholder="e.g. Machine Operator"></div>' +
      '<div class="field"><label>Monthly salary ($)</label><input name="salary" type="number" min="0" value="450"></div>' +
      '<div class="field full"><label>Joined</label><input name="joined" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div></div>',
    onSubmit: async fd => {
      await api('/employees', { method: 'POST', body: Object.fromEntries(fd) });
      toast('Employee onboarded');
      viewHR(view);
    }
  }));
}

/* ---------------- finance ---------------- */

const INV_PILL = { 'Open': 'p-amber', 'Partial': 'p-blue', 'Paid': 'p-green' };

function costCalc(o, cs) {
  const yarn = cs.yarnKg * cs.yarnRate;
  const chem = cs.yarnKg * cs.dyeChemPerKg;
  const cm = o.qty * cs.cmPerPc;
  const trims = o.qty * cs.trimsPerPc;
  const freight = o.qty * cs.freightPerPc;
  const sub = yarn + chem + cm + trims + freight;
  const ovh = sub * (cs.overheadPct || 0) / 100;
  const total = sub + ovh;
  const revenue = o.qty * o.unitPrice;
  return { yarn, chem, cm, trims, freight, ovh, total, revenue, profit: revenue - total, marginPct: revenue ? (revenue - total) / revenue * 100 : 0 };
}

async function viewFinance(view) {
  const tab = state.financeTab || 'inv';
  view.innerHTML = '<div class="toolbar"><div class="tabs">' +
    '<button class="tab ' + (tab === 'inv' ? 'active' : '') + '" data-tab="inv">Invoices & Payments</button>' +
    '<button class="tab ' + (tab === 'cost' ? 'active' : '') + '" data-tab="cost">Costing & Margins</button>' +
    '<button class="tab ' + (tab === 'exp' ? 'active' : '') + '" data-tab="exp">Expenses</button>' +
    '</div><span class="spacer"></span><span class="mini">' + (can('finance') ? 'You can act on this desk' : 'Read-only — Finance desk') + '</span></div><div id="fin-body"></div>';
  view.querySelectorAll('[data-tab]').forEach(t => t.addEventListener('click', () => { state.financeTab = t.dataset.tab; viewFinance(view); }));
  const body = $('#fin-body');
  const d = await api('/finance');
  const editable = can('finance');

  if (tab === 'inv') {
    const chips = '<div class="toolbar"><div class="summary-chips">' +
      '<span class="s-chip"><b class="num">' + money(d.summary.receivableOpen) + '</b><span>receivables open</span></span>' +
      '<span class="s-chip"><b class="num" style="color:' + (d.summary.overdue ? 'var(--red)' : 'var(--ink)') + '">' + money(d.summary.overdue) + '</b><span>overdue</span></span>' +
      '<span class="s-chip"><b class="num" style="color:var(--green)">' + money(d.summary.collected) + '</b><span>collected all-time</span></span>' +
      '</div><span class="spacer"></span>' + (editable ? '<button class="btn primary" id="new-inv">' + ICONS.plus + ' Issue invoice</button>' : '') + '</div>';
    const rows = d.invoices.map(v =>
      '<tr><td><div class="cell-main">' + esc(v.id) + '</div><div class="cell-sub">issued ' + fmtDate(v.issued) + '</div></td>' +
      '<td><div class="cell-main">' + esc(v.buyerName) + '</div><div class="cell-sub">' + esc(v.orderId) + ' · ' + esc(v.shipmentId) + '</div></td>' +
      '<td>' + fmtDate(v.due) + '</td><td class="num">' + money(v.amount) + '</td>' +
      '<td class="num" style="color:var(--green)">' + money(v.paid) + '</td>' +
      '<td class="num"><b>' + money(v.amount - v.paid) + '</b></td>' +
      '<td>' + pill(INV_PILL, v.status) + '</td>' +
      '<td>' + (editable && v.status !== 'Paid' ? '<button class="btn sm green" data-pay="' + esc(v.id) + '" data-bal="' + (v.amount - v.paid) + '">Record payment</button>' : '') + '</td></tr>'
    ).join('');
    body.innerHTML = chips +
      '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Invoice</th><th>Buyer / Order</th><th>Due</th><th class="r">Amount</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8"><div class="empty">No invoices yet.</div></td></tr>') + '</tbody></table></div></div>';
    body.querySelectorAll('[data-pay]').forEach(b => b.addEventListener('click', () => openModal({
      title: 'Record payment — ' + b.dataset.pay, submitText: 'Save payment',
      body: '<div class="form-grid">' +
        '<div class="field"><label>Amount ($)</label><input name="amount" type="number" min="1" step="0.01" value="' + b.dataset.bal + '" required></div>' +
        '<div class="field"><label>Reference</label><input name="ref" placeholder="TT / LC ref"></div></div>',
      onSubmit: async fd => {
        await api('/invoices/' + b.dataset.pay + '/payment', { method: 'POST', body: { amount: fd.get('amount'), ref: fd.get('ref') } });
        toast('Payment recorded');
        viewFinance(view);
      }
    })));
    const ni = $('#new-inv');
    if (ni) ni.addEventListener('click', async () => {
      const [{ shipments }, { orders }] = await Promise.all([api('/shipments'), api('/orders')]);
      const usable = shipments.filter(x => !d.invoices.some(v => v.shipmentId === x.id));
      if (!usable.length) return toast('Every shipment already has an invoice', 'error');
      openModal({
        title: 'Issue invoice', submitText: 'Issue invoice',
        body: '<div class="field"><label>Shipment <span class="req">*</span></label><select name="shipmentId" id="inv-ship">' + usable.map(x => '<option value="' + x.id + '">' + x.id + ' — ' + esc(x.orderId) + ' (' + esc(x.buyerName) + ')</option>').join('') + '</select></div>' +
          '<div class="form-grid"><div class="field"><label>Amount ($)</label><input name="amount" id="inv-amt" type="number" min="1"></div><div class="field"><label>Payment due</label><input name="due" type="date"></div></div>',
        onSubmit: async fd => {
          const inv = await api('/invoices', { method: 'POST', body: { shipmentId: fd.get('shipmentId'), amount: fd.get('amount'), due: fd.get('due') } });
          toast('Invoice ' + inv.id + ' issued — $' + num(inv.amount));
          viewFinance(view);
        }
      });
      const sync = () => {
        const sh = usable.find(x => x.id === $('#inv-ship').value);
        const o = orders.find(x => x.id === sh.orderId);
        if (o) $('#inv-amt').value = Math.round(o.qty * o.unitPrice);
      };
      $('#inv-ship').addEventListener('change', sync); sync();
    });
    return;
  }

  if (tab === 'cost') {
    const rows = d.costsheets.map(cs => {
      const cc = costCalc(cs, cs);
      const unit = cs.qty ? cc.total / cs.qty : 0;
      const mColor = cc.marginPct >= 25 ? 'var(--green)' : cc.marginPct >= 10 ? '#b45309' : 'var(--red)';
      return '<tr><td><div class="cell-main">' + esc(cs.orderId) + '</div><div class="cell-sub">' + esc(cs.style) + '</div></td>' +
        '<td class="num">' + num(cs.qty) + '</td><td class="num">$' + cs.unitPrice.toFixed(2) + '</td>' +
        '<td class="num">' + money(cc.total) + '</td><td class="num">$' + unit.toFixed(2) + '</td>' +
        '<td class="num">' + money(cc.revenue) + '</td>' +
        '<td class="num"><b style="color:' + mColor + '">' + cc.marginPct.toFixed(1) + '%</b></td>' +
        '<td>' + (editable ? '<button class="btn sm" data-cs="' + esc(cs.id) + '">Edit</button>' : '') + '</td></tr>';
    }).join('');
    const csFields = cs => '<div class="form-grid">' +
      '<div class="field"><label>Yarn quantity (kg)</label><input name="yarnKg" type="number" step="0.01" value="' + cs.yarnKg + '"></div>' +
      '<div class="field"><label>Yarn rate ($/kg)</label><input name="yarnRate" type="number" step="0.01" value="' + cs.yarnRate + '"></div>' +
      '<div class="field"><label>Dye & chemicals ($/kg yarn)</label><input name="dyeChemPerKg" type="number" step="0.01" value="' + cs.dyeChemPerKg + '"></div>' +
      '<div class="field"><label>Trims ($/pc)</label><input name="trimsPerPc" type="number" step="0.01" value="' + cs.trimsPerPc + '"></div>' +
      '<div class="field"><label>CM ($/pc)</label><input name="cmPerPc" type="number" step="0.01" value="' + cs.cmPerPc + '"></div>' +
      '<div class="field"><label>Freight ($/pc)</label><input name="freightPerPc" type="number" step="0.01" value="' + cs.freightPerPc + '"></div>' +
      '<div class="field"><label>Overhead (%)</label><input name="overheadPct" type="number" step="0.5" value="' + cs.overheadPct + '"></div>' +
      '<div class="field"><label>Note</label><input name="note" value="' + esc(cs.note || '') + '"></div></div>';
    body.innerHTML =
      '<div class="toolbar"><span class="mini">Yarn + dye chemicals + CM + trims + freight + overhead → true cost & margin per order</span><span class="spacer"></span>' +
      (editable ? '<button class="btn primary" id="new-cs">' + ICONS.plus + ' New costing sheet</button>' : '') + '</div>' +
      '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Order</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total cost</th><th class="r">Cost/pc</th><th class="r">Revenue</th><th class="r">Margin</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8"><div class="empty">No costing sheets yet.</div></td></tr>') + '</tbody></table></div></div>';
    body.querySelectorAll('[data-cs]').forEach(b => b.addEventListener('click', () => {
      const cs = d.costsheets.find(x => x.id === b.dataset.cs);
      openModal({
        title: 'Costing sheet — ' + cs.orderId, submitText: 'Save costing',
        body: csFields(cs),
        onSubmit: async fd => {
          await api('/costsheets/' + cs.id, { method: 'PATCH', body: Object.fromEntries(fd) });
          toast('Costing updated — margin recalculated');
          viewFinance(view);
        }
      });
    }));
    const nc = $('#new-cs');
    if (nc) nc.addEventListener('click', async () => {
      const { orders } = await api('/orders');
      const usable = orders.filter(o => !d.costsheets.some(c => c.orderId === o.id));
      if (!usable.length) return toast('All orders already have costing sheets', 'error');
      openModal({
        title: 'New costing sheet', submitText: 'Create',
        body: '<div class="field"><label>Order <span class="req">*</span></label><select name="orderId">' + usable.map(o => '<option value="' + o.id + '">' + o.id + ' — ' + esc(o.style) + '</option>').join('') + '</select></div>' +
          csFields({ yarnKg: 0, yarnRate: 0, dyeChemPerKg: 0.9, trimsPerPc: 0.1, cmPerPc: 0, overheadPct: 8, freightPerPc: 0, note: '' }),
        onSubmit: async fd => {
          const body2 = Object.fromEntries(fd);
          await api('/costsheets', { method: 'POST', body: body2 });
          toast('Costing sheet created');
          viewFinance(view);
        }
      });
    });
    return;
  }

  const rows = d.expenses.map(x =>
    '<tr><td>' + fmtDate(x.date) + '</td><td><span class="pill p-slate">' + esc(x.category) + '</span></td><td>' + esc(x.desc || '—') + '</td><td class="num"><b>' + money(x.amount) + '</b></td></tr>'
  ).join('');
  body.innerHTML =
    '<div class="toolbar"><div class="summary-chips">' +
    '<span class="s-chip"><b class="num">' + money(d.summary.expensesMonth) + '</b><span>expenses this month</span></span>' +
    '<span class="s-chip"><b class="num" style="color:' + (d.summary.netMonth >= 0 ? 'var(--green)' : 'var(--red)') + '">' + money(d.summary.netMonth) + '</b><span>collected − expenses</span></span>' +
    '</div><span class="spacer"></span>' +
    (editable ? '<button class="btn primary" id="new-ex">' + ICONS.plus + ' Book expense</button>' : '') + '</div>' +
    '<div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Date</th><th>Category</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>' +
    (rows || '<tr><td colspan="4"><div class="empty">No expenses booked.</div></td></tr>') + '</tbody></table></div></div>';
  const ne = $('#new-ex');
  if (ne) ne.addEventListener('click', () => openModal({
    title: 'Book expense', submitText: 'Save expense',
    body: '<div class="form-grid">' +
      '<div class="field"><label>Category</label><select name="category">' + ['Salaries', 'Dyes & Chemicals', 'Freight & Handling', 'Utilities', 'Maintenance', 'Yarn Purchase', 'Other'].map(c => '<option>' + c + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Amount ($)</label><input name="amount" type="number" min="0" step="0.01" required></div>' +
      '<div class="field"><label>Date</label><input name="date" type="date" value="' + new Date().toISOString().slice(0, 10) + '"></div>' +
      '<div class="field"><label>Description</label><input name="desc" placeholder="what was paid for"></div></div>',
    onSubmit: async fd => {
      await api('/expenses', { method: 'POST', body: Object.fromEntries(fd) });
      toast('Expense booked');
      viewFinance(view);
    }
  }));
}

/* ---------------- reports center ---------------- */

async function viewReports(view) {
  const defs = [
    ['order-book', 'Order book', 'All orders with buyers, values & stages'],
    ['shipment-schedule', 'Shipment schedule', 'Every shipment — vessel, ETD/ETA, status'],
    ['production-wip', 'Production WIP', 'Floor progress per production order'],
    ['dye-production', 'Dye house production', 'Batches, shades, recipes & QC results'],
    ['purchase-spend', 'Purchase spend', 'PO value by supplier, year to date'],
    ['inventory-valuation', 'Inventory valuation', 'Stock on hand & total store value'],
    ['receivables', 'Receivables', 'Open invoices & balances by buyer'],
    ['payroll', 'Payroll summary', 'Headcount & monthly salary by department']
  ];
  view.innerHTML =
    '<div class="hint mb">' + ICONS.reports + ' <b>One-click management reports.</b> Each report is generated live from company data — open it and print or save as PDF.</div>' +
    '<div class="grid g-3">' + defs.map(r =>
      '<div class="card" style="display:flex;gap:12px;align-items:center"><span style="background:var(--primary);border-radius:11px;width:38px;height:38px;display:grid;place-items:center;color:#fff;flex:none">' + ICONS.reports + '</span><div style="flex:1;min-width:0"><b>' + r[1] + '</b><div class="mini">' + r[2] + '</div></div><button class="btn sm primary" data-report="' + r[0] + '" data-title="' + esc(r[1]) + '">Open</button></div>'
    ).join('') + '</div>';
  view.querySelectorAll('[data-report]').forEach(b => b.addEventListener('click', async () => {
    const res = await fetch('/api/reports/' + b.dataset.report, { headers: { Authorization: 'Bearer ' + state.token } });
    const html = await res.text();
    openModal({ title: b.dataset.title + ' — live report', wide: true, body: '<iframe class="doc-frame" id="docframe"></iframe>' });
    $('#docframe').srcdoc = html;
    const foot = modalRoot.querySelector('.modal-foot');
    foot.innerHTML = '<button class="btn" id="doc-print">' + ICONS.print + ' Print / save PDF</button><button class="btn primary" data-close>Close</button>';
    modalRoot.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', closeModal));
    $('#doc-print').addEventListener('click', () => { try { $('#docframe').contentWindow.print(); } catch (e) { toast('Printing is blocked in this preview — download the app to print', 'error'); } });
  }));
}

/* ---------------- settings ---------------- */

async function viewSettings(view) {
  const [{ settings }, { users }] = await Promise.all([api('/settings'), api('/users')]);
  const isAdmin = state.user.role === 'admin';
  const ROLES = [['admin', 'Management (full access)'], ['merchandising', 'Merchandising'], ['purchase', 'Purchase'], ['dye', 'Dye House'], ['production', 'Production'], ['qc', 'Quality Control'], ['shipping', 'Shipping'], ['hr', 'Human Resources'], ['finance', 'Finance']];
  const dis = isAdmin ? '' : ' disabled';
  view.innerHTML =
    '<div class="grid g-2">' +
    '<div class="card"><div class="card-head"><span class="card-title">Company profile</span><span class="right mini">used on invoices & packing lists</span></div>' +
    '<form id="co-form">' +
    '<div class="field"><label>Company name</label><input name="name" value="' + esc(settings.name) + '"' + dis + '></div>' +
    '<div class="field"><label>Address</label><input name="address" value="' + esc(settings.address) + '"' + dis + '></div>' +
    '<div class="form-grid">' +
    '<div class="field"><label>Phone</label><input name="phone" value="' + esc(settings.phone) + '"' + dis + '></div>' +
    '<div class="field"><label>Email</label><input name="email" value="' + esc(settings.email) + '"' + dis + '></div>' +
    '</div><div class="form-grid">' +
    '<div class="field"><label>VAT / Tax ID</label><input name="vat" value="' + esc(settings.vat) + '"' + dis + '></div>' +
    '<div class="field"><label>Currency</label><input name="currency" value="' + esc(settings.currency || 'USD') + '"' + dis + '></div>' +
    '</div>' +
    (isAdmin ? '<button class="btn primary" type="submit">Save profile</button>' : '<div class="mini">Only Management can edit the company profile.</div>') +
    '</form></div>' +
    '<div class="card"><div class="card-head"><span class="card-title">Users & access</span>' + (isAdmin ? '<span class="right"><button class="btn sm primary" id="new-user">' + ICONS.plus + ' Add user</button></span>' : '') + '</div>' +
    '<table class="tbl"><thead><tr><th>User</th><th>Department</th><th>Role</th></tr></thead><tbody>' +
    users.map(u => '<tr><td><div class="cell-main">' + esc(u.name) + '</div><div class="cell-sub">' + esc(u.email) + '</div></td><td>' + esc(u.dept) + '</td><td><span class="pill p-slate">' + esc(u.role) + '</span></td></tr>').join('') +
    '</tbody></table>' +
    (isAdmin ? '' : '<div class="mini" style="margin-top:10px">Only Management can create users.</div>') +
    '</div></div>';
  const cf = $('#co-form');
  if (cf && isAdmin) cf.addEventListener('submit', async e => {
    e.preventDefault();
    await api('/settings', { method: 'PATCH', body: Object.fromEntries(new FormData(cf)) });
    toast('Company profile saved — documents will use it');
  });
  const nu = $('#new-user');
  if (nu) nu.addEventListener('click', () => openModal({
    title: 'Add user', submitText: 'Create user',
    body: '<div class="form-grid">' +
      '<div class="field"><label>Full name <span class="req">*</span></label><input name="name" required></div>' +
      '<div class="field"><label>Email <span class="req">*</span></label><input name="email" type="email" required></div>' +
      '<div class="field"><label>Role / Department</label><select name="role">' + ROLES.map(r => '<option value="' + r[0] + '">' + r[1] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>Title</label><input name="title" placeholder="e.g. Dye Machine Operator"></div>' +
      '<div class="field full"><label>Password</label><input name="password" required placeholder="set an initial password"></div></div>',
    onSubmit: async fd => {
      await api('/users', { method: 'POST', body: Object.fromEntries(fd) });
      toast('User created — they can sign in now');
      viewSettings(view);
    }
  }));
}

/* ---------------- boot ---------------- */

function render() {
  if (!state.user) { renderLogin(); return; }
  renderShell();
  route();
}

window.addEventListener('hashchange', route);
(async function boot() {
  try {
    const t = store.get('kf_token');
    if (t) {
      state.token = t;
      try { const r = await api('/me'); state.user = r.user; }
      catch (e) { state.token = null; store.del('kf_token'); }
    }
  } catch (e) { console.error('boot issue:', e); }
  render();
})();

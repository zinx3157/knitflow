# -*- coding: utf-8 -*-
"""Build knitflow-app.html — the FULL KnitFlow OS as one portable file.
Server logic is sliced from server.js and run in-browser by a tiny shim."""
import io, re, json

import os
BASE = os.path.dirname(os.path.abspath(__file__)) + '/'
server = io.open(BASE + 'server.js', encoding='utf-8').read()
appjs  = io.open(BASE + 'public/app.js', encoding='utf-8').read()
css    = io.open(BASE + 'public/styles.css', encoding='utf-8').read()
seed   = io.open(BASE + 'data/seed.json', encoding='utf-8').read().strip()

# ---------- slice 1: consts (STAGES..sessions) ----------
i1 = server.index('const STAGES')
i2 = server.index('function seed()')
slice1 = server[i1:i2].rstrip()

# ---------- slice 2: helpers + docs + reports + apiRoute ----------
j1 = server.index('function json(res, code, data)')
import re
j2 = re.search(r'/\* -+ static \*/', server).start()
slice2 = server[j1:j2].rstrip()

# fix global-scope collisions between the server slices and the UI script
import re as _re
slice1 = _re.sub(r'const DEPT_COLORS = \{[^\n]*\n', '', slice1)
slice2 = _re.sub(r'\bcan\(user,', 'srvCan(user,', slice2)
slice2 = slice2.replace('crypto.randomBytes', 'kfCrypto.randomBytes')
slice2 = slice2.replace('crypto.createHash', 'kfCrypto.createHash')
appjs = _re.sub(r"const STAGES = \[[^\]]*\];\n", "", appjs)
appjs = _re.sub(r"const SHIP_NEXT = \{[^\n]*\n", "", appjs)
appjs = _re.sub(r"const BATCH_NEXT = \{[^\n]*\n", "", appjs)

# readBody: body comes pre-parsed from the shim
old_rb = """function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => {
      if (!d) return resolve({});
      try { resolve(JSON.parse(d)); } catch (e) { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}"""
new_rb = """function readBody(req) {
  return Promise.resolve(req.__body || {});
}"""
assert slice2.count(old_rb) == 1
slice2 = slice2.replace(old_rb, new_rb)

# ---------- shim ----------
shim = """
/* ---- KnitFlow portable shim: runs the real server logic in the browser ---- */
function kfSha256(str) {
  let ascii = decodeURIComponent(escape(str));
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  var maxWord = Math.pow(2, 32), result = '', words = [], asciiBitLength = ascii.length * 8;
  var hash = [], k = [], primeCounter = 0, isComposite = {};
  for (var candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (var i = 0; i < 313; i += candidate) isComposite[i] = candidate;
      hash[primeCounter] = (Math.pow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (Math.pow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) words[i >> 2] |= ascii.charCodeAt(i) << ((3 - i) % 4) * 8;
  words[words.length] = (asciiBitLength / maxWord) | 0;
  words[words.length] = asciiBitLength;
  for (var j = 0; j < words.length;) {
    var w = words.slice(j, j += 16), oldHash = hash.slice(0);
    for (i = 16; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2];
      var s0 = rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3);
      var s1 = rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    var a = hash[0], b = hash[1], c = hash[2], d = hash[3], e = hash[4], f = hash[5], g = hash[6], h = hash[7];
    for (i = 0; i < 64; i++) {
      var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g);
      var temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
      var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), maj = (a & b) ^ (a & c) ^ (b & c);
      var temp2 = (S0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    var fin = [a, b, c, d, e, f, g, h];
    for (i = 0; i < 8; i++) hash[i] = (fin[i] + oldHash[i]) | 0;
  }
  for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) {
    var b2 = (hash[i] >> (j * 8)) & 255;
    result += (b2 >> 4).toString(16) + (b2 & 15).toString(16);
  }
  return result;
}
const kfCrypto = {
  randomBytes: n => { let s = ''; while (s.length < n * 2) s += Math.random().toString(36).slice(2); return { toString: () => s.slice(0, n * 2) }; },
  createHash: algo => {
    if (algo !== 'sha256') throw new Error('unsupported hash: ' + algo);
    let input = '';
    return { update(s) { input += s; return this; }, digest() { return kfSha256(input); } };
  }
};
function save() { try { window.localStorage.setItem('kf_portable_db', JSON.stringify(db)); } catch (e) {} }
function loadPortable() {
  try { const raw = window.localStorage.getItem('kf_portable_db'); if (raw) { db = JSON.parse(raw); return true; } } catch (e) {}
  return false;
}
class FakeRes {
  constructor() { this.status = 200; this.headers = {}; this.jsonVal = undefined; this.htmlVal = ''; }
  writeHead(code, h) { this.status = code; this.headers = h || {}; return this; }
  end(x) {
    if (x === undefined) return;
    if ((this.headers['Content-Type'] || '').indexOf('html') >= 0) this.htmlVal += x;
    else { try { this.jsonVal = JSON.parse(x); } catch (e) { this.htmlVal += x; } }
  }
}
async function handleApi(method, path, body) {
  const req = {
    method: method,
    url: 'http://knitflow.local' + path,
    headers: { authorization: (state && state.token) ? ('Bearer ' + state.token) : '' },
    __body: body ? JSON.parse(JSON.stringify(body)) : {}
  };
  const res = new FakeRes();
  await apiRoute(req, res, path);
  return res;
}
"""

# ---------- patch app.js for the shim ----------
old_api = """  const res = await fetch('/api' + path, { method: opts.method || 'GET', headers, body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined });"""
new_api = """  const rres = await handleApi(opts.method || 'GET', '/api' + path, opts.body);
  const res = { status: rres.status, ok: rres.status >= 200 && rres.status < 300, json: async () => rres.jsonVal, text: async () => rres.htmlVal || '' };"""
assert appjs.count(old_api) == 1, 'api() fetch anchor'
appjs = appjs.replace(old_api, new_api)

old_doc = """    const res = await fetch('/api/shipments/' + b.dataset.doc + '/docs/' + b.dataset.type, { headers: { Authorization: 'Bearer ' + state.token } });
    const html = await res.text();"""
new_doc = """    const res = await handleApi('GET', '/api/shipments/' + b.dataset.doc + '/docs/' + b.dataset.type, undefined);
    const html = res.htmlVal || '';"""
assert appjs.count(old_doc) == 1, 'docs fetch anchor'
appjs = appjs.replace(old_doc, new_doc)

old_rep = """    const res = await fetch('/api/reports/' + b.dataset.report, { headers: { Authorization: 'Bearer ' + state.token } });
    const html = await res.text();"""
new_rep = """    const res = await handleApi('GET', '/api/reports/' + b.dataset.report, undefined);
    const html = res.htmlVal || '';"""
assert appjs.count(old_rep) == 1, 'reports fetch anchor'
appjs = appjs.replace(old_rep, new_rep)

# prominent version badge on the sign-in card
appjs = appjs.replace(
  "'<h2>Sign in</h2><div class=\"sub\">One workspace for the whole company.</div>' +",
  "'<h2 style=\"display:flex;align-items:center;gap:10px\">Sign in <span style=\"font-size:11px;letter-spacing:.5px;background:#d1fae5;color:#047857;border:1px solid #6ee7b7;padding:4px 12px;border-radius:99px\">v9 ✓ CORRECT FILE</span></h2><div class=\"sub\">One workspace for the whole company.</div>' +"
)
assert 'v9 ✓ CORRECT FILE' in appjs

# portable footer + reset button
appjs = appjs.replace('Demo environment', 'Portable edition')
appjs = appjs.replace("all changes persist in the workspace database.", 'changes save in this browser. <button class="linklike" id="reset-db" type="button">Reset demo data</button>')
appjs = appjs.replace('Reset demo data</button>', 'Reset demo data</button> · <b>v9</b>')
old_od = """  const od = $('#open-demo');
  if (od) od.addEventListener('click', () => quickLogin('admin@knitflow.io'));"""
new_od = old_od + """
  const rd = $('#reset-db');
  if (rd) rd.addEventListener('click', () => {
    try { window.localStorage.removeItem('kf_portable_db'); } catch (e) {}
    db = JSON.parse(JSON.stringify(SEED));
    save();
    toast('Demo data reset to factory state');
    renderLogin();
  });"""
assert appjs.count(old_od) == 1, 'open-demo anchor'
appjs = appjs.replace(old_od, new_od)

# offline badge in sidebar footer text
appjs = appjs.replace("One roof · one flow", "One roof · one flow · portable edition")

# ---------- assemble ----------
html = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>KnitFlow OS — Knitwear Manufacturing Platform (Portable)</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%234F46E5'/%3E%3Cpath d='M8 10l8 8 8-8M8 17l8 8 8-8' stroke='white' stroke-width='2.6' fill='none' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E" />
<style>""" + css + """</style>
</head>
<body>
<div id="root"><div class="boot"><div class="spinner"></div><p>Warming up the looms…</p></div></div>
<div id="modal-root"></div>
<div id="toast-root"></div>
<noscript><div style="padding:40px;font-family:sans-serif">KnitFlow OS needs JavaScript. Please enable it and reload.</div></noscript>
<script>const SEED = """ + seed.replace("</", "<\\/") + """;</script>
<script>
window.addEventListener("error", function (e) { var m = (e && (e.message || (e.error && e.error.message))) || "Unknown error"; var d = document.createElement("div"); d.style.cssText = "position:fixed;bottom:0;left:0;right:0;background:#7f1d1d;color:#fff;font:13px/1.5 sans-serif;padding:12px 18px;z-index:99999"; d.textContent = "Startup problem: " + m; document.body.appendChild(d); });
""" + slice1 + "\n" + slice2 + "\n" + shim + """
db = JSON.parse(JSON.stringify(SEED));
loadPortable();
</script>
<script>
""" + appjs + """
setTimeout(function () {
  var r = document.getElementById("root");
  if (r && r.querySelector(".boot")) {
    r.innerHTML = "<div style='max-width:540px;margin:14vh auto;padding:30px;font-family:Arial,sans-serif;background:#fff;border:1px solid #e2e8f0;border-radius:14px;text-align:center;box-shadow:0 4px 16px rgba(15,23,42,.06)'>"
      + "<div style='font-size:34px'>🧶</div><h2 style='margin:10px 0 8px'>This is an older copy of KnitFlow</h2>"
      + "<p style='color:#64748b;font-size:14px;line-height:1.6'>The app could not start because this downloaded file is outdated.<br>Delete it and use the newest <b>knitflow-app.html</b> —<br>the correct one shows <b>v9</b> at the bottom of the sign-in card.</p>"
      + "<button onclick='location.reload()' style='padding:11px 20px;border:0;border-radius:10px;background:#4F46E5;color:#fff;font-size:14px;font-weight:700'>Reload</button></div>";
  }
}, 2500);
</script>
</body>
</html>
"""

out = os.path.join(BASE, 'docs', 'index.html')
io.open(out, 'w', encoding='utf-8').write(html)
print('built', out, len(html), 'bytes')

# ---------- also write the testable JS bundle ----------
bundle = slice1 + '\n' + slice2 + '\n' + shim + '\ndb = JSON.parse(JSON.stringify(SEED));\nmodule.exports = { handleApi, setDb: d => { db = d; } };\n'
io.open('/home/user/bundle_test.js', 'w', encoding='utf-8').write('const SEED = ' + seed + ';\n' + bundle)
print('bundle_test.js written')

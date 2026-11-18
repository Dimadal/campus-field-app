/* Campus — вход менеджера: почта + пароль + код из Microsoft Authenticator (TOTP).
   Подключается первым скриптом в <head>. Подменяет Authorization в запросах к Supabase
   на токен вошедшего менеджера, поэтому остальной код страниц менять не нужно. */
(function () {
  'use strict';
  var SUPA = 'https://pvaogqxpbkwxarbgzvpi.supabase.co';
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2YW9ncXhwYmt3eGFyYmd6dnBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTY4NTYsImV4cCI6MjA5NDczMjg1Nn0.ib17U3NvpLjVSm1GZ5eeXT79hiLfZaAKt2nALLMKHUY';
  var KEY = 'cfm_mgr_session';
  var HE = (document.documentElement.lang || '').toLowerCase().indexOf('he') === 0;
  var T = HE ? {
    title: 'כניסת מנהל', email: 'אימייל', pass: 'סיסמה', login: 'כניסה', code: 'קוד בן 6 ספרות', verify: 'אישור',
    mfaTitle: 'אימות דו-שלבי', mfaText: 'הזינו את הקוד מהאפליקציה Microsoft Authenticator',
    enrollTitle: 'הגדרת אימות דו-שלבי', enrollText: 'פתחו את Microsoft Authenticator ← ״+״ ← ״חשבון אחר״ וסרקו את הקוד. לאחר מכן הזינו את הקוד בן 6 הספרות.',
    secret: 'או הזינו ידנית', wrong: 'אימייל או סיסמה שגויים', wrongCode: 'קוד שגוי, נסו שוב', noAccess: 'לחשבון זה אין הרשאת מנהל',
    err: 'שגיאה', logout: 'יציאה', checking: 'בודק…', back: 'חזרה'
  } : {
    title: 'Вход менеджера', email: 'Почта', pass: 'Пароль', login: 'Войти', code: '6-значный код', verify: 'Подтвердить',
    mfaTitle: 'Двойная проверка', mfaText: 'Введите код из приложения Microsoft Authenticator',
    enrollTitle: 'Настройка двойной проверки', enrollText: 'Откройте Microsoft Authenticator → «+» → «Другая учётная запись» и отсканируйте код. Затем введите 6-значный код из приложения.',
    secret: 'или введите вручную', wrong: 'Неверная почта или пароль', wrongCode: 'Неверный код, попробуйте ещё раз', noAccess: 'У этой учётной записи нет доступа менеджера',
    err: 'Ошибка', logout: 'Выйти', checking: 'Проверка…', back: 'Назад'
  };

  var origFetch = window.fetch.bind(window);
  var session = null;
  var resolveReady;
  var ready = new Promise(function (r) { resolveReady = r; });

  function saveSession(s) {
    session = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {}
  }
  function clearSession() {
    session = null;
    try { localStorage.removeItem(KEY); } catch (e) {}
  }
  function decodeJwt(t) {
    try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return {}; }
  }
  function normalize(r) {
    var exp = r.expires_at || (Math.floor(Date.now() / 1000) + (r.expires_in || 3600));
    return { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: exp, user: r.user || (session && session.user) || null };
  }
  async function auth(path, body, token, method) {
    var r = await origFetch(SUPA + '/auth/v1/' + path, {
      method: method || 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json', Authorization: 'Bearer ' + (token || ANON) },
      body: body ? JSON.stringify(body) : undefined
    });
    var j = await r.json().catch(function () { return {}; });
    if (!r.ok) { var e = new Error(j.msg || j.message || j.error_description || j.error || ('HTTP ' + r.status)); e.status = r.status; throw e; }
    return j;
  }
  async function refresh() {
    if (!session || !session.refresh_token) throw new Error('no session');
    var j = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
    saveSession(normalize(j));
  }
  async function freshToken() {
    if (!session) return ANON;
    if (session.expires_at - Math.floor(Date.now() / 1000) < 90) {
      try { await refresh(); } catch (e) { logout(); throw e; }
    }
    return session.access_token;
  }
  async function isManager(token, uid) {
    var r = await origFetch(SUPA + '/rest/v1/manager_users?select=user_id&user_id=eq.' + uid, {
      headers: { apikey: ANON, Authorization: 'Bearer ' + token }
    });
    if (!r.ok) return false;
    var j = await r.json().catch(function () { return []; });
    return Array.isArray(j) && j.length > 0;
  }
  function logout() {
    try { if (session) origFetch(SUPA + '/auth/v1/logout', { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + session.access_token } }); } catch (e) {}
    clearSession();
    location.reload();
  }

  // Подмена Authorization для запросов к Supabase
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    if (typeof input === 'string' && (url.indexOf(SUPA + '/rest/v1') === 0 || url.indexOf(SUPA + '/storage/v1') === 0 || url.indexOf(SUPA + '/functions/v1') === 0)) {
      await ready;
      var tok = await freshToken();
      init = init || {};
      var h = new Headers(init.headers || {});
      h.set('Authorization', 'Bearer ' + tok);
      init = Object.assign({}, init, { headers: h });
    }
    return origFetch(input, init);
  };

  // ---------- UI ----------
  var style = document.createElement('style');
  style.textContent =
    'html.cfm-locked body>*:not(#cfm-auth){visibility:hidden!important}' +
    '#cfm-auth{position:fixed;inset:0;z-index:2147483000;background:#0f1b2d;display:flex;align-items:center;justify-content:center;padding:16px;font-family:system-ui,"Noto Sans","Noto Sans Hebrew",Arial,sans-serif}' +
    '#cfm-auth .cb{background:#fff;border-radius:16px;padding:26px 22px;width:100%;max-width:380px;box-shadow:0 20px 60px rgba(0,0,0,.4);color:#1c2233}' +
    '#cfm-auth h2{margin:0 0 6px;font-size:21px}' +
    '#cfm-auth p{margin:0 0 14px;color:#5b6477;font-size:14px;line-height:1.45}' +
    '#cfm-auth label{display:block;font-size:12px;font-weight:700;color:#6b7389;margin:10px 0 4px}' +
    '#cfm-auth input{width:100%;padding:12px;border:1.5px solid #d7dcea;border-radius:10px;font-size:16px;box-sizing:border-box;background:#fff;color:#1c2233}' +
    '#cfm-auth input:focus{outline:none;border-color:#2563eb}' +
    '#cfm-auth button.pr{width:100%;margin-top:16px;padding:13px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-size:16px;font-weight:700;cursor:pointer}' +
    '#cfm-auth button.pr:disabled{opacity:.6}' +
    '#cfm-auth button.ln{background:none;border:none;color:#2563eb;margin-top:10px;font-size:14px;cursor:pointer;width:100%}' +
    '#cfm-auth .er{color:#b91c1c;background:#fee2e2;border-radius:8px;padding:8px 10px;font-size:13px;margin-top:12px;display:none}' +
    '#cfm-auth .qr{text-align:center;margin:8px 0}#cfm-auth .qr img{width:180px;height:180px}' +
    '#cfm-auth .sc{font-family:monospace;font-size:12px;word-break:break-all;background:#f2f4f9;border-radius:8px;padding:8px;text-align:center;direction:ltr}' +
    '#cfm-auth input.cd{text-align:center;letter-spacing:6px;font-size:22px;direction:ltr}' +
    '#cfm-logout{position:fixed;bottom:8px;' + (HE ? 'right' : 'left') + ':8px;z-index:2147482000;background:#fff;color:#4361ee;border:1px solid #d7dcea;border-radius:16px;padding:3px 10px;font-size:11px;cursor:pointer;opacity:.75;font-family:inherit}';
  document.documentElement.appendChild(style);
  document.documentElement.classList.add('cfm-locked');

  var box = document.createElement('div');
  box.id = 'cfm-auth';
  box.setAttribute('dir', HE ? 'rtl' : 'ltr');
  document.documentElement.appendChild(box);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function showErr(msg) { var e = box.querySelector('.er'); if (e) { e.textContent = msg; e.style.display = 'block'; } }
  function setBusy(b) { var x = box.querySelector('button.pr'); if (x) x.disabled = b; }

  function viewLogin(msg) {
    box.innerHTML = '<div class="cb"><h2>🔒 ' + T.title + '</h2><p>Campus</p>' +
      '<label>' + T.email + '</label><input id="cfm-e" type="email" autocomplete="username" inputmode="email">' +
      '<label>' + T.pass + '</label><input id="cfm-p" type="password" autocomplete="current-password">' +
      '<div class="er"></div><button class="pr" id="cfm-go">' + T.login + '</button></div>';
    if (msg) showErr(msg);
    var go = document.getElementById('cfm-go');
    go.onclick = doLogin;
    box.querySelectorAll('input').forEach(function (i) { i.onkeydown = function (e) { if (e.key === 'Enter') doLogin(); }; });
  }
  async function doLogin() {
    var email = document.getElementById('cfm-e').value.trim(), pw = document.getElementById('cfm-p').value;
    if (!email || !pw) return;
    setBusy(true);
    try {
      var j = await auth('token?grant_type=password', { email: email, password: pw });
      var s = normalize(j);
      var uid = s.user && s.user.id;
      if (!(await isManager(s.access_token, uid))) { clearSession(); viewLogin(T.noAccess); return; }
      saveSession(s);
      var factors = ((s.user && s.user.factors) || []).filter(function (f) { return f.factor_type === 'totp' && f.status === 'verified'; });
      if (factors.length) viewMfa(factors[0].id); else viewEnroll();
    } catch (e) {
      setBusy(false);
      showErr(e.status === 400 ? T.wrong : (T.err + ': ' + e.message));
    }
  }
  function codeForm(btnText) {
    return '<label>' + T.code + '</label><input class="cd" id="cfm-c" inputmode="numeric" autocomplete="one-time-code" maxlength="6">' +
      '<div class="er"></div><button class="pr" id="cfm-v">' + btnText + '</button><button class="ln" id="cfm-b">' + T.back + '</button>';
  }
  function viewMfa(factorId) {
    box.innerHTML = '<div class="cb"><h2>🔐 ' + T.mfaTitle + '</h2><p>' + T.mfaText + '</p>' + codeForm(T.verify) + '</div>';
    wireCode(factorId);
  }
  async function viewEnroll() {
    box.innerHTML = '<div class="cb"><h2>🔐 ' + T.enrollTitle + '</h2><p>' + T.checking + '</p></div>';
    try {
      var f = await auth('factors', { factor_type: 'totp', issuer: 'Campus', friendly_name: 'Authenticator ' + Date.now() }, session.access_token);
      var qr = f.totp && f.totp.qr_code;
      box.innerHTML = '<div class="cb"><h2>🔐 ' + T.enrollTitle + '</h2><p>' + T.enrollText + '</p>' +
        '<div class="qr"><img alt="QR" src="' + esc(qr) + '"></div>' +
        '<p style="margin:0 0 4px;font-size:12px">' + T.secret + ':</p><div class="sc">' + esc(f.totp && f.totp.secret) + '</div>' + codeForm(T.verify) + '</div>';
      wireCode(f.id);
    } catch (e) {
      viewLogin(T.err + ': ' + e.message);
    }
  }
  function wireCode(factorId) {
    var c = document.getElementById('cfm-c');
    document.getElementById('cfm-b').onclick = function () { clearSession(); viewLogin(); };
    var submit = async function () {
      var code = c.value.replace(/\D/g, '');
      if (code.length !== 6) return;
      setBusy(true);
      try {
        var ch = await auth('factors/' + factorId + '/challenge', {}, session.access_token);
        var j = await auth('factors/' + factorId + '/verify', { challenge_id: ch.id, code: code }, session.access_token);
        var s = normalize(j); s.user = session.user; saveSession(s);
        done();
      } catch (e) {
        setBusy(false); c.value = ''; c.focus();
        showErr(e.status === 400 || e.status === 422 ? T.wrongCode : (T.err + ': ' + e.message));
      }
    };
    document.getElementById('cfm-v').onclick = submit;
    c.oninput = function () { if (c.value.replace(/\D/g, '').length === 6) submit(); };
    c.onkeydown = function (e) { if (e.key === 'Enter') submit(); };
    c.focus();
  }

  function done() {
    box.remove();
    document.documentElement.classList.remove('cfm-locked');
    var b = document.createElement('button');
    b.id = 'cfm-logout'; b.textContent = '🔒 ' + T.logout; b.onclick = logout;
    (document.body || document.documentElement).appendChild(b);
    if (!document.body) document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(b); });
    resolveReady();
  }

  // ---------- старт ----------
  (async function init() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        session = JSON.parse(raw);
        if (session.expires_at - Math.floor(Date.now() / 1000) < 90) await refresh();
        var claims = decodeJwt(session.access_token);
        var uid = claims.sub;
        if (claims.aal === 'aal2' && uid && (await isManager(session.access_token, uid))) { done(); return; }
      }
    } catch (e) { /* падаем на форму входа */ }
    clearSession();
    var go = function () { viewLogin(); };
    go();
  })();
})();

// Handy-Begleiter: die Seite fürs Handy. Daten nur per textContent einsetzen – nie als HTML.
// Gekoppelt wird mit dem Einmal-Code vom PC; der Geräte-Schlüssel liegt danach im localStorage des Handys.
// Texte werden beim Ausliefern in der gewählten Sprache eingesetzt.
import { getLang, t } from '../shared/i18n'

/** Text sicher als JS-Literal ins Skript einsetzen */
const js = (s: string): string => JSON.stringify(s).replace(/</g, '\\u003c')
export function companionIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0c0f16"/><path d="M14 40c4-12 10-20 18-20s14 8 18 20" fill="none" stroke="#9fb8ff" stroke-width="5" stroke-linecap="round"/><circle cx="32" cy="44" r="5" fill="#c4b5fd"/></svg>`
}

export function companionManifest(): string {
  return JSON.stringify({
    name: 'VibeDesk',
    short_name: 'VibeDesk',
    start_url: '/',
    display: 'standalone',
    background_color: '#07090d',
    theme_color: '#07090d',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }]
  })
}

export function companionPage(nonce: string): string {
  return `<!doctype html>
<html lang="${getLang()}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#07090d">
<meta name="apple-mobile-web-app-capable" content="yes">
<link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icon.svg">
<title>VibeDesk</title>
<style>
  :root { --bg: #07090d; --card: rgba(255,255,255,.055); --line: rgba(255,255,255,.09); --text: #e7ecf5; --dim: rgba(231,236,245,.58); --accent: #9fb8ff; --violet: #c4b5fd; --ok: #4ade80; --warn: #facc15; --bad: #f87171; --work: #60a5fa; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; background: radial-gradient(120% 60% at 50% -10%, #1a2140 0%, var(--bg) 60%) fixed, var(--bg); color: var(--text); font: 15px/1.45 -apple-system, 'Segoe UI', system-ui, sans-serif; min-height: 100%; }
  main { max-width: 560px; margin: 0 auto; padding: calc(14px + env(safe-area-inset-top)) 14px 190px; display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; gap: 10px; }
  header h1 { font-size: 19px; margin: 0; letter-spacing: .01em; }
  header .conn { margin-left: auto; font-size: 12.5px; color: var(--dim); display: flex; align-items: center; gap: 6px; }
  .dot { width: 9px; height: 9px; border-radius: 50%; background: #8b93a7; flex: none; }
  .dot.working { background: var(--work); animation: pulse 1.6s infinite; }
  .dot.waiting { background: var(--warn); }
  .dot.done, .dot.on { background: var(--ok); }
  .dot.error, .dot.off { background: var(--bad); }
  @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(96,165,250,.55); } 70% { box-shadow: 0 0 0 9px rgba(96,165,250,0); } 100% { box-shadow: 0 0 0 0 rgba(96,165,250,0); } }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 18px; padding: 14px; backdrop-filter: blur(14px); }
  .label { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); margin: 4px 2px -4px; }
  .ask { border-color: rgba(250,204,21,.45); background: rgba(250,204,21,.07); animation: pop .35s cubic-bezier(.2,.9,.3,1.3); }
  @keyframes pop { from { transform: translateY(10px) scale(.97); opacity: 0; } }
  .ask .what { font-weight: 650; font-size: 16px; }
  .ask .proj { font-size: 12.5px; color: var(--dim); }
  pre { margin: 10px 0 0; padding: 10px 12px; background: rgba(0,0,0,.35); border-radius: 12px; font: 12.5px/1.45 ui-monospace, 'Cascadia Code', Consolas, monospace; white-space: pre-wrap; word-break: break-word; max-height: 180px; overflow: auto; }
  .btns { display: flex; gap: 8px; margin-top: 12px; }
  button { font: inherit; color: inherit; border: 1px solid var(--line); background: rgba(255,255,255,.07); border-radius: 13px; padding: 12px 14px; font-weight: 600; flex: 1; cursor: pointer; touch-action: manipulation; }
  button:active { transform: scale(.97); }
  button:disabled { opacity: .45; }
  button.primary { background: linear-gradient(135deg, #7c9bff, #a78bfa); border-color: transparent; color: #0b0e17; }
  button.okb { background: rgba(74,222,128,.18); border-color: rgba(74,222,128,.4); }
  button.no { background: rgba(248,113,113,.12); border-color: rgba(248,113,113,.35); }
  .tabs { display: flex; gap: 8px; overflow-x: auto; scrollbar-width: none; }
  .tab { flex: none; display: flex; align-items: center; gap: 8px; padding: 9px 13px; border-radius: 99px; font-weight: 600; font-size: 14px; }
  .tab.sel { background: rgba(159,184,255,.16); border-color: rgba(159,184,255,.45); }
  .sess-head { display: flex; align-items: center; gap: 10px; }
  .sess-head b { font-size: 17px; }
  .sess-head .st { margin-left: auto; font-size: 13px; color: var(--dim); }
  .cur { margin-top: 6px; font: 12.5px ui-monospace, Consolas, monospace; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bar { height: 5px; border-radius: 99px; background: rgba(255,255,255,.09); overflow: hidden; margin-top: 10px; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), var(--violet)); transition: width .4s; }
  .step { font-size: 13px; color: var(--dim); margin-top: 6px; }
  .said { margin-top: 12px; padding: 11px 12px; border-radius: 13px; background: rgba(0,0,0,.25); font-size: 14px; white-space: pre-wrap; word-break: break-word; max-height: 7.2em; overflow: hidden; position: relative; }
  .said.open { max-height: none; }
  .said:not(.open)::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2.2em; background: linear-gradient(transparent, rgba(12,14,20,.95)); }
  .said .who { display: block; font-size: 11.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--violet); margin-bottom: 4px; }
  .sugg { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
  .sugg button { text-align: left; font-weight: 500; display: flex; flex-direction: column; gap: 2px; padding: 11px 13px; }
  .sugg button b { font-weight: 650; }
  .sugg button span { font-size: 12.5px; color: var(--dim); }
  .muted { color: var(--dim); font-size: 13.5px; }
  .think { display: inline-flex; align-items: center; gap: 8px; color: var(--violet); font-size: 13.5px; }
  .think::before { content: ''; width: 12px; height: 12px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .notes { display: flex; flex-direction: column; gap: 8px; }
  .note { display: flex; gap: 10px; align-items: baseline; font-size: 14px; }
  .note time { margin-left: auto; color: var(--dim); font-size: 12px; flex: none; }
  .composer { position: fixed; left: 0; right: 0; bottom: 0; padding: 10px 14px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(transparent, rgba(7,9,13,.92) 22%); }
  .composer .inner { max-width: 560px; margin: 0 auto; background: rgba(20,24,34,.92); border: 1px solid var(--line); border-radius: 20px; padding: 10px; backdrop-filter: blur(18px); box-shadow: 0 -8px 40px rgba(0,0,0,.4); }
  .composer .to { font-size: 12.5px; color: var(--dim); margin: 0 4px 6px; display: flex; gap: 6px; align-items: center; }
  .composer select { font: inherit; color: var(--text); background: rgba(255,255,255,.07); border: 1px solid var(--line); border-radius: 9px; padding: 3px 6px; max-width: 60%; }
  textarea { width: 100%; resize: none; font: inherit; font-size: 16px; color: var(--text); background: transparent; border: 0; outline: none; padding: 4px 6px; min-height: 44px; max-height: 140px; }
  .row { display: flex; gap: 8px; align-items: center; }
  .switch { flex: none; display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--dim); padding: 6px 4px; user-select: none; }
  .switch input { accent-color: #a78bfa; width: 18px; height: 18px; }
  .send { flex: none; padding: 11px 18px; }
  .toast { position: fixed; left: 14px; right: 14px; top: calc(12px + env(safe-area-inset-top)); max-width: 532px; margin: 0 auto; background: rgba(20,24,34,.96); border: 1px solid var(--line); border-radius: 14px; padding: 11px 14px; font-size: 14px; box-shadow: 0 10px 40px rgba(0,0,0,.5); transition: opacity .25s, transform .25s; z-index: 5; }
  .toast[hidden] { display: block; opacity: 0; transform: translateY(-12px); pointer-events: none; }
  .toast.bad { border-color: rgba(248,113,113,.5); }
  .pair { text-align: center; padding: 26px 18px; display: flex; flex-direction: column; gap: 12px; align-items: center; }
  .pair > b { font-size: 18px; }
  .code { width: 100%; max-width: 260px; text-align: center; font: 600 30px/1.2 ui-monospace, Consolas, monospace; letter-spacing: .35em; padding: 12px 8px 12px calc(8px + .35em); color: var(--text); background: rgba(0,0,0,.35); border: 1px solid var(--line); border-radius: 14px; outline: none; }
  .code:focus { border-color: rgba(159,184,255,.6); }
  .pair button { max-width: 260px; width: 100%; }
  .err { color: var(--bad); font-size: 13.5px; min-height: 1.2em; }
  .pc .down { color: var(--warn); font-weight: 600; }
  .link { background: none; border: 0; padding: 6px; color: var(--dim); font-size: 12.5px; font-weight: 500; text-decoration: underline; flex: none; }
  .asked { margin-top: 10px; font-size: 13.5px; color: var(--dim); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
  .asked b { color: var(--text); font-weight: 600; margin-right: 4px; }
  .acts { margin-top: 12px; display: flex; flex-direction: column; border-top: 1px solid var(--line); }
  .act { display: grid; grid-template-columns: 16px auto minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 9px 2px; margin: 0; border: 0; border-bottom: 1px solid rgba(255,255,255,.05); border-radius: 0; background: none; font-size: 13.5px; font-weight: 400; text-align: left; width: 100%; }
  .act:active { transform: none; background: rgba(255,255,255,.04); }
  .act .ic { width: 16px; height: 16px; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
  .act .ic.ok { color: var(--ok); }
  .act .ic.fail { color: var(--bad); }
  .act .ic.stopped { color: var(--dim); }
  .act .ic.open::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: var(--dim); }
  .act .ic.pending::before { content: ''; width: 9px; height: 9px; border-radius: 50%; border: 2px solid var(--work); border-right-color: transparent; animation: spin .8s linear infinite; }
  .act .tool { font-weight: 600; white-space: nowrap; }
  .act .tgt { font: 12.5px ui-monospace, 'Cascadia Code', Consolas, monospace; color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .act.open .tgt { white-space: pre-wrap; word-break: break-all; }
  .act time { color: var(--dim); font-size: 11.5px; white-space: nowrap; }
  .acts-more { display: block; margin: 6px auto 0; }
  .term-open { margin-top: 12px; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .term-open::before { content: '>_'; font: 700 12px ui-monospace, Consolas, monospace; color: var(--accent); }
  .hint { margin-top: 10px; font-size: 12.5px; color: var(--dim); }
  .sheet { position: fixed; inset: 0; z-index: 4; display: flex; flex-direction: column; background: #07090d; animation: rise .22s cubic-bezier(.2,.9,.3,1); }
  @keyframes rise { from { transform: translateY(24px); opacity: 0; } }
  .sheet-head { flex: none; display: flex; align-items: center; gap: 10px; padding: calc(10px + env(safe-area-inset-top)) 12px 10px; border-bottom: 1px solid var(--line); background: rgba(14,17,25,.96); }
  .sheet-head b { font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .sheet-head .st { font-size: 12.5px; color: var(--dim); white-space: nowrap; }
  .sheet-head .sp { flex: 1; }
  .sheet-head button { flex: none; padding: 7px 11px; font-size: 13px; border-radius: 10px; }
  .sheet-head button.on { background: rgba(159,184,255,.16); border-color: rgba(159,184,255,.45); }
  .sheet-head .x { width: 36px; height: 36px; padding: 0; font-size: 20px; line-height: 1; }
  .tbody { flex: 1; overflow-y: auto; padding: 10px 12px calc(20px + env(safe-area-inset-bottom)); font: 11.5px/1.5 ui-monospace, 'Cascadia Code', Consolas, 'Courier New', monospace; color: #dfe6f3; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; }
  .tbody .row { display: block; white-space: pre-wrap; overflow-wrap: anywhere; min-height: 1.5em; }
  .tbody.nowrap { overflow-x: auto; }
  .tbody.nowrap .row { white-space: pre; overflow-wrap: normal; width: max-content; min-width: 100%; }
  .tbody .sep { height: 0; min-height: 0; border-top: 1px solid rgba(255,255,255,.14); margin: .7em 0; }
  .tbody .fb { font-weight: 700; }
  .tbody .fi { font-style: italic; }
  .tbody .fu { text-decoration: underline; }
  .tbody .fd { opacity: .6; }
  .tbody .older { display: block; width: 100%; margin: 0 0 10px; padding: 9px; font: 500 13px -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }
  .tstate { padding: 22px 6px; text-align: center; font: 13.5px -apple-system, 'Segoe UI', system-ui, sans-serif; color: var(--dim); }
  .tnew { position: fixed; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 5; flex: none; padding: 9px 16px; border-radius: 99px; font-size: 13px; background: rgba(20,24,34,.96); box-shadow: 0 8px 30px rgba(0,0,0,.5); }
  .tnew:active { transform: translateX(-50%) scale(.97); }
  [hidden] { display: none !important; }
</style></head>
<body>
<main>
  <header><h1>VibeDesk</h1><span class="conn"><span class="dot" id="conn-dot"></span><span id="conn-text">${t('verbinde …')}</span></span></header>
  <div class="card pair" id="pair" hidden>
    <b>${t('Mit VibeDesk koppeln')}</b>
    <span class="muted">${t('Tippe am PC im Fenster „Handy-Begleiter“ auf „Handy koppeln“ und gib den Code hier ein.')}</span>
    <input class="code" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="${t('Code vom PC')}">
    <button class="primary" id="pair-btn">${t('Koppeln')}</button>
    <span class="err" id="pair-err"></span>
  </div>
  <div id="asks"></div>
  <div class="tabs" id="tabs"></div>
  <div id="session"></div>
  <div class="card" id="empty" hidden><b>${t('Gerade läuft keine Session.')}</b><div class="muted" style="margin-top:6px">${t('Schreib unten, was du bauen willst – VibeDesk startet Claude im gewählten Projekt.')}</div></div>
  <div class="label" id="notes-label" hidden>${t('Mitteilungen')}</div>
  <div class="card notes" id="notes" hidden></div>
  <div class="label" id="pc-label" hidden>PC</div>
  <div class="card pc" id="pc" hidden>
    <div class="muted" id="pc-text">${t('Bleibt wach, solange der Begleiter läuft.')}</div>
    <div class="btns" id="pc-btns"><button id="pc-sleep">${t('Standby')}</button><button class="no" id="pc-off">${t('Ausschalten')}</button></div>
    <div class="btns" id="pc-cancel-row" hidden><button class="okb" id="pc-cancel">${t('Ausschalten abbrechen')}</button></div>
  </div>
  <div class="row" id="unpair-row" hidden style="justify-content:center"><button class="link" id="unpair">${t('Dieses Handy abmelden')}</button></div>
</main>
<div class="composer" id="composer" hidden><div class="inner">
  <div class="to"><span id="to-label">${t('an')}</span><select id="target"></select></div>
  <textarea id="text" rows="2" placeholder="${t('Was soll Claude als Nächstes tun?')}"></textarea>
  <div class="row"><label class="switch"><input type="checkbox" id="polish" checked>✨ ${t('ausformulieren')}</label><span style="flex:1"></span><button class="primary send" id="send">${t('Senden')}</button></div>
</div></div>
<div class="sheet" id="sheet" hidden>
  <div class="sheet-head"><span class="dot" id="t-dot"></span><b id="t-name"></b><span class="st" id="t-st"></span><span class="sp"></span><button id="t-wrap">${t('Umbrechen')}</button><button class="x" id="t-close" aria-label="${t('Schließen')}">×</button></div>
  <div class="tbody" id="t-body"></div>
  <button class="tnew" id="t-new" hidden>↓ ${t('Neue Ausgabe')}</button>
</div>
<div class="toast" id="toast" hidden></div>
<script nonce="${nonce}">
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'vibedesk.key';
  var key = '';
  try { key = localStorage.getItem(KEY) || ''; } catch (_) {}
  try { $('polish').checked = localStorage.getItem('vibedesk.polish') !== '0'; } catch (_) {}

  var state = null, selected = '', pick = '', seenAsks = {}, autoAsked = {}, sending = false, expanded = {};
  var STATUS = { idle: ${js(t('bereit'))}, working: ${js(t('arbeitet'))}, waiting: ${js(t('wartet auf dich'))}, done: ${js(t('fertig'))}, error: ${js(t('abgestürzt'))} };
  var FAILED = ${js(t('Hat nicht geklappt.'))};
  function fmt(s, v) { return s.replace(/\\{(\\w+)\\}/g, function (m, k) { return k in v ? String(v[k]) : m; }); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  var toastTimer;
  function toast(text, bad) {
    var t = $('toast'); t.textContent = text; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 5000 : 3500);
  }
  function ago(ts) { var s = Math.max(0, Math.round((Date.now() - ts) / 1000)); if (s < 60) return ${js(t('gerade'))}; if (s < 3600) return Math.round(s / 60) + ' min'; return Math.round(s / 3600) + ' h'; }

  function api(path, body) {
    return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key }, body: JSON.stringify(body) })
      .then(function (r) { if (r.status === 401) unpaired(); return r.json(); })
      .catch(function () { return { ok: false, error: 'Keine Verbindung zu VibeDesk.' }; });
  }

  var HIDE = ['composer', 'session', 'tabs', 'asks', 'empty', 'notes', 'notes-label', 'pc', 'pc-label', 'unpair-row'];
  function unpaired() {
    try { localStorage.removeItem(KEY); } catch (_) {}
    key = ''; state = null;
    if (ctrl) ctrl.abort();
    if (tm) closeTerm();
    HIDE.forEach(function (id) { $(id).hidden = true; });
    $('pair').hidden = false; setConn('off', ${js(t('nicht gekoppelt'))});
  }

  // ---------- Koppeln ----------

  function pair() {
    var code = $('code').value.replace(/\\D/g, '');
    if (code.length !== 6) { $('pair-err').textContent = ${js(t('Der Code hat 6 Ziffern.'))}; return; }
    $('pair-btn').disabled = true; $('pair-err').textContent = '';
    fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        $('pair-btn').disabled = false;
        if (!r.ok) { $('pair-err').textContent = r.error || FAILED; $('code').value = ''; return; }
        key = r.token;
        try { localStorage.setItem(KEY, key); } catch (_) {}
        $('pair').hidden = true; $('code').value = '';
        ['session', 'tabs', 'asks'].forEach(function (id) { $(id).hidden = false; });
        toast(fmt(${js(t('Gekoppelt als „{name}“'))}, { name: r.name }));
        connect();
      })
      .catch(function () { $('pair-btn').disabled = false; $('pair-err').textContent = 'Keine Verbindung zu VibeDesk.'; });
  }
  $('pair-btn').onclick = pair;
  $('code').addEventListener('input', function () { if ($('code').value.replace(/\\D/g, '').length === 6) pair(); });
  function setConn(cls, text) { $('conn-dot').className = 'dot ' + cls; $('conn-text').textContent = text; }

  // ---------- Darstellung ----------

  function sessionById(id) { return state && state.sessions.filter(function (s) { return s.id === id; })[0]; }
  function projectName(sid) { var s = sessionById(sid); return s ? s.name : ''; }

  function renderAsks() {
    var box = $('asks'); clear(box);
    var list = state.permissions || [];
    var fresh = false;
    list.forEach(function (a) {
      if (!seenAsks[a.id]) { seenAsks[a.id] = 1; fresh = true; }
      var c = el('div', 'card ask');
      c.appendChild(el('div', 'proj', fmt(${js(t('Freigabe · {name}'))}, { name: projectName(a.sessionId) || 'Claude' })));
      c.appendChild(el('div', 'what', a.summary));
      if (a.detail) c.appendChild(el('pre', '', a.detail));
      var b = el('div', 'btns');
      var yes = el('button', 'okb', ${js(t('Erlauben'))}); yes.onclick = function () { decide(a.id, 'allow', yes); };
      b.appendChild(yes);
      if (a.canAlways) { var always = el('button', '', ${js(t('Immer'))}); always.onclick = function () { decide(a.id, 'always', always); }; b.appendChild(always); }
      var no = el('button', 'no', ${js(t('Ablehnen'))}); no.onclick = function () { decide(a.id, 'deny', no); };
      b.appendChild(no);
      c.appendChild(b);
      box.appendChild(c);
    });
    if (fresh && navigator.vibrate) try { navigator.vibrate([60, 40, 60]); } catch (_) {}
    document.title = list.length ? '(' + list.length + ') VibeDesk' : 'VibeDesk';
  }

  function decide(id, decision, btn) {
    btn.disabled = true;
    api('/api/permission', { id: id, decision: decision }).then(function (r) {
      if (!r.ok) toast(r.error || FAILED, true);
      else toast(decision === 'deny' ? ${js(t('Abgelehnt'))} : decision === 'always' ? ${js(t('Erlaubt – ab jetzt immer'))} : ${js(t('Erlaubt'))});
    });
  }

  function renderTabs() {
    var tabs = $('tabs'); clear(tabs);
    var list = state.sessions;
    if (!list.some(function (s) { return s.id === selected; })) {
      var waiting = list.filter(function (s) { return s.status === 'waiting'; })[0];
      selected = (waiting || list[0] || {}).id || '';
    }
    tabs.hidden = list.length < 2;
    list.forEach(function (s) {
      var t = el('button', 'tab' + (s.id === selected ? ' sel' : ''));
      t.appendChild(el('span', 'dot ' + s.status));
      t.appendChild(el('span', '', s.name));
      t.onclick = function () { selected = s.id; render(); };
      tabs.appendChild(t);
    });
  }

  function renderSession() {
    var box = $('session'); clear(box);
    var s = sessionById(selected);
    $('empty').hidden = !!s || !state.projects.length;
    if (!s) return;
    var c = el('div', 'card');
    var h = el('div', 'sess-head');
    h.appendChild(el('span', 'dot ' + s.status));
    h.appendChild(el('b', '', s.name));
    h.appendChild(el('span', 'st', STATUS[s.status] || s.status));
    c.appendChild(h);
    if (s.asked) { var asked = el('div', 'asked'); asked.appendChild(el('b', '', ${js(t('Du:'))})); asked.appendChild(document.createTextNode(s.asked)); c.appendChild(asked); }
    // ohne Aktionsliste wenigstens die laufende Aktion zeigen
    if (s.status === 'working' && s.current && !(s.feed && s.feed.length)) c.appendChild(el('div', 'cur', s.current));
    if (s.todos && s.todos.total) {
      var bar = el('div', 'bar'); var fill = el('i'); fill.style.width = (s.todos.done / s.todos.total * 100) + '%'; bar.appendChild(fill); c.appendChild(bar);
      c.appendChild(el('div', 'step', fmt(${js(t('{done} von {total}'))}, { done: s.todos.done, total: s.todos.total }) + (s.todos.active ? ' · ' + s.todos.active : '')));
    }
    if (s.said) {
      var said = el('div', 'said' + (expanded[s.id] ? ' open' : ''));
      said.appendChild(el('span', 'who', 'Claude'));
      said.appendChild(document.createTextNode(s.said));
      said.onclick = function () { expanded[s.id] = !expanded[s.id]; said.classList.toggle('open'); };
      c.appendChild(said);
    }
    var busy = state.busy && state.busy[s.id];
    var sug = el('div', 'sugg');
    if (busy === 'suggest') sug.appendChild(el('span', 'think', ${js(t('Claude überlegt, wie es weitergeht …'))}));
    else if (busy === 'polish') sug.appendChild(el('span', 'think', ${js(t('Claude formuliert deinen Prompt …'))}));
    else if (s.suggestions && s.suggestions.length) {
      s.suggestions.forEach(function (g) {
        var b = el('button');
        b.appendChild(el('b', '', g.title));
        b.appendChild(el('span', '', g.prompt));
        b.onclick = function () { send(g.prompt, false); };
        sug.appendChild(b);
      });
    } else if (s.status !== 'working') {
      var more = el('button', '', '💡 ' + ${js(t('Wie geht es weiter?'))});
      more.onclick = function () { suggest(s.id); };
      sug.appendChild(more);
    }
    c.appendChild(sug);
    renderActs(c, s);
    if (state.terminal) {
      var to = el('button', 'term-open', ${js(t('Terminal ansehen'))});
      to.onclick = function () { openTerm(s.id); };
      c.appendChild(to);
    } else c.appendChild(el('div', 'hint', ${js(t('Ganzes Terminal sehen? Am PC im Fenster „Handy-Begleiter“ unter „Terminal“ einschalten.'))}));
    box.appendChild(c);
    // Ist Claude fertig oder wartet, gleich Vorschläge holen – einmal pro Stand
    if (!busy && !s.suggestions && (s.status === 'done' || s.status === 'waiting') && s.said && !hasAsk(s.id)) {
      var k = s.id + '|' + s.said.length + s.said.slice(-30);
      if (!autoAsked[k] && !document.hidden) { autoAsked[k] = 1; suggest(s.id, true); }
    }
  }
  function hasAsk(sid) { return (state.permissions || []).some(function (a) { return a.sessionId === sid; }); }

  function suggest(sid, quiet) {
    api('/api/suggest', { sessionId: sid }).then(function (r) { if (!r.ok && !quiet) toast(r.error || ${js(t('Keine Vorschläge.'))}, true); });
  }

  function renderNotes() {
    var n = (state.notices || []).slice(0, 8);
    $('notes').hidden = $('notes-label').hidden = !n.length;
    var box = $('notes'); clear(box);
    n.forEach(function (x) {
      var row = el('div', 'note');
      row.appendChild(el('span', 'dot ' + (x.kind === 'error' ? 'error' : x.kind === 'waiting' || x.kind === 'watch' ? 'waiting' : 'done')));
      row.appendChild(el('span', '', x.title));
      var t = el('time', '', ago(x.time)); row.appendChild(t);
      box.appendChild(row);
    });
  }

  function renderTarget() {
    var sel = $('target');
    var prev = sel.value;
    clear(sel);
    state.sessions.forEach(function (s) { var o = el('option', '', s.name); o.value = 's:' + s.id; sel.appendChild(o); });
    var running = {}; state.sessions.forEach(function (s) { running[s.projectId] = 1; });
    state.projects.filter(function (p) { return !running[p.id]; }).forEach(function (p) { var o = el('option', '', fmt(${js(t('{name} (neue Session)'))}, { name: p.name })); o.value = 'p:' + p.id; sel.appendChild(o); });
    var want = pick || (selected ? 's:' + selected : prev);
    if ([].some.call(sel.options, function (o) { return o.value === want; })) sel.value = want;
    $('composer').hidden = !sel.options.length;
  }

  // ---------- Was gerade passiert ----------

  var TOOLS = { Bash: ${js(t('Befehl'))}, Read: ${js(t('Liest'))}, Edit: ${js(t('Ändert'))}, MultiEdit: ${js(t('Ändert'))}, Write: ${js(t('Schreibt'))}, NotebookEdit: ${js(t('Ändert'))}, Grep: ${js(t('Sucht'))}, Glob: ${js(t('Sucht'))}, WebFetch: ${js(t('Lädt Webseite'))}, WebSearch: ${js(t('Sucht im Web'))}, Task: ${js(t('Agent'))}, Agent: ${js(t('Agent'))}, TodoWrite: ${js(t('Plan'))}, TaskCreate: ${js(t('Plan'))}, TaskUpdate: ${js(t('Plan'))} };
  var ICON = { ok: '✓', fail: '✕', stopped: '■', pending: '' };
  var actsOpen = {}, actOpen = {};
  function toolName(n) { if (TOOLS[n]) return TOOLS[n]; var m = /^mcp__.+?__(.+)$/.exec(n); return m ? m[1] : n; }
  function renderActs(card, s) {
    var feed = (s.feed || []).slice().reverse();
    if (!feed.length) return;
    var all = actsOpen[s.id], list = all ? feed : feed.slice(0, 5);
    var box = el('div', 'acts');
    // nur die neueste offene Aktion läuft wirklich – und nur, solange Claude arbeitet
    var live = s.status === 'working' ? feed.filter(function (f) { return f.result === 'pending'; })[0] : null;
    list.forEach(function (f) {
      var k = s.id + '|' + f.ts + '|' + f.tool + '|' + f.target;
      var row = el('button', 'act' + (actOpen[k] ? ' open' : ''));
      var res = f.result === 'pending' && f !== live ? 'open' : f.result;
      row.appendChild(el('span', 'ic ' + res, ICON[res] || ''));
      row.appendChild(el('span', 'tool', toolName(f.tool)));
      row.appendChild(el('span', 'tgt', f.target || ''));
      row.appendChild(el('time', '', f.ts ? ago(f.ts) : ''));
      row.onclick = function () { actOpen[k] = !actOpen[k]; row.classList.toggle('open'); };
      box.appendChild(row);
    });
    card.appendChild(box);
    if (feed.length > 5) {
      var more = el('button', 'link acts-more', all ? ${js(t('Weniger anzeigen'))} : fmt(${js(t('Alle {n} Schritte'))}, { n: feed.length }));
      more.onclick = function () { actsOpen[s.id] = !all; render(); };
      card.appendChild(more);
    }
  }

  // ---------- Terminal (nur wenn am PC freigegeben) ----------

  var KEEP = 6000, BIG = 999999999999;
  var tm = null;
  var wrap = true;
  try { wrap = localStorage.getItem('vibedesk.wrap') !== '0'; } catch (_) {}
  function fresh(sid) { return { sid: sid, epoch: 0, v: 0, base: 0, lines: [], first: 0, end: 0, rows: 0, done: 0, ctrl: null, follow: true, rowEl: [], olderBusy: false }; }

  function openTerm(sid) {
    closeTerm();
    tm = fresh(sid);
    $('sheet').hidden = false;
    document.body.style.overflow = 'hidden';
    setWrap(wrap);
    headTerm();
    tstate(${js(t('Lade Terminal …'))});
    pull(tm, false);
  }
  function closeTerm() {
    if (tm && tm.ctrl) tm.ctrl.abort();
    tm = null;
    $('sheet').hidden = true; $('t-new').hidden = true;
    document.body.style.overflow = '';
    clear($('t-body'));
  }
  $('t-close').onclick = function () { closeTerm(); };
  $('t-wrap').onclick = function () { setWrap(!wrap); try { localStorage.setItem('vibedesk.wrap', wrap ? '1' : '0'); } catch (_) {} };
  function setWrap(on) { wrap = on; $('t-body').classList.toggle('nowrap', !on); $('t-wrap').classList.toggle('on', on); }
  function headTerm() {
    if (!tm) return;
    var s = sessionById(tm.sid);
    $('t-name').textContent = s ? s.name : ${js(t('Session beendet'))};
    $('t-dot').className = 'dot ' + (s ? s.status : 'off');
    $('t-st').textContent = s ? (STATUS[s.status] || s.status) : '';
  }
  function tstate(text) { var b = $('t-body'); clear(b); if (tm) tm.rowEl = []; b.appendChild(el('div', 'tstate', text)); }

  // live: wartet am PC auf die nächste Änderung; older: ältere Zeilen vor der ersten geladenen
  function pull(t, older) {
    if (tm !== t) return;
    var url = '/api/term?s=' + encodeURIComponent(t.sid) + '&e=' + t.epoch + '&v=' + t.v + (older ? '&h=0&b=' + t.base : '&h=' + (t.epoch ? t.done + '&w=1' : BIG));
    var ctrl = new AbortController();
    if (!older) t.ctrl = ctrl;
    fetch(url, { headers: { authorization: 'Bearer ' + key }, cache: 'no-store', signal: ctrl.signal }).then(function (r) {
      if (r.status === 401) { closeTerm(); return unpaired(); }
      if (r.status === 403) { closeTerm(); return toast(${js(t('Das Terminal ist am PC nicht mehr freigegeben.'))}, true); }
      return r.json().then(function (j) {
        if (tm !== t) return;
        if (!j.ok) throw new Error(j.error || FAILED);
        var opening = !t.epoch;
        apply(t, j.chunk, older);
        if (older) { t.olderBusy = false; return; }
        // gleich beim Öffnen etwas Verlauf dazuholen
        if (opening && t.base > t.first) { t.olderBusy = true; pull(t, true); }
        pull(t, false);
      });
    }).catch(function (e) {
      if (tm !== t || (e && e.name === 'AbortError')) return;
      if (older) { t.olderBusy = false; paintOlder(t); return; }
      if (!t.lines.length) tstate((e && e.message) || ${js(t('Keine Verbindung zu VibeDesk.'))});
      setTimeout(function () { if (tm === t) pull(t, false); }, 2500);
    });
  }

  function apply(t, c, older) {
    if (c.same) return;
    var from = 0, keepPos = false;
    if (c.epoch !== t.epoch) { t.lines = c.lines; t.base = c.start; }
    else if (older) {
      if (c.start < t.base) { t.lines = c.lines.slice(0, t.base - c.start).concat(t.lines); t.base = c.start; keepPos = true; }
    } else if (c.start < t.base || c.start > t.base + t.lines.length) { t.lines = c.lines; t.base = c.start; }
    else { from = c.start - t.base; t.lines = t.lines.slice(0, from).concat(c.lines); }
    if (t.lines.length > KEEP) { var cut = t.lines.length - KEEP; t.lines = t.lines.slice(cut); t.base += cut; from = 0; }
    t.epoch = c.epoch; t.v = c.v; t.first = c.first; t.end = c.end; t.rows = c.rows;
    t.done = Math.max(t.base, c.end - c.rows);
    paint(t, from, keepPos);
  }

  function paintOlder(t) {
    var body = $('t-body'), btn = body.querySelector('.older');
    if (t.base > t.first) {
      if (!btn) {
        btn = el('button', 'older');
        btn.onclick = function () { if (t.olderBusy) return; t.olderBusy = true; btn.textContent = ${js(t('Lade …'))}; pull(t, true); };
        body.insertBefore(btn, body.firstChild);
      }
      btn.textContent = t.olderBusy ? ${js(t('Lade …'))} : ${js(t('Ältere Zeilen laden'))};
    } else if (btn) body.removeChild(btn);
  }

  // Zeilen zeichnen: ab „from“ neu – weich umbrochene Pufferzeilen werden wieder eine Zeile
  var SEP = /^[\\s─━═╌┄╍-]+$/;
  function paint(t, from, keepPos) {
    var body = $('t-body');
    var atBottom = body.scrollHeight - body.scrollTop - body.clientHeight < 40;
    var oldH = body.scrollHeight, oldTop = body.scrollTop;
    while (from > 0 && t.lines[from] && t.lines[from].w) from--;
    var anchor = from > 0 ? t.rowEl[from] : null;
    if (!anchor) { clear(body); t.rowEl = []; from = 0; }
    else {
      while (anchor.nextSibling) body.removeChild(anchor.nextSibling);
      body.removeChild(anchor);
      t.rowEl.length = from;
    }
    var row = null, frag = document.createDocumentFragment();
    for (var i = from; i < t.lines.length; i++) {
      var L = t.lines[i];
      if (!L.w || !row) { if (row) finishRow(row); row = el('div', 'row'); frag.appendChild(row); }
      t.rowEl[i] = row;
      for (var k = 0; k < L.r.length; k++) {
        var r = L.r[k], sp = el('span', '', r.t);
        if (r.f) sp.style.color = r.f;
        if (r.b) sp.style.background = r.b;
        if (r.s) sp.className = ((r.s & 1 ? 'fb ' : '') + (r.s & 2 ? 'fi ' : '') + (r.s & 4 ? 'fu ' : '') + (r.s & 8 ? 'fd' : '')).trim();
        row.appendChild(sp);
      }
    }
    if (row) finishRow(row);
    body.appendChild(frag);
    paintOlder(t);
    if (!t.lines.length) { tstate(${js(t('Noch keine Ausgabe.'))}); return; }
    if (keepPos) body.scrollTop = oldTop + (body.scrollHeight - oldH);
    else if (t.follow || atBottom) { body.scrollTop = body.scrollHeight; t.follow = true; $('t-new').hidden = true; }
    else $('t-new').hidden = false;
  }
  // Trennlinien aus ─── werden eine saubere Linie statt umbrochener Striche
  function finishRow(row) {
    var tx = row.textContent;
    if (tx.length >= 10 && SEP.test(tx) && (tx.match(/[─━═╌┄╍]/g) || []).length >= 10) { clear(row); row.className = 'row sep'; }
  }
  $('t-body').addEventListener('scroll', function () {
    if (!tm) return;
    var b = $('t-body');
    tm.follow = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
    if (tm.follow) $('t-new').hidden = true;
  }, { passive: true });
  $('t-new').onclick = function () { var b = $('t-body'); b.scrollTop = b.scrollHeight; if (tm) tm.follow = true; $('t-new').hidden = true; };

  // ---------- PC ----------

  var armedBtn = null;
  function renderPc() {
    $('pc').hidden = $('pc-label').hidden = $('unpair-row').hidden = false;
    var at = state.shutdownAt;
    $('pc-btns').hidden = !!at; $('pc-cancel-row').hidden = !at;
    $('pc-text').className = at ? 'down' : 'muted';
    $('pc-text').textContent = at ? fmt(${js(t('Fährt in {s} s herunter …'))}, { s: Math.max(0, Math.ceil((at - Date.now()) / 1000)) }) : ${js(t('Bleibt wach, solange der Begleiter läuft.'))};
  }
  function power(action) {
    api('/api/power', { action: action }).then(function (r) {
      if (!r.ok) return toast(r.error || FAILED, true);
      if (action === 'sleep') toast(${js(t('PC geht in den Standby – gute Nacht.'))});
      if (action === 'cancel') toast(${js(t('Ausschalten abgebrochen'))});
    });
  }
  // zweimal tippen: erst scharf machen, dann ausführen
  function twice(btn, label, ask, run) {
    if (armedBtn === btn) { clearTimeout(btn._t); armedBtn = null; btn.textContent = label; return run(); }
    if (armedBtn) { clearTimeout(armedBtn._t); armedBtn.textContent = armedBtn._label; }
    armedBtn = btn; btn._label = label; btn.textContent = ask;
    btn._t = setTimeout(function () { armedBtn = null; btn.textContent = label; }, 4000);
  }
  $('pc-off').onclick = function () { twice($('pc-off'), ${js(t('Ausschalten'))}, ${js(t('Wirklich? Sessions enden'))}, function () { power('shutdown'); }); };
  $('pc-sleep').onclick = function () { twice($('pc-sleep'), ${js(t('Standby'))}, ${js(t('Wirklich Standby?'))}, function () { power('sleep'); }); };
  $('pc-cancel').onclick = function () { power('cancel'); };
  $('unpair').onclick = function () { twice($('unpair'), ${js(t('Dieses Handy abmelden'))}, ${js(t('Nochmal tippen zum Abmelden'))}, function () { api('/api/unpair', {}).then(unpaired); }); };

  function render() {
    if (!state) return;
    renderAsks(); renderTabs(); renderSession(); renderNotes(); renderTarget(); renderPc();
    if (tm) { if (!state.terminal) { closeTerm(); toast(${js(t('Das Terminal ist am PC nicht mehr freigegeben.'))}, true); } else headTerm(); }
  }

  // ---------- Senden ----------

  function send(text, polish) {
    if (sending) return;
    var v = $('target').value || '';
    if (!text.trim() || !v) return;
    var body = { text: text, polish: polish };
    if (v.indexOf('s:') === 0) body.sessionId = v.slice(2); else body.projectId = v.slice(2);
    sending = true; $('send').disabled = true;
    if (polish) toast(${js(t('Claude formuliert deinen Prompt …'))});
    api('/api/prompt', body).then(function (r) {
      sending = false; $('send').disabled = false;
      if (!r.ok) return toast(r.error || FAILED, true);
      if (text === $('text').value) { $('text').value = ''; grow(); }
      pick = '';
      toast(fmt(${js(t('Gesendet: {text}'))}, { text: r.text }));
    });
  }
  $('send').onclick = function () { send($('text').value, $('polish').checked); };
  $('polish').onchange = function () { try { localStorage.setItem('vibedesk.polish', $('polish').checked ? '1' : '0'); } catch (_) {} };
  // „neue Session in …“ bleibt gewählt, bis gesendet wurde
  $('target').onchange = function () { var v = $('target').value; pick = ''; if (v.indexOf('s:') === 0) { selected = v.slice(2); render(); } else pick = v; };
  function grow() { var t = $('text'); t.style.height = 'auto'; t.style.height = Math.min(140, t.scrollHeight) + 'px'; }
  $('text').addEventListener('input', grow);

  // ---------- Live-Verbindung (SSE über fetch, damit der Schlüssel im Header bleibt) ----------

  var ctrl = null, retry = null;
  // Über den Internet-Link (Cloudflare) kommt SSE erst am Ende an – dort Long-Polling
  var polling = /\\.trycloudflare\\.com$/i.test(location.hostname);
  function poll(my, v) {
    return fetch('/api/poll?v=' + v, { headers: { authorization: 'Bearer ' + key }, cache: 'no-store', signal: my.signal }).then(function (r) {
      if (r.status === 401) return unpaired();
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json().then(function (j) {
        if (my !== ctrl) return;
        setConn('on', ${js(t('verbunden'))});
        if (j.state && j.state.sessions) { state = j.state; render(); }
        return poll(my, j.v);
      });
    });
  }
  function connect() {
    if (!key) return unpaired();
    if (ctrl) ctrl.abort();
    clearTimeout(retry);
    var my = ctrl = new AbortController();
    setConn('', ${js(t('verbinde …'))});
    if (polling) return poll(my, -1).catch(function () {
      if (my !== ctrl || !key) return;
      setConn('off', ${js(t('getrennt – versuche erneut …'))});
      retry = setTimeout(connect, 2500);
    });
    fetch('/api/events', { headers: { authorization: 'Bearer ' + key }, cache: 'no-store', signal: my.signal }).then(function (r) {
      if (r.status === 401) return unpaired();
      if (!r.ok || !r.body) throw new Error('http ' + r.status);
      setConn('on', ${js(t('verbunden'))});
      var rd = r.body.getReader(), dec = new TextDecoder(), buf = '';
      function pump() {
        return rd.read().then(function (x) {
          if (x.done) throw new Error('eof');
          buf += dec.decode(x.value, { stream: true });
          var i;
          while ((i = buf.indexOf('\\n\\n')) >= 0) {
            var chunk = buf.slice(0, i); buf = buf.slice(i + 2);
            var data = chunk.split('\\n').filter(function (l) { return l.indexOf('data: ') === 0; }).map(function (l) { return l.slice(6); }).join('\\n');
            if (data) { try { var st = JSON.parse(data); if (st && st.sessions) { state = st; render(); } } catch (_) {} }
          }
          return pump();
        });
      }
      return pump();
    }).catch(function () {
      if (my !== ctrl || !key) return;
      setConn('off', ${js(t('getrennt – versuche erneut …'))});
      retry = setTimeout(connect, 2500);
    });
  }
  // Handys kappen Verbindungen im Standby – beim Zurückkommen sofort neu verbinden
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { connect(); render(); if (tm) { if (tm.ctrl) tm.ctrl.abort(); pull(tm, false); } }
  });
  setInterval(function () { if (state) renderNotes(); }, 30000);
  setInterval(function () { if (state && state.shutdownAt) renderPc(); }, 1000);
  connect();
})();
</script>
</body></html>`
}

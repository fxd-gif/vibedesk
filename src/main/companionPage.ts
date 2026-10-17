// Handy-Begleiter: die Seite fürs Handy. Daten nur per textContent einsetzen – nie als HTML.
// Gekoppelt wird mit dem Einmal-Code vom PC; der Geräte-Schlüssel liegt danach im localStorage des Handys.

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
<html lang="de"><head><meta charset="utf-8">
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
  [hidden] { display: none !important; }
</style></head>
<body>
<main>
  <header><h1>VibeDesk</h1><span class="conn"><span class="dot" id="conn-dot"></span><span id="conn-text">verbinde …</span></span></header>
  <div class="card pair" id="pair" hidden>
    <b>Mit VibeDesk koppeln</b>
    <span class="muted">Tippe am PC im Fenster „Handy-Begleiter“ auf „Handy koppeln“ und gib den Code hier ein.</span>
    <input class="code" id="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="••••••" aria-label="Code vom PC">
    <button class="primary" id="pair-btn">Koppeln</button>
    <span class="err" id="pair-err"></span>
  </div>
  <div id="asks"></div>
  <div class="tabs" id="tabs"></div>
  <div id="session"></div>
  <div class="card" id="empty" hidden><b>Gerade läuft keine Session.</b><div class="muted" style="margin-top:6px">Schreib unten, was du bauen willst – VibeDesk startet Claude im gewählten Projekt.</div></div>
  <div class="label" id="notes-label" hidden>Mitteilungen</div>
  <div class="card notes" id="notes" hidden></div>
  <div class="label" id="pc-label" hidden>PC</div>
  <div class="card pc" id="pc" hidden>
    <div class="muted" id="pc-text">Bleibt wach, solange der Begleiter läuft.</div>
    <div class="btns" id="pc-btns"><button id="pc-sleep">Standby</button><button class="no" id="pc-off">Ausschalten</button></div>
    <div class="btns" id="pc-cancel-row" hidden><button class="okb" id="pc-cancel">Ausschalten abbrechen</button></div>
  </div>
  <div class="row" id="unpair-row" hidden style="justify-content:center"><button class="link" id="unpair">Dieses Handy abmelden</button></div>
</main>
<div class="composer" id="composer" hidden><div class="inner">
  <div class="to"><span id="to-label">an</span><select id="target"></select></div>
  <textarea id="text" rows="2" placeholder="Was soll Claude als Nächstes tun?"></textarea>
  <div class="row"><label class="switch"><input type="checkbox" id="polish" checked>✨ ausformulieren</label><span style="flex:1"></span><button class="primary send" id="send">Senden</button></div>
</div></div>
<div class="toast" id="toast" hidden></div>
<script nonce="${nonce}">
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var KEY = 'vibedesk.key';
  var key = '';
  try { key = localStorage.getItem(KEY) || ''; } catch (_) {}
  try { $('polish').checked = localStorage.getItem('vibedesk.polish') !== '0'; } catch (_) {}

  var state = null, selected = '', pick = '', seenAsks = {}, autoAsked = {}, sending = false, expanded = {};
  var STATUS = { idle: 'bereit', working: 'arbeitet', waiting: 'wartet auf dich', done: 'fertig', error: 'abgestürzt' };

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
  var toastTimer;
  function toast(text, bad) {
    var t = $('toast'); t.textContent = text; t.className = 'toast' + (bad ? ' bad' : ''); t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.hidden = true; }, bad ? 5000 : 3500);
  }
  function ago(ts) { var s = Math.max(0, Math.round((Date.now() - ts) / 1000)); if (s < 60) return 'gerade'; if (s < 3600) return Math.round(s / 60) + ' min'; return Math.round(s / 3600) + ' h'; }

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
    HIDE.forEach(function (id) { $(id).hidden = true; });
    $('pair').hidden = false; setConn('off', 'nicht gekoppelt');
  }

  // ---------- Koppeln ----------

  function pair() {
    var code = $('code').value.replace(/\\D/g, '');
    if (code.length !== 6) { $('pair-err').textContent = 'Der Code hat 6 Ziffern.'; return; }
    $('pair-btn').disabled = true; $('pair-err').textContent = '';
    fetch('/api/pair', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: code }) })
      .then(function (r) { return r.json(); })
      .then(function (r) {
        $('pair-btn').disabled = false;
        if (!r.ok) { $('pair-err').textContent = r.error || 'Hat nicht geklappt.'; $('code').value = ''; return; }
        key = r.token;
        try { localStorage.setItem(KEY, key); } catch (_) {}
        $('pair').hidden = true; $('code').value = '';
        ['session', 'tabs', 'asks'].forEach(function (id) { $(id).hidden = false; });
        toast('Gekoppelt als „' + r.name + '“');
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
      c.appendChild(el('div', 'proj', 'Freigabe · ' + (projectName(a.sessionId) || 'Claude')));
      c.appendChild(el('div', 'what', a.summary));
      if (a.detail) c.appendChild(el('pre', '', a.detail));
      var b = el('div', 'btns');
      var yes = el('button', 'okb', 'Erlauben'); yes.onclick = function () { decide(a.id, 'allow', yes); };
      b.appendChild(yes);
      if (a.canAlways) { var always = el('button', '', 'Immer'); always.onclick = function () { decide(a.id, 'always', always); }; b.appendChild(always); }
      var no = el('button', 'no', 'Ablehnen'); no.onclick = function () { decide(a.id, 'deny', no); };
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
      if (!r.ok) toast(r.error || 'Hat nicht geklappt.', true);
      else toast(decision === 'deny' ? 'Abgelehnt' : decision === 'always' ? 'Erlaubt – ab jetzt immer' : 'Erlaubt');
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
    if (s.status === 'working' && s.current) c.appendChild(el('div', 'cur', s.current));
    if (s.todos && s.todos.total) {
      var bar = el('div', 'bar'); var fill = el('i'); fill.style.width = (s.todos.done / s.todos.total * 100) + '%'; bar.appendChild(fill); c.appendChild(bar);
      c.appendChild(el('div', 'step', s.todos.done + ' von ' + s.todos.total + (s.todos.active ? ' · ' + s.todos.active : '')));
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
    if (busy === 'suggest') sug.appendChild(el('span', 'think', 'Claude überlegt, wie es weitergeht …'));
    else if (busy === 'polish') sug.appendChild(el('span', 'think', 'Claude formuliert deinen Prompt …'));
    else if (s.suggestions && s.suggestions.length) {
      s.suggestions.forEach(function (g) {
        var b = el('button');
        b.appendChild(el('b', '', g.title));
        b.appendChild(el('span', '', g.prompt));
        b.onclick = function () { send(g.prompt, false); };
        sug.appendChild(b);
      });
    } else if (s.status !== 'working') {
      var more = el('button', '', '💡 Wie geht es weiter?');
      more.onclick = function () { suggest(s.id); };
      sug.appendChild(more);
    }
    c.appendChild(sug);
    box.appendChild(c);
    // Ist Claude fertig oder wartet, gleich Vorschläge holen – einmal pro Stand
    if (!busy && !s.suggestions && (s.status === 'done' || s.status === 'waiting') && s.said && !hasAsk(s.id)) {
      var k = s.id + '|' + s.said.length + s.said.slice(-30);
      if (!autoAsked[k] && !document.hidden) { autoAsked[k] = 1; suggest(s.id, true); }
    }
  }
  function hasAsk(sid) { return (state.permissions || []).some(function (a) { return a.sessionId === sid; }); }

  function suggest(sid, quiet) {
    api('/api/suggest', { sessionId: sid }).then(function (r) { if (!r.ok && !quiet) toast(r.error || 'Keine Vorschläge.', true); });
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
    state.projects.filter(function (p) { return !running[p.id]; }).forEach(function (p) { var o = el('option', '', p.name + ' (neue Session)'); o.value = 'p:' + p.id; sel.appendChild(o); });
    var want = pick || (selected ? 's:' + selected : prev);
    if ([].some.call(sel.options, function (o) { return o.value === want; })) sel.value = want;
    $('composer').hidden = !sel.options.length;
  }

  // ---------- PC ----------

  var armedBtn = null;
  function renderPc() {
    $('pc').hidden = $('pc-label').hidden = $('unpair-row').hidden = false;
    var at = state.shutdownAt;
    $('pc-btns').hidden = !!at; $('pc-cancel-row').hidden = !at;
    $('pc-text').className = at ? 'down' : 'muted';
    $('pc-text').textContent = at ? 'Fährt in ' + Math.max(0, Math.ceil((at - Date.now()) / 1000)) + ' s herunter …' : 'Bleibt wach, solange der Begleiter läuft.';
  }
  function power(action) {
    api('/api/power', { action: action }).then(function (r) {
      if (!r.ok) return toast(r.error || 'Hat nicht geklappt.', true);
      if (action === 'sleep') toast('PC geht in den Standby – gute Nacht.');
      if (action === 'cancel') toast('Ausschalten abgebrochen');
    });
  }
  // zweimal tippen: erst scharf machen, dann ausführen
  function twice(btn, label, ask, run) {
    if (armedBtn === btn) { clearTimeout(btn._t); armedBtn = null; btn.textContent = label; return run(); }
    if (armedBtn) { clearTimeout(armedBtn._t); armedBtn.textContent = armedBtn._label; }
    armedBtn = btn; btn._label = label; btn.textContent = ask;
    btn._t = setTimeout(function () { armedBtn = null; btn.textContent = label; }, 4000);
  }
  $('pc-off').onclick = function () { twice($('pc-off'), 'Ausschalten', 'Wirklich? Sessions enden', function () { power('shutdown'); }); };
  $('pc-sleep').onclick = function () { twice($('pc-sleep'), 'Standby', 'Wirklich Standby?', function () { power('sleep'); }); };
  $('pc-cancel').onclick = function () { power('cancel'); };
  $('unpair').onclick = function () { twice($('unpair'), 'Dieses Handy abmelden', 'Nochmal tippen zum Abmelden', function () { api('/api/unpair', {}).then(unpaired); }); };

  function render() {
    if (!state) return;
    renderAsks(); renderTabs(); renderSession(); renderNotes(); renderTarget(); renderPc();
  }

  // ---------- Senden ----------

  function send(text, polish) {
    if (sending) return;
    var v = $('target').value || '';
    if (!text.trim() || !v) return;
    var body = { text: text, polish: polish };
    if (v.indexOf('s:') === 0) body.sessionId = v.slice(2); else body.projectId = v.slice(2);
    sending = true; $('send').disabled = true;
    if (polish) toast('Claude formuliert deinen Prompt …');
    api('/api/prompt', body).then(function (r) {
      sending = false; $('send').disabled = false;
      if (!r.ok) return toast(r.error || 'Hat nicht geklappt.', true);
      if (text === $('text').value) { $('text').value = ''; grow(); }
      pick = '';
      toast('Gesendet: ' + r.text);
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
  function connect() {
    if (!key) return unpaired();
    if (ctrl) ctrl.abort();
    clearTimeout(retry);
    var my = ctrl = new AbortController();
    setConn('', 'verbinde …');
    fetch('/api/events', { headers: { authorization: 'Bearer ' + key }, cache: 'no-store', signal: my.signal }).then(function (r) {
      if (r.status === 401) return unpaired();
      if (!r.ok || !r.body) throw new Error('http ' + r.status);
      setConn('on', 'verbunden');
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
      setConn('off', 'getrennt – versuche erneut …');
      retry = setTimeout(connect, 2500);
    });
  }
  // Handys kappen Verbindungen im Standby – beim Zurückkommen sofort neu verbinden
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { connect(); render(); } });
  setInterval(function () { if (state) renderNotes(); }, 30000);
  setInterval(function () { if (state && state.shutdownAt) renderPc(); }, 1000);
  connect();
})();
</script>
</body></html>`
}

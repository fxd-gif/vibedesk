// OBS-Browserquelle: transparente Seite mit Live-Status. Daten nur per textContent einsetzen – nie als HTML.
export function overlayPage(nonce: string): string {
  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>VibeDesk Overlay</title>
<style>
  :root { --bg: rgba(12,15,22,.78); --line: rgba(255,255,255,.1); --text: #e7ecf5; --dim: rgba(231,236,245,.6); --accent: #9fb8ff; }
  html, body { margin: 0; background: transparent; color: var(--text); font: 15px/1.4 'Segoe UI', system-ui, sans-serif; overflow: hidden; }
  #root { position: fixed; bottom: 24px; left: 24px; display: flex; flex-direction: column; gap: 10px; width: 380px; transform-origin: bottom left; }
  body.right #root { left: auto; right: 24px; transform-origin: bottom right; }
  .card { background: var(--bg); border: 1px solid var(--line); border-radius: 16px; padding: 12px 16px; box-shadow: 0 12px 40px rgba(0,0,0,.35); backdrop-filter: blur(14px); }
  .card[hidden] { display: none; }
  .head { display: flex; align-items: center; gap: 10px; font-weight: 600; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #8b93a7; flex: none; }
  .dot.working { background: #60a5fa; box-shadow: 0 0 0 0 rgba(96,165,250,.6); animation: pulse 1.6s infinite; }
  .dot.waiting { background: #facc15; }
  .dot.done { background: #4ade80; }
  .dot.error { background: #f87171; }
  @keyframes pulse { 70% { box-shadow: 0 0 0 9px rgba(96,165,250,0); } 100% { box-shadow: 0 0 0 0 rgba(96,165,250,0); } }
  .sub { color: var(--dim); font-size: 13px; margin-top: 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .mono { font-family: 'Cascadia Code', Consolas, monospace; font-size: 12.5px; }
  .label { font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); margin-bottom: 6px; display: flex; justify-content: space-between; }
  .bar { height: 5px; border-radius: 99px; background: rgba(255,255,255,.1); overflow: hidden; margin-bottom: 8px; }
  .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--accent), #c4b5fd); transition: width .4s; }
  ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
  li { display: flex; gap: 8px; align-items: baseline; font-size: 13.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  li span:last-child { overflow: hidden; text-overflow: ellipsis; }
  li.completed { color: var(--dim); text-decoration: line-through; }
  li.in_progress { color: #fff; font-weight: 600; }
  .ok { color: #4ade80; } .fail { color: #f87171; } .pending { color: var(--accent); } .stopped { color: var(--dim); }
  .big { font-size: 30px; font-weight: 700; font-variant-numeric: tabular-nums; }
  .row { display: flex; gap: 18px; }
  .row > div { flex: 1; }
  .shout { border-color: rgba(196,181,253,.5); animation: pop .5s cubic-bezier(.2,.9,.3,1.3); }
  .shout b { color: #c4b5fd; }
  @keyframes pop { from { transform: translateY(14px) scale(.96); opacity: 0; } }
  .off { opacity: .55; }
  .credit { font-size: 11px; color: var(--dim); padding-left: 4px; letter-spacing: .02em; text-shadow: 0 1px 6px rgba(0,0,0,.6); }
</style></head>
<body>
<div id="root">
  <div class="card" id="w-chat" hidden><div class="label"><span>Chat-Vorschlag übernommen</span></div><div><b id="sh-by"></b> <span id="sh-text"></span></div></div>
  <div class="card" id="w-focus" hidden><div class="label"><span id="fo-label">Fokus</span></div><div class="big" id="fo-left"></div></div>
  <div class="card" id="w-todos" hidden><div class="label"><span>Plan</span><span id="td-count"></span></div><div class="bar"><i id="td-bar"></i></div><ul id="td-list"></ul></div>
  <div class="card" id="w-feed" hidden><div class="label"><span>Live</span></div><ul id="fd-list" class="mono"></ul></div>
  <div class="card" id="w-stats" hidden><div class="row"><div><div class="label">Session</div><div class="big" id="st-time">–</div></div><div><div class="label">Tokens</div><div class="big" id="st-tokens">–</div></div><div id="st-cost-box"><div class="label">Kosten</div><div class="big" id="st-cost">–</div></div></div></div>
  <div class="card" id="w-status" hidden><div class="head"><span class="dot" id="s-dot"></span><span id="s-text">Verbinde …</span></div><div class="sub mono" id="s-current"></div></div>
  <div class="credit" id="credit">made with VibeDesk · fxd-gif.github.io/vibedesk</div>
</div>
<script nonce="${nonce}">
(function () {
  var q = new URLSearchParams(location.search);
  var all = ['status', 'todos', 'feed', 'focus', 'stats', 'chat'];
  var want = (q.get('w') || all.join(',')).split(',').filter(function (w) { return all.indexOf(w) >= 0; });
  var scale = Math.min(3, Math.max(0.5, parseFloat(q.get('scale') || '1') || 1));
  if (q.get('align') === 'right') document.body.classList.add('right');
  if (q.get('credit') === '0') document.getElementById('credit').hidden = true;
  var root = document.getElementById('root');
  root.style.transform = 'scale(' + scale + ')';
  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var PH = { work: 'Fokus', short: 'Kurze Pause', long: 'Lange Pause' };
  var MARK = { ok: '✓', fail: '✗', pending: '…', stopped: '–' };
  var TODO = { completed: '✓', in_progress: '▸', pending: '○' };

  function show(id, on) { $('w-' + id).hidden = !(on && want.indexOf(id) >= 0); }
  function clock(ms) { var s = Math.max(0, Math.ceil(ms / 1000)); var h = Math.floor(s / 3600); var m = Math.floor(s % 3600 / 60); var r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(r).padStart(2, '0'); }
  function list(el, items, make) {
    while (el.firstChild) el.removeChild(el.firstChild);
    items.forEach(function (it) { el.appendChild(make(it)); });
  }
  function li(cls, mark, markCls, text) {
    var l = document.createElement('li'); if (cls) l.className = cls;
    var a = document.createElement('span'); a.className = markCls || ''; a.textContent = mark;
    var b = document.createElement('span'); b.textContent = text;
    l.appendChild(a); l.appendChild(b); return l;
  }

  function render() {
    var s = state;
    if (!s || !s.status) { show('status', true); return; }
    show('status', true);
    $('s-dot').className = 'dot ' + (s.status === 'none' ? '' : s.status);
    $('s-text').textContent = s.statusText + (s.project ? ' · ' + s.project : '');
    $('s-current').textContent = s.current || '';

    var todos = s.todos || [];
    var done = todos.filter(function (t) { return t.status === 'completed'; }).length;
    show('todos', todos.length > 0);
    $('td-count').textContent = done + ' / ' + todos.length;
    $('td-bar').style.width = (todos.length ? done / todos.length * 100 : 0) + '%';
    var active = todos.findIndex(function (t) { return t.status !== 'completed'; });
    var from = Math.max(0, Math.min(active < 0 ? todos.length - 5 : active - 1, todos.length - 5));
    list($('td-list'), todos.slice(from, from + 5), function (t) { return li(t.status, TODO[t.status], '', t.content); });

    var feed = s.feed || [];
    show('feed', feed.length > 0);
    list($('fd-list'), feed, function (f) { return li('', MARK[f.result], f.result, f.tool + (f.target ? ' · ' + f.target : '')); });

    show('chat', !!s.shoutout && Date.now() - s.shoutout.ts < 25000);
    if (s.shoutout) { $('sh-by').textContent = '@' + s.shoutout.by; $('sh-text').textContent = '„' + s.shoutout.text + '“'; }

    show('stats', s.status !== 'none' || !!s.tokens);
    $('st-tokens').textContent = s.tokens || '–';
    $('st-cost-box').hidden = !s.cost;
    $('st-cost').textContent = s.cost || '';
    tick();
  }

  var focusBase = 0, focusAt = 0;
  function tick() {
    var s = state;
    if (!s) return;
    if (s.focus) {
      show('focus', true);
      $('fo-label').textContent = PH[s.focus.phase] || 'Fokus';
      $('fo-left').textContent = clock(focusBase - (Date.now() - focusAt));
    } else show('focus', false);
    $('st-time').textContent = s.sessionStart ? clock(Date.now() - s.sessionStart) : '–';
    if (s.shoutout && Date.now() - s.shoutout.ts > 25000) show('chat', false);
  }
  setInterval(tick, 1000);

  var last = '';
  function connect() {
    var es = new EventSource('/events?token=' + encodeURIComponent(q.get('token') || ''));
    es.onmessage = function (e) {
      try { state = JSON.parse(e.data); } catch (_) { return; }
      if (state && state.focus) { focusBase = state.focus.leftMs; focusAt = Date.now(); }
      var key = state && state.shoutout ? state.shoutout.ts : '';
      if (key && key !== last) { last = key; var c = $('w-chat'); c.classList.remove('shout'); void c.offsetWidth; c.classList.add('shout'); }
      root.classList.remove('off');
      render();
    };
    es.onerror = function () { root.classList.add('off'); };
  }
  connect();
  render();
})();
</script>
</body></html>`
}

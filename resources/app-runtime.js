// Laufzeit für Werkzeug-Fenster (läuft im Sandbox-iframe, ohne Netz und ohne direkten Zugriff auf VibeDesk).
// Claude schreibt Markup + ein Skript gegen die globale `vd`-API. Daten gibt es nur lesend über VibeDesk:
//   await vd.data('sessions' | 'brain' | 'usage' | 'project')   ·   vd.watch(art, fn) → bei jeder Änderung
//   await vd.store.get(key, fallback) / vd.store.set(key, wert)  → eigener, dauerhafter Speicher
//   vd.h(tag, props, ...kinder) baut Elemente (Text wird nie als HTML gelesen) · vd.mount(ziel, ...knoten)
'use strict'
;(function () {
  // Kein Netz – auch nicht über WebRTC, das die CSP nicht abdeckt
  for (const k of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate']) {
    try {
      Object.defineProperty(window, k, { value: undefined, writable: false, configurable: false })
    } catch (e) {
      /* schon weg */
    }
  }

  const post = (msg) => {
    try {
      parent.postMessage(Object.assign({ vdApp: true }, msg), '*')
    } catch (e) {
      /* Eltern weg */
    }
  }

  let started = false
  let failed = false
  const fail = (err, where) => {
    const msg = err && err.message ? err.message : String(err)
    const line = err && err.lineno ? ` (Zeile ${err.lineno})` : ''
    const text = `${where ? where + ': ' : ''}${msg}${line}`
    failed = true
    post({ type: 'status', ok: false, error: text.slice(0, 600) })
  }
  window.addEventListener('error', (e) => {
    const inApp = !!e.filename && /app\.js/.test(e.filename)
    // app.js ist in eine async-Funktion verpackt – eine Zeile abziehen
    fail({ message: e.message, lineno: inApp && e.lineno ? e.lineno - 1 : e.lineno }, inApp ? 'app.js' : '')
  })
  window.addEventListener('unhandledrejection', (e) => fail(e.reason, ''))

  // ---------- Brücke zu VibeDesk ----------
  let nextReq = 1
  const pending = new Map()
  const watchers = new Map()
  window.addEventListener('message', (e) => {
    if (e.source !== parent) return
    const m = e.data
    if (!m || !m.vdApp) return
    if (m.type === 'res') {
      const p = pending.get(m.req)
      if (!p) return
      pending.delete(m.req)
      m.ok ? p.resolve(m.value) : p.reject(new Error(m.error || 'Fehler'))
    } else if (m.type === 'push') {
      const list = watchers.get(m.what)
      if (list) for (const fn of [...list]) {
        try {
          fn(m.value)
        } catch (err) {
          fail(err, `vd.watch('${m.what}')`)
        }
      }
    }
  })
  const ask = (op, extra) =>
    new Promise((resolve, reject) => {
      const req = nextReq++
      pending.set(req, { resolve, reject })
      post(Object.assign({ type: 'req', req, op }, extra))
      setTimeout(() => {
        if (pending.has(req)) {
          pending.delete(req)
          reject(new Error(`VibeDesk antwortet nicht (${op})`))
        }
      }, 10000)
    })

  // ---------- Bausteine ----------
  const SVG = 'http://www.w3.org/2000/svg'
  const SVG_TAGS = new Set(['svg', 'path', 'rect', 'circle', 'line', 'polyline', 'polygon', 'g', 'text', 'ellipse'])
  function h(tag, props, ...kids) {
    const el = SVG_TAGS.has(tag) ? document.createElementNS(SVG, tag) : document.createElement(tag)
    if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
      kids.unshift(props)
      props = null
    }
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v)
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v)
      else if (k === 'class' || k === 'className') el.setAttribute('class', String(v))
      else if (k === 'value' && 'value' in el) el.value = v
      else if (k === 'checked' && 'checked' in el) el.checked = !!v
      else el.setAttribute(k, v === true ? '' : String(v))
    }
    append(el, kids)
    return el
  }
  function append(el, kids) {
    for (const k of kids.flat(Infinity)) {
      if (k === null || k === undefined || k === false || k === true) continue
      el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)))
    }
  }
  function mount(target, ...kids) {
    const el = typeof target === 'string' ? document.querySelector(target) : target
    if (!el) throw new Error(`vd.mount: ${target} nicht gefunden`)
    el.replaceChildren()
    append(el, kids)
    return el
  }

  const fmt = {
    tokens: (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} M` : n >= 1e3 ? `${Math.round(n / 1e3)} k` : String(Math.round(n || 0))),
    usd: (n) => `${(n || 0).toFixed(2)} $`,
    pct: (x) => `${Math.round((x || 0) * 100)} %`,
    time: (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : ''),
    date: (ts) => (ts ? new Date(ts).toLocaleDateString() : ''),
    ago: (ts) => {
      if (!ts) return ''
      const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
      if (s < 60) return 'gerade eben'
      if (s < 3600) return `vor ${Math.round(s / 60)} min`
      if (s < 86400) return `vor ${Math.round(s / 3600)} Std.`
      return `vor ${Math.round(s / 86400)} Tagen`
    }
  }

  /** kleiner Verlauf als SVG */
  function sparkline(values, opts) {
    const o = Object.assign({ w: 120, h: 28, color: 'var(--accent)' }, opts)
    const vs = (values || []).map(Number).filter(Number.isFinite)
    const max = Math.max(1e-9, ...vs)
    const step = vs.length > 1 ? o.w / (vs.length - 1) : 0
    const pts = vs.map((v, i) => `${(i * step).toFixed(1)},${(o.h - 2 - (v / max) * (o.h - 4)).toFixed(1)}`).join(' ')
    return h('svg', { width: o.w, height: o.h, viewBox: `0 0 ${o.w} ${o.h}` }, h('polyline', { points: pts, fill: 'none', stroke: o.color, 'stroke-width': 1.6, 'stroke-linejoin': 'round' }))
  }
  /** Balken 0..1 */
  const bar = (fraction, color) => h('div', { class: 'bar' }, h('i', { style: { width: `${Math.round(Math.min(1, Math.max(0, fraction || 0)) * 100)}%`, background: color || '' } }))

  const vd = {
    data: (what) => ask('data', { what }),
    watch(what, fn) {
      if (typeof fn !== 'function') throw new Error('vd.watch braucht eine Funktion')
      let list = watchers.get(what)
      if (!list) {
        list = new Set()
        watchers.set(what, list)
        post({ type: 'watch', what })
      }
      list.add(fn)
      // sofort einmal mit dem aktuellen Stand
      vd.data(what).then(
        (v) => list.has(fn) && fn(v),
        (err) => fail(err, `vd.watch('${what}')`)
      )
      return () => list.delete(fn)
    },
    store: {
      get: (key, fallback) => ask('store.get', { key: String(key) }).then((v) => (v === undefined || v === null ? fallback : v)),
      set: (key, value) => ask('store.set', { key: String(key), value: value === undefined ? null : JSON.parse(JSON.stringify(value)) })
    },
    h,
    mount,
    $: (sel) => document.querySelector(sel),
    $$: (sel) => [...document.querySelectorAll(sel)],
    fmt,
    sparkline,
    bar,
    __start() {
      if (started) return
      started = true
      // kurz warten: auch Fehler nach dem ersten await sollen vor dem „läuft“ ankommen
      setTimeout(() => {
        if (!failed) post({ type: 'status', ok: true })
      }, 500)
    }
  }
  Object.defineProperty(window, 'vd', { value: Object.freeze(vd), writable: false, configurable: false })
})()

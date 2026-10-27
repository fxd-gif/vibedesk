// Laufzeit für lebende Szenen (läuft im Sandbox-iframe, ohne Netz und ohne Zugriff auf VibeDesk).
// Claude schreibt ein kurzes Skript gegen die globale `vd`-API: Hintergrundbild, Flächen und Effekte
// wie Schnee, der auf Dächern liegen bleibt, Regen mit Spritzern, Glühwürmchen, Nebel …
// Alles in CSS-Pixeln; Positionen im Bild als Anteile 0..1 (nx, ny).
'use strict'
;(function () {
  // Kein Netz – auch nicht über WebRTC, das die CSP nicht abdeckt (Szenen können auch aus Share-Codes stammen)
  for (const k of ['RTCPeerConnection', 'webkitRTCPeerConnection', 'RTCDataChannel', 'RTCSessionDescription', 'RTCIceCandidate']) {
    try {
      Object.defineProperty(window, k, { value: undefined, writable: false, configurable: false })
    } catch (e) {
      /* schon weg */
    }
  }
  const root = document.documentElement
  const hasImage = root.dataset.image === '1'
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  let W = 0
  let H = 0
  let DPR = 1
  let started = false
  let paused = false
  let fpsCap = 60
  let lastFrame = 0
  let frames = 0
  let errorSent = false

  const post = (msg) => {
    try {
      parent.postMessage(Object.assign({ vdLiving: true }, msg), '*')
    } catch (e) {
      /* Eltern weg */
    }
  }
  const fail = (err, where) => {
    if (errorSent) return
    errorSent = true
    const msg = err && err.message ? err.message : String(err)
    const line = err && err.lineno ? ` (Zeile ${err.lineno})` : ''
    post({ type: 'status', ok: false, error: (where ? where + ': ' : '') + msg + line })
  }
  window.addEventListener('error', (e) => fail({ message: e.message, lineno: e.lineno }))
  window.addEventListener('unhandledrejection', (e) => fail(e.reason || 'Promise abgelehnt'))

  // ---------- Hilfen ----------
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)
  const rand = (a = 0, b = 1) => a + Math.random() * (b - a)
  const lerp = (a, b, t) => a + (b - a) * t
  // weiches Rauschen (Wertrauschen mit Glättung), 0..1
  const perm = new Uint8Array(512)
  for (let i = 0; i < 256; i++) perm[i] = i
  for (let i = 255; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0
    const t = perm[i]
    perm[i] = perm[j]
    perm[j] = t
  }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i]
  const fade = (t) => t * t * (3 - 2 * t)
  const hash = (x, y, z) => perm[(perm[(perm[x & 255] + y) & 255] + z) & 255] / 255
  function noise(x, y = 0, z = 0) {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const zi = Math.floor(z)
    const xf = fade(x - xi)
    const yf = fade(y - yi)
    const zf = fade(z - zi)
    const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz)
    const x00 = lerp(c(0, 0, 0), c(1, 0, 0), xf)
    const x10 = lerp(c(0, 1, 0), c(1, 1, 0), xf)
    const x01 = lerp(c(0, 0, 1), c(1, 0, 1), xf)
    const x11 = lerp(c(0, 1, 1), c(1, 1, 1), xf)
    return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf)
  }
  const glowCache = new Map()
  /** weicher Lichtpunkt als vorgerendertes Bild (schnell zu zeichnen) */
  function glowSprite(color) {
    let c = glowCache.get(color)
    if (c) return c
    c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    grad.addColorStop(0, color)
    grad.addColorStop(0.25, color)
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    g.globalAlpha = 1
    g.fillStyle = grad
    g.fillRect(0, 0, 64, 64)
    // Kern heller
    const core = g.createRadialGradient(32, 32, 0, 32, 32, 8)
    core.addColorStop(0, 'rgba(255,255,255,0.9)')
    core.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = core
    g.fillRect(0, 0, 64, 64)
    glowCache.set(color, c)
    return c
  }

  // ---------- Bild und Abbildung Bild ↔ Bildschirm ----------
  let img = null
  let imgReady = false
  const cover = { s: 1, ox: 0, oy: 0, iw: 1, ih: 1 }
  const imageWaiters = []
  if (hasImage) {
    img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imgReady = true
      layout()
      imageWaiters.splice(0).forEach((f) => f())
    }
    img.onerror = () => fail('Bild konnte nicht geladen werden')
    img.src = 'image'
  }
  const whenImage = () => new Promise((res) => (imgReady || !hasImage ? res() : imageWaiters.push(res)))

  function layoutCover() {
    const iw = imgReady ? img.naturalWidth : W
    const ih = imgReady ? img.naturalHeight : H
    const s = Math.max(W / iw, H / ih)
    cover.s = s
    cover.iw = iw
    cover.ih = ih
    cover.ox = (W - iw * s) / 2
    cover.oy = (H - ih * s) / 2
  }
  /** Anteil im Bild (0..1) → Bildschirm-Pixel */
  const px = (nx, ny) => ({ x: cover.ox + nx * cover.iw * cover.s, y: cover.oy + ny * cover.ih * cover.s })
  const norm = (x, y) => ({ x: (x - cover.ox) / (cover.iw * cover.s), y: (y - cover.oy) / (cover.ih * cover.s) })

  // ---------- Hintergrund ----------
  const bgOpts = { image: true, dim: 0, blur: 0, top: '#0d1424', bottom: '#1c2333' }
  let bgCanvas = null
  function renderBackground() {
    bgCanvas = bgCanvas || document.createElement('canvas')
    bgCanvas.width = Math.round(W * DPR)
    bgCanvas.height = Math.round(H * DPR)
    const g = bgCanvas.getContext('2d')
    g.setTransform(DPR, 0, 0, DPR, 0, 0)
    const grad = g.createLinearGradient(0, 0, 0, H)
    grad.addColorStop(0, bgOpts.top)
    grad.addColorStop(1, bgOpts.bottom)
    g.fillStyle = grad
    g.fillRect(0, 0, W, H)
    if (imgReady && bgOpts.image) {
      if (bgOpts.blur) g.filter = `blur(${bgOpts.blur}px)`
      g.drawImage(img, cover.ox, cover.oy, cover.iw * cover.s, cover.ih * cover.s)
      g.filter = 'none'
    }
    if (bgOpts.dim) {
      g.fillStyle = `rgba(0,0,0,${clamp(bgOpts.dim, 0, 1)})`
      g.fillRect(0, 0, W, H)
    }
  }

  // ---------- Flächen (Dächer, Simse, Boden) ----------
  const surfaces = []
  const STEP = 3
  class Surface {
    constructor(points, opts) {
      this.points = points
        .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map((p) => [p[0], p[1]])
        .sort((a, b) => a[0] - b[0])
      this.opts = Object.assign({ snow: true, maxDepth: 18, ground: false, name: '' }, opts || {})
      this.build()
    }
    build() {
      const pts = this.opts.ground ? [[-0.05, 1], [1.05, 1]] : this.points
      if (pts.length < 2) {
        this.n = 0
        return
      }
      const sp = this.opts.ground ? pts.map((p) => ({ x: p[0] * W, y: H - 1 })) : pts.map((p) => px(p[0], p[1]))
      this.x0 = sp[0].x
      this.x1 = sp[sp.length - 1].x
      const n = Math.max(2, Math.ceil((this.x1 - this.x0) / STEP) + 1)
      // liegender Schnee bleibt bei Größenänderungen erhalten (anteilig umgerechnet)
      const old = this.depth
      this.n = n
      this.ys = new Float32Array(n)
      this.slope = new Float32Array(n)
      this.depth = new Float32Array(n)
      if (old && old.length > 1) for (let i = 0; i < n; i++) this.depth[i] = old[Math.round((i / (n - 1)) * (old.length - 1))]
      let k = 0
      for (let i = 0; i < n; i++) {
        const x = this.x0 + i * STEP
        while (k < sp.length - 2 && sp[k + 1].x < x) k++
        const a = sp[k]
        const b = sp[k + 1]
        const t = b.x === a.x ? 0 : clamp((x - a.x) / (b.x - a.x), 0, 1)
        this.ys[i] = lerp(a.y, b.y, t)
      }
      for (let i = 0; i < n; i++) {
        const a = this.ys[Math.max(0, i - 1)]
        const b = this.ys[Math.min(n - 1, i + 1)]
        this.slope[i] = Math.abs(b - a) / (2 * STEP)
      }
    }
    /** Index am Bildschirm-x, -1 = außerhalb */
    at(x) {
      if (!this.n || x < this.x0 || x > this.x1) return -1
      return Math.min(this.n - 1, Math.round((x - this.x0) / STEP))
    }
    top(i) {
      return this.ys[i] - this.depth[i]
    }
    /** Schnee ablegen, mit weichem Rand; steile Stellen halten weniger */
    /** höchste Schneehöhe an dieser Stelle – steile Stellen halten weniger */
    cap(i) {
      return this.opts.maxDepth * clamp(1.2 - this.slope[i] * 0.9, 0, 1)
    }
    deposit(i, amount) {
      const cap = this.cap(i)
      const add = (j, f) => {
        if (j < 0 || j >= this.n) return
        this.depth[j] = Math.min(cap, this.depth[j] + amount * f)
      }
      add(i, 1)
      add(i - 1, 0.6)
      add(i + 1, 0.6)
      add(i - 2, 0.25)
      add(i + 2, 0.25)
    }
    settle(dt, melt) {
      const d = this.depth
      // rutschen: zu große Stufen gleichen sich aus, an steilen Stellen mehr
      for (let i = 0; i < this.n - 1; i++) {
        const diff = d[i] - d[i + 1]
        const lim = 2.2 - Math.min(1.8, this.slope[i] * 1.5)
        if (Math.abs(diff) > lim) {
          const m = (Math.abs(diff) - lim) * 0.25
          if (diff > 0) {
            d[i] -= m
            d[i + 1] += m
          } else {
            d[i] += m
            d[i + 1] -= m
          }
        }
      }
      if (melt) for (let i = 0; i < this.n; i++) d[i] = Math.max(0, d[i] - melt * dt)
    }
    draw(g, color) {
      if (!this.n) return
      let any = false
      for (let i = 0; i < this.n; i++)
        if (this.depth[i] > 0.4) {
          any = true
          break
        }
      if (!any) return
      g.beginPath()
      g.moveTo(this.x0, this.ys[0])
      for (let i = 0; i < this.n; i++) g.lineTo(this.x0 + i * STEP, this.ys[i] - this.depth[i])
      for (let i = this.n - 1; i >= 0; i--) g.lineTo(this.x0 + i * STEP, this.ys[i] + 0.5)
      g.closePath()
      g.fillStyle = color
      g.fill()
      // leichter Schatten an der Unterkante, Glanz oben
      g.beginPath()
      for (let i = 0; i < this.n; i++) {
        const x = this.x0 + i * STEP
        const y = this.ys[i] - this.depth[i]
        if (i === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.strokeStyle = 'rgba(255,255,255,0.85)'
      g.lineWidth = 1
      g.stroke()
    }
  }
  function surfaceHit(x, y0, y1) {
    for (const s of surfaces) {
      const i = s.at(x)
      if (i < 0) continue
      const top = s.top(i)
      if (y0 <= top && y1 >= top) return { s, i, top }
    }
    return null
  }

  /**
   * Flächen im Bild finden: Übergänge von ruhigem Himmel zu einem Gegenstand (Dachkanten, Simse).
   * Gut für Dächer vor Himmel; für Genaueres lieber vd.surface() mit Punkten aus dem Bild.
   */
  async function autoSurfaces(o) {
    o = Object.assign({ threshold: 0.12, minLength: 0.04, maxCount: 12, smooth: 0.03, perColumn: 2 }, o || {})
    await whenImage()
    if (!imgReady) return []
    const SW = 360
    const SH = Math.max(8, Math.round((SW * img.naturalHeight) / img.naturalWidth))
    const c = document.createElement('canvas')
    c.width = SW
    c.height = SH
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0, SW, SH)
    const data = g.getImageData(0, 0, SW, SH).data
    const L = new Float32Array(SW * SH)
    for (let i = 0; i < SW * SH; i++) L[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255
    // Kanten je Spalte: oben ruhig (wenig Schwankung), deutlicher Sprung nach unten
    const edges = []
    for (let x = 1; x < SW - 1; x++) {
      const col = []
      for (let y = 4; y < SH - 3 && col.length < o.perColumn; y++) {
        const above = (L[(y - 2) * SW + x] + L[(y - 3) * SW + x] + L[(y - 4) * SW + x]) / 3
        const below = (L[(y + 1) * SW + x] + L[(y + 2) * SW + x]) / 2
        const jump = Math.abs(below - above)
        if (jump < o.threshold) continue
        let v = 0
        for (let k = 2; k <= 4; k++) v += Math.abs(L[(y - k) * SW + x] - L[(y - k) * SW + x - 1]) + Math.abs(L[(y - k) * SW + x] - L[(y - k - 1) * SW + x])
        if (v / 6 > o.threshold * 0.6) continue
        col.push(y)
        y += 6
      }
      edges.push(col)
    }
    // Spalten zu Linien verbinden
    const chains = []
    const open = []
    for (let xi = 0; xi < edges.length; xi++) {
      const x = xi + 1
      const next = []
      for (const y of edges[xi]) {
        let best = null
        for (const ch of open) {
          const last = ch[ch.length - 1]
          if (last[0] >= x - 2 && Math.abs(last[1] - y) <= 3 && (!best || Math.abs(last[1] - y) < Math.abs(best[best.length - 1][1] - y))) best = ch
        }
        if (best && !next.includes(best)) {
          best.push([x, y])
          next.push(best)
        } else {
          const ch = [[x, y]]
          chains.push(ch)
          next.push(ch)
        }
      }
      open.length = 0
      for (const ch of chains) if (ch[ch.length - 1][0] >= x - 2) open.push(ch)
    }
    const found = chains
      .filter((ch) => ch.length >= o.minLength * SW)
      .sort((a, b) => b.length - a.length)
      .slice(0, o.maxCount)
      .map((ch) => {
        // glätten und ausdünnen
        const pts = []
        const win = Math.max(1, Math.round(o.smooth * SW))
        for (let i = 0; i < ch.length; i += 3) {
          let sy = 0
          let n = 0
          for (let k = Math.max(0, i - win); k <= Math.min(ch.length - 1, i + win); k++, n++) sy += ch[k][1]
          pts.push([ch[i][0] / SW, (sy / n - 0.5) / SH])
        }
        const last = ch[ch.length - 1]
        pts.push([last[0] / SW, (last[1] - 0.5) / SH])
        return pts
      })
    return found.map((pts) => addSurface(pts, { auto: true }))
  }

  function addSurface(points, opts) {
    const s = new Surface(points, opts)
    surfaces.push(s)
    return s
  }

  // ---------- Maus ----------
  const mouse = { x: -1e4, y: -1e4, vx: 0, vy: 0, down: false, active: false }
  let lastMove = 0
  const listeners = { click: [], move: [], down: [], up: [] }
  window.addEventListener('message', (e) => {
    const m = e.data
    if (!m || typeof m !== 'object') return
    if (m.type === 'pointer') {
      const now = performance.now()
      const dt = Math.max(1, now - lastMove) / 1000
      if (mouse.active) {
        mouse.vx = lerp(mouse.vx, (m.x - mouse.x) / dt, 0.5)
        mouse.vy = lerp(mouse.vy, (m.y - mouse.y) / dt, 0.5)
      }
      const wasDown = mouse.down
      mouse.x = m.x
      mouse.y = m.y
      mouse.down = !!m.down
      mouse.active = !m.leave
      lastMove = now
      safeEach(listeners.move, mouse.x, mouse.y)
      if (mouse.down && !wasDown) safeEach(listeners.down, mouse.x, mouse.y)
      if (!mouse.down && wasDown) safeEach(listeners.up, mouse.x, mouse.y)
    } else if (m.type === 'click') safeEach(listeners.click, m.x, m.y)
    else if (m.type === 'pause') paused = !!m.paused
    else if (m.type === 'fps') fpsCap = clamp(Number(m.fps) || 60, 10, 60)
    else if (m.type === 'snapshot') snapshot(m.req)
  })
  function safeEach(list, ...args) {
    for (const f of list) {
      try {
        f(...args)
      } catch (err) {
        fail(err, 'Ereignis')
      }
    }
  }

  // ---------- Effekte ----------
  const effects = []
  const before = []
  const after = []
  const area = () => (W * H) / (1280 * 800)

  /** Schnee: fällt in drei Tiefen, bleibt auf Flächen liegen, die Maus pustet die Flocken weg; Ziehen mit gedrückter Maus wischt Schnee von Dächern */
  function snow(o) {
    o = Object.assign({ amount: 1, size: 1, speed: 1, wind: 0, settle: true, ground: true, maxDepth: 18, melt: 0, start: 0.5, color: '#ffffff', coverColor: 'rgba(246,250,255,0.97)', mouse: 'push' }, o || {})
    let flakes = []
    let groundSurface = null
    if (o.settle && o.ground) groundSurface = addSurface([], { ground: true, maxDepth: o.maxDepth * 0.8 })
    const spawn = (f, top) => {
      f.layer = Math.random() < 0.45 ? 0 : Math.random() < 0.6 ? 1 : 2
      f.r = (0.7 + f.layer * 0.75 + Math.random() * 0.8) * o.size
      f.x = rand(-40, W + 40)
      f.y = top ? rand(-H * 0.2, -4) : rand(-H * 0.1, H)
      f.vx = 0
      f.vy = (16 + f.r * 16) * o.speed * (0.7 + f.layer * 0.25)
      f.ph = Math.random() * 6.28
      f.a = 0.45 + f.layer * 0.25
      return f
    }
    const resize = () => {
      const n = Math.min(2600, Math.round(320 * o.amount * area()))
      flakes = Array.from({ length: n }, () => spawn({}, false))
    }
    let resizeDone = false
    const fx = {
      opts: o,
      update(dt, t) {
        if (!resizeDone) {
          resize()
          resizeDone = true
          // es hat schon eine Weile geschneit – sonst sieht man minutenlang nur eine dünne Linie
          const start = clamp(+o.start || 0, 0, 1)
          if (o.settle && start) for (const s of surfaces) if (s.opts.snow) for (let i = 0; i < s.n; i++) s.depth[i] = Math.max(s.depth[i], s.cap(i) * start * (0.85 + 0.3 * noise(i * 0.08, 3.1, 0)))
        }
        const wind = (o.wind + vd.wind) * 60
        for (const f of flakes) {
          const sway = Math.sin(t * 1.3 + f.ph) * (6 + f.r * 3)
          f.vx = lerp(f.vx, wind + sway, 0.05)
          if (o.mouse === 'push' && mouse.active) {
            const dx = f.x - mouse.x
            const dy = f.y - mouse.y
            const d2 = dx * dx + dy * dy
            if (d2 < 110 * 110) {
              const d = Math.sqrt(d2) || 1
              const push = 1 - d / 110
              f.vx += ((dx / d) * 500 + mouse.vx * 0.6) * push * dt
              f.y += (dy / d) * push * 80 * dt
            }
          }
          const y0 = f.y
          f.x += f.vx * dt
          f.y += f.vy * dt
          if (o.settle && f.layer > 0) {
            const hit = surfaceHit(f.x, y0, f.y)
            if (hit) {
              if (hit.s.slope[hit.i] > 1.6) {
                // zu steil: abrutschen
                f.y = hit.top - 1
                f.vx += hit.s.ys[Math.min(hit.s.n - 1, hit.i + 1)] > hit.s.ys[Math.max(0, hit.i - 1)] ? 40 : -40
              } else {
                hit.s.deposit(hit.i, 0.12 * f.r * f.r)
                spawn(f, true)
              }
              continue
            }
          }
          if (f.y > H + 10 || f.x < -60 || f.x > W + 60) spawn(f, true)
        }
        // mit gedrückter Maus Schnee von Flächen wischen
        if (mouse.down && mouse.active) {
          for (const s of surfaces) {
            for (let dx = -30; dx <= 30; dx += STEP) {
              const i = s.at(mouse.x + dx)
              if (i < 0) continue
              if (Math.abs(s.top(i) - mouse.y) < 26 && s.depth[i] > 0.5) {
                const take = s.depth[i] * 0.2
                s.depth[i] -= take
                if (Math.random() < take * 0.5) {
                  const f = spawn({}, true)
                  f.x = mouse.x + dx
                  f.y = s.top(i) - 2
                  f.vy *= 0.6
                  f.vx = mouse.vx * 0.3 + rand(-30, 30)
                  flakes.push(f)
                }
              }
            }
          }
          if (flakes.length > 3200) flakes.length = 3200
        }
        for (const s of surfaces) if (s.opts.snow) s.settle(dt, o.melt)
      },
      draw(g) {
        for (const s of surfaces) if (s.opts.snow) s.draw(g, o.coverColor)
        for (let layer = 0; layer < 3; layer++) {
          g.beginPath()
          let a = 0
          for (const f of flakes) {
            if (f.layer !== layer) continue
            a = f.a
            g.moveTo(f.x + f.r, f.y)
            g.arc(f.x, f.y, f.r, 0, 6.2832)
          }
          g.globalAlpha = a
          g.fillStyle = o.color
          g.fill()
        }
        g.globalAlpha = 1
      },
      resize() {
        resize()
      },
      ground: groundSurface
    }
    effects.push(fx)
    return fx
  }

  /** Regen: schräge Striche, Spritzer auf Flächen und Boden; die Maus ist ein Schirm */
  function rain(o) {
    o = Object.assign({ amount: 1, speed: 1, wind: 0.15, splash: true, color: 'rgba(200,215,240,0.45)', mouse: 'umbrella', length: 1 }, o || {})
    let drops = []
    const splashes = []
    const spawn = (d, top) => {
      d.x = rand(-100, W + 100)
      d.y = top ? rand(-H * 0.3, -10) : rand(-H * 0.2, H)
      d.z = rand(0.4, 1)
      d.len = (10 + d.z * 18) * o.length
      d.v = (700 + d.z * 700) * o.speed
      return d
    }
    const resize = () => (drops = Array.from({ length: Math.min(1600, Math.round(260 * o.amount * area())) }, () => spawn({}, false)))
    let ready = false
    const splash = (x, y) => {
      if (!o.splash || splashes.length > 500) return
      for (let k = 0; k < 3; k++) splashes.push({ x, y, vx: rand(-60, 60), vy: rand(-140, -60), life: rand(0.2, 0.4) })
    }
    const fx = {
      opts: o,
      update(dt) {
        if (!ready) {
          resize()
          ready = true
        }
        const wind = (o.wind + vd.wind) * 500
        for (const d of drops) {
          const y0 = d.y
          d.x += wind * dt * d.z
          d.y += d.v * dt
          if (o.mouse === 'umbrella' && mouse.active) {
            const dx = d.x - mouse.x
            const dy = d.y - mouse.y
            if (dy < 0 && dy > -70 && Math.abs(dx) < 70 && dx * dx + dy * dy < 70 * 70) {
              splash(d.x, d.y)
              spawn(d, true)
              continue
            }
          }
          const hit = d.z > 0.6 ? surfaceHit(d.x, y0, d.y) : null
          if (hit) {
            splash(d.x, hit.top)
            spawn(d, true)
          } else if (d.y > H) {
            if (d.z > 0.6) splash(d.x, H - 2)
            spawn(d, true)
          }
        }
        for (let i = splashes.length - 1; i >= 0; i--) {
          const s = splashes[i]
          s.life -= dt
          s.vy += 600 * dt
          s.x += s.vx * dt
          s.y += s.vy * dt
          if (s.life <= 0) splashes.splice(i, 1)
        }
      },
      draw(g) {
        const wind = (o.wind + vd.wind) * 500
        g.strokeStyle = o.color
        g.lineWidth = 1
        g.beginPath()
        for (const d of drops) {
          const k = d.len / d.v
          g.moveTo(d.x, d.y)
          g.lineTo(d.x - wind * k * d.z, d.y - d.len)
        }
        g.stroke()
        g.fillStyle = o.color
        g.beginPath()
        for (const s of splashes) {
          g.moveTo(s.x + 1.2, s.y)
          g.arc(s.x, s.y, 1.2, 0, 6.2832)
        }
        g.fill()
      },
      resize
    }
    effects.push(fx)
    return fx
  }

  /** Glühwürmchen: schweben, pulsieren, folgen sanft der Maus */
  function fireflies(o) {
    o = Object.assign({ count: 40, color: 'rgba(255,224,120,0.9)', region: [0, 0.35, 1, 1], followMouse: 0.35, size: 1, speed: 1 }, o || {})
    let flies = []
    const sprite = glowSprite(o.color)
    const make = () => {
      const r = o.region
      const p = px(rand(r[0], r[2]), rand(r[1], r[3]))
      return { x: p.x, y: p.y, vx: 0, vy: 0, seed: Math.random() * 100, ph: Math.random() * 6.28 }
    }
    let ready = false
    const fx = {
      opts: o,
      update(dt, t) {
        if (!ready) {
          flies = Array.from({ length: Math.min(300, o.count) }, make)
          ready = true
        }
        const r = o.region
        const a = px(r[0], r[1])
        const b = px(r[2], r[3])
        for (const f of flies) {
          const ang = noise(f.seed, t * 0.15 * o.speed) * 12.56
          f.vx = lerp(f.vx, Math.cos(ang) * 30 * o.speed, 0.03)
          f.vy = lerp(f.vy, Math.sin(ang) * 22 * o.speed, 0.03)
          if (mouse.active && o.followMouse) {
            const dx = mouse.x - f.x
            const dy = mouse.y - f.y
            const d = Math.hypot(dx, dy)
            if (d < 260 && d > 30) {
              f.vx += (dx / d) * o.followMouse * 60 * dt * 4
              f.vy += (dy / d) * o.followMouse * 60 * dt * 4
            }
          }
          f.x += f.vx * dt
          f.y += f.vy * dt
          if (f.x < a.x) f.vx += 20 * dt * 10
          if (f.x > b.x) f.vx -= 20 * dt * 10
          if (f.y < a.y) f.vy += 20 * dt * 10
          if (f.y > b.y) f.vy -= 20 * dt * 10
        }
      },
      draw(g, t) {
        g.globalCompositeOperation = 'lighter'
        for (const f of flies) {
          const pulse = 0.35 + 0.65 * Math.max(0, Math.sin(t * 2.2 + f.ph)) ** 2
          const s = (10 + 14 * pulse) * o.size
          g.globalAlpha = pulse
          g.drawImage(sprite, f.x - s, f.y - s, s * 2, s * 2)
        }
        g.globalAlpha = 1
        g.globalCompositeOperation = 'source-over'
      },
      resize() {
        ready = false
      }
    }
    effects.push(fx)
    return fx
  }

  /** Blätter (oder Blüten): trudeln, bleiben eine Weile auf Flächen liegen */
  function leaves(o) {
    o = Object.assign({ count: 30, colors: ['#c8642a', '#e09a3a', '#a8442a', '#d8b04a'], settle: true, wind: 0.2, size: 1, speed: 1, shape: 'leaf' }, o || {})
    let list = []
    const resting = []
    const make = (top) => ({ x: rand(-40, W), y: top ? rand(-200, -20) : rand(0, H), r: rand(5, 9) * o.size, rot: rand(0, 6.28), vr: rand(-2, 2), ph: rand(0, 6.28), c: o.colors[(Math.random() * o.colors.length) | 0] })
    let ready = false
    const drawLeaf = (g, l, alpha) => {
      g.save()
      g.translate(l.x, l.y)
      g.rotate(l.rot)
      g.globalAlpha = alpha
      g.fillStyle = l.c
      g.beginPath()
      if (o.shape === 'petal') g.ellipse(0, 0, l.r * 0.7, l.r * 0.45, 0, 0, 6.2832)
      else {
        g.moveTo(-l.r, 0)
        g.quadraticCurveTo(0, -l.r * 0.7, l.r, 0)
        g.quadraticCurveTo(0, l.r * 0.7, -l.r, 0)
      }
      g.fill()
      g.restore()
    }
    const fx = {
      opts: o,
      update(dt, t) {
        if (!ready) {
          list = Array.from({ length: Math.min(200, o.count) }, () => make(false))
          ready = true
        }
        const wind = (o.wind + vd.wind) * 80
        for (const l of list) {
          const y0 = l.y
          l.x += (wind + Math.sin(t * 1.7 + l.ph) * 30) * dt * o.speed
          l.y += (40 + Math.sin(t * 2.3 + l.ph) * 15) * dt * o.speed
          l.rot += l.vr * dt
          if (mouse.active) {
            const dx = l.x - mouse.x
            const dy = l.y - mouse.y
            const d = Math.hypot(dx, dy)
            if (d < 90) {
              l.x += (dx / (d || 1)) * 120 * dt
              l.vr += rand(-4, 4) * dt
            }
          }
          const hit = o.settle ? surfaceHit(l.x, y0, l.y) : null
          if (hit && hit.s.slope[hit.i] < 1.2 && resting.length < 160) {
            resting.push({ x: l.x, y: hit.top - 1, r: l.r, rot: rand(-0.4, 0.4), c: l.c, life: rand(20, 50) })
            Object.assign(l, make(true))
          } else if (l.y > H + 20 || l.x > W + 60) Object.assign(l, make(true))
        }
        for (let i = resting.length - 1; i >= 0; i--) {
          resting[i].life -= dt
          if (resting[i].life <= 0) resting.splice(i, 1)
        }
      },
      draw(g) {
        for (const l of resting) drawLeaf(g, l, Math.min(1, l.life / 3))
        for (const l of list) drawLeaf(g, l, 0.95)
        g.globalAlpha = 1
      },
      resize() {
        ready = false
        resting.length = 0
      }
    }
    effects.push(fx)
    return fx
  }

  /** Funken/Glut: steigen von einer Stelle auf (Lagerfeuer, Kamin, Kerze) */
  function embers(o) {
    o = Object.assign({ at: [0.5, 0.9], spread: 0.03, count: 60, color: 'rgba(255,150,60,0.9)', rise: 1, size: 1 }, o || {})
    const list = []
    const sprite = glowSprite(o.color)
    const make = () => {
      const p = px(o.at[0] + rand(-o.spread, o.spread), o.at[1])
      return { x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-60, -120) * o.rise, life: rand(1.2, 3.2), max: 0, s: rand(1.5, 3.5) * o.size }
    }
    const fx = {
      opts: o,
      update(dt, t) {
        while (list.length < Math.min(400, o.count)) {
          const e = make()
          e.max = e.life
          list.push(e)
        }
        for (const e of list) {
          e.life -= dt
          e.vx += (noise(e.x * 0.01, t) - 0.5) * 80 * dt + (o.wind || vd.wind) * 40 * dt
          e.x += e.vx * dt
          e.y += e.vy * dt
          if (e.life <= 0) {
            Object.assign(e, make())
            e.max = e.life
          }
        }
      },
      draw(g) {
        g.globalCompositeOperation = 'lighter'
        for (const e of list) {
          const a = Math.max(0, e.life / e.max)
          g.globalAlpha = a
          const s = e.s * 3
          g.drawImage(sprite, e.x - s, e.y - s, s * 2, s * 2)
        }
        g.globalAlpha = 1
        g.globalCompositeOperation = 'source-over'
      },
      resize() {
        list.length = 0
      }
    }
    effects.push(fx)
    return fx
  }

  /** Nebel: weiche Schwaden, die langsam durchziehen */
  function fog(o) {
    o = Object.assign({ color: 'rgba(210,220,235,1)', density: 0.35, speed: 1, region: [0, 0.55, 1, 1], blobs: 14 }, o || {})
    const sprite = glowSprite(o.color)
    let list = []
    let ready = false
    const fx = {
      opts: o,
      update(dt) {
        const a = px(o.region[0], o.region[1])
        const b = px(o.region[2], o.region[3])
        if (!ready) {
          list = Array.from({ length: Math.min(60, o.blobs) }, () => ({ x: rand(a.x - 200, b.x), y: rand(a.y, b.y), s: rand(180, 420), v: rand(6, 18) }))
          ready = true
        }
        for (const f of list) {
          f.x += (f.v + vd.wind * 40) * o.speed * dt
          if (mouse.active) {
            const dx = f.x - mouse.x
            const dy = f.y - mouse.y
            const d = Math.hypot(dx, dy)
            if (d < f.s * 0.5) f.x += (dx / (d || 1)) * 30 * dt
          }
          if (f.x - f.s > b.x) f.x = a.x - f.s
        }
      },
      draw(g) {
        g.globalAlpha = clamp(o.density, 0, 1) * 0.5
        for (const f of list) g.drawImage(sprite, f.x - f.s, f.y - f.s * 0.45, f.s * 2, f.s * 0.9)
        g.globalAlpha = 1
      },
      resize() {
        ready = false
      }
    }
    effects.push(fx)
    return fx
  }

  /** Sterne: funkeln in einem Bereich, ab und zu eine Sternschnuppe */
  function stars(o) {
    o = Object.assign({ count: 160, region: [0, 0, 1, 0.45], twinkle: 1, shooting: true, color: '#ffffff' }, o || {})
    let list = []
    let shot = null
    let next = rand(4, 10)
    let ready = false
    const fx = {
      opts: o,
      update(dt) {
        if (!ready) {
          list = Array.from({ length: Math.min(1500, o.count) }, () => {
            const p = px(rand(o.region[0], o.region[2]), rand(o.region[1], o.region[3]))
            return { x: p.x, y: p.y, r: rand(0.4, 1.4), ph: rand(0, 6.28), sp: rand(0.5, 2) }
          })
          ready = true
        }
        if (o.shooting) {
          next -= dt
          if (next <= 0 && !shot) {
            const p = px(rand(o.region[0], o.region[2]), rand(o.region[1], (o.region[1] + o.region[3]) / 2))
            shot = { x: p.x, y: p.y, vx: rand(-700, -400), vy: rand(150, 300), life: 0.9 }
            next = rand(6, 18)
          }
          if (shot) {
            shot.x += shot.vx * dt
            shot.y += shot.vy * dt
            shot.life -= dt
            if (shot.life <= 0) shot = null
          }
        }
      },
      draw(g, t) {
        g.fillStyle = o.color
        for (const s of list) {
          g.globalAlpha = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.sp * o.twinkle + s.ph))
          g.fillRect(s.x, s.y, s.r, s.r)
        }
        if (shot) {
          g.globalAlpha = Math.max(0, shot.life)
          g.strokeStyle = o.color
          g.lineWidth = 1.5
          g.beginPath()
          g.moveTo(shot.x, shot.y)
          g.lineTo(shot.x - shot.vx * 0.12, shot.y - shot.vy * 0.12)
          g.stroke()
        }
        g.globalAlpha = 1
      },
      resize() {
        ready = false
      }
    }
    effects.push(fx)
    return fx
  }

  /** Gewitter: Blitz mit Aufhellung in Abständen (oder per Klick, onClick: true) */
  function lightning(o) {
    o = Object.assign({ every: 14, flash: 0.55, color: 'rgba(220,230,255,1)', onClick: false }, o || {})
    let wait = rand(3, o.every)
    let flash = 0
    let bolt = null
    const strike = (x) => {
      flash = o.flash
      const pts = [[x === undefined ? rand(W * 0.1, W * 0.9) : x, 0]]
      const end = rand(H * 0.35, H * 0.7)
      while (pts[pts.length - 1][1] < end) {
        const [px0, py0] = pts[pts.length - 1]
        pts.push([px0 + rand(-25, 25), py0 + rand(12, 30)])
      }
      bolt = { pts, life: 0.25 }
    }
    if (o.onClick) listeners.click.push((x) => strike(x))
    const fx = {
      opts: o,
      strike,
      update(dt) {
        wait -= dt
        if (wait <= 0 && o.every > 0) {
          strike()
          wait = rand(o.every * 0.5, o.every * 1.5)
        }
        flash = Math.max(0, flash - dt * 2.5)
        if (bolt) {
          bolt.life -= dt
          if (bolt.life <= 0) bolt = null
        }
      },
      draw(g) {
        if (bolt) {
          g.strokeStyle = o.color
          g.shadowColor = o.color
          g.shadowBlur = 18
          g.lineWidth = 2
          g.beginPath()
          bolt.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
          g.stroke()
          g.shadowBlur = 0
        }
        if (flash > 0) {
          g.fillStyle = `rgba(230,236,255,${flash})`
          g.fillRect(0, 0, W, H)
        }
      }
    }
    effects.push(fx)
    return fx
  }

  /** Licht an einer Stelle im Bild (Fenster, Laterne, Kerze), flackert auf Wunsch */
  function glow(o) {
    o = Object.assign({ at: [0.5, 0.5], radius: 0.06, color: 'rgba(255,200,120,0.8)', flicker: 0.25, intensity: 1 }, o || {})
    const sprite = glowSprite(o.color)
    const seed = Math.random() * 100
    const fx = {
      opts: o,
      update() {},
      draw(g, t) {
        const p = px(o.at[0], o.at[1])
        const r = o.radius * W
        const f = 1 - o.flicker + o.flicker * noise(seed, t * 3)
        g.globalCompositeOperation = 'lighter'
        g.globalAlpha = clamp(f * o.intensity, 0, 1)
        g.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2)
        g.globalAlpha = 1
        g.globalCompositeOperation = 'source-over'
      }
    }
    effects.push(fx)
    return fx
  }

  // ---------- Schleife ----------
  let debug = false
  let t0 = 0
  let last = 0
  function layout() {
    const w = window.innerWidth
    const h = window.innerHeight
    DPR = Math.min(window.devicePixelRatio || 1, 1.5)
    W = w
    H = h
    canvas.width = Math.round(W * DPR)
    canvas.height = Math.round(H * DPR)
    layoutCover()
    renderBackground()
    for (const s of surfaces) s.build()
    for (const fx of effects) if (fx.resize) fx.resize()
  }
  window.addEventListener('resize', () => layout())

  function frame(now) {
    requestAnimationFrame(frame)
    if (paused || document.hidden) return
    if (now - lastFrame < 1000 / fpsCap - 2) return
    lastFrame = now
    if (!t0) t0 = now
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
    last = now
    const t = (now - t0) / 1000
    vd.time = t
    vd.dt = dt
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0)
    ctx.drawImage(bgCanvas, 0, 0, W, H)
    for (const f of before) callLayer(f, dt, t)
    for (const fx of effects) {
      try {
        fx.update(dt, t)
        fx.draw(ctx, t)
      } catch (err) {
        fail(err, 'Effekt')
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
    for (const f of after) callLayer(f, dt, t)
    if (debug) drawDebug()
    if (++frames === 3 && !errorSent) post({ type: 'status', ok: true })
  }
  function callLayer(f, dt, t) {
    try {
      ctx.save()
      f(ctx, dt, vd.time)
      ctx.restore()
    } catch (err) {
      ctx.restore()
      fail(err, 'onFrame')
    }
  }
  function drawDebug() {
    ctx.lineWidth = 2
    surfaces.forEach((s, k) => {
      if (!s.n) return
      ctx.strokeStyle = `hsl(${(k * 67) % 360},90%,60%)`
      ctx.beginPath()
      for (let i = 0; i < s.n; i++) ctx[i ? 'lineTo' : 'moveTo'](s.x0 + i * STEP, s.ys[i])
      ctx.stroke()
    })
  }

  function snapshot(req) {
    try {
      const max = 1280
      const k = Math.min(1, max / canvas.width)
      const c = document.createElement('canvas')
      c.width = Math.round(canvas.width * k)
      c.height = Math.round(canvas.height * k)
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height)
      post({ type: 'snapshot', req, data: c.toDataURL('image/jpeg', 0.82) })
    } catch (err) {
      post({ type: 'snapshot', req, error: String(err && err.message ? err.message : err) })
    }
  }

  const vd = {
    get width() {
      return W
    },
    get height() {
      return H
    },
    canvas,
    ctx,
    time: 0,
    dt: 0,
    /** globaler Wind (−1..1), wirkt auf alle Effekte – z. B. in onFrame verändern */
    wind: 0,
    mouse,
    get image() {
      return imgReady ? img : null
    },
    get imageSize() {
      return imgReady ? { w: img.naturalWidth, h: img.naturalHeight } : null
    },
    surfaces,
    px,
    norm,
    rand,
    lerp,
    clamp,
    noise,
    /** Hintergrund: { image: true, dim: 0..1, blur: px, top: '#…', bottom: '#…' } (Verlauf, wenn kein Bild) */
    background(o) {
      Object.assign(bgOpts, o || {})
      if (W) renderBackground()
    },
    /** Fläche aus Punkten im Bild [[nx,ny], …] (links nach rechts). Optionen: { snow: true, maxDepth: 18 } */
    surface: addSurface,
    autoSurfaces,
    whenImage,
    snow,
    rain,
    fireflies,
    leaves,
    embers,
    fog,
    stars,
    lightning,
    glow,
    /** eigene Zeichnung vor den Effekten: fn(ctx, dt, t) */
    onBefore(fn) {
      before.push(fn)
    },
    /** eigene Zeichnung nach den Effekten: fn(ctx, dt, t) */
    onFrame(fn) {
      after.push(fn)
    },
    /** 'click' | 'move' | 'down' | 'up' → fn(x, y) in Bildschirm-Pixeln */
    on(kind, fn) {
      if (listeners[kind]) listeners[kind].push(fn)
    },
    /** Flächen als farbige Linien zeigen (zum Prüfen per desk_scene_snapshot) */
    debugSurfaces(on = true) {
      debug = !!on
    },
    __start() {
      if (started) return
      started = true
      layout()
      requestAnimationFrame(frame)
    }
  }
  window.vd = vd
  // Canvas erst einhängen, wenn der Body da ist (die Laufzeit lädt im Kopf)
  document.addEventListener('DOMContentLoaded', () => document.body.prepend(canvas))
  if (document.body) document.body.prepend(canvas)
})()

// VibeDesk – Startseite „Chaos → Ruhe“.
// Die Geschichte in Zeichen: Terminal-Lärm regnet herunter, aus dem Regen entsteht der echte Screenshot.
// Jede Zeichenfläche ist ein Canvas mit Glyphen-Atlas (kein DOM-Element pro Zeichen). Sie läuft nur,
// solange sie sichtbar und der Tab offen ist. Bei reduzierter Bewegung gibt es Standbilder.
;(() => {
  'use strict'
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches
  const FINE = matchMedia('(pointer: fine)').matches
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  const MONO = '"JetBrains Mono", ui-monospace, Consolas, monospace'
  // Farbe heißt Status: Bernstein wartet, Grün arbeitet, Blau ist fertig. Der Rest ist Nacht und Regen.
  const C = {
    ink: '#e3e7ef',
    ink2: '#a3abbb',
    ink3: '#6f788a',
    ink4: '#454c5c',
    amber: '#f3b94d',
    green: '#5fd497',
    blue: '#7aa7ff',
    violet: '#b49cff'
  }
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
  const hash = (i) => {
    let x = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b)
    x ^= x >>> 13
    x = Math.imul(x, 0xc2b2ae35)
    x ^= x >>> 16
    return (x >>> 0) / 4294967296
  }
  const mmss = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
  const IO = 'IntersectionObserver' in window

  // ---------- Zeichenraster ----------
  // Rahmen- und Blockzeichen werden gezeichnet statt gesetzt, damit sie lückenlos aneinanderstoßen.
  const BOX = { '─': 'lr', '│': 'ud', '┌': 'rd', '┐': 'ld', '└': 'ru', '┘': 'lu', '├': 'udr', '┤': 'udl', '┬': 'lrd', '┴': 'lru', '┼': 'udlr', '═': 'LR', '║': 'UD', '╔': 'RD', '╗': 'LD', '╚': 'RU', '╝': 'LU' }
  const grids = []

  function makeGrid(canvas, sizeFor) {
    const ctx = canvas.getContext('2d')
    const atlas = document.createElement('canvas')
    const ac = atlas.getContext('2d')
    const PER = 64
    const slots = new Map()
    let used = 0
    const g = { canvas, cols: 0, rows: 0, cw: 6, ch: 12, fs: 12, dpr: 1, W: 0, H: 0, ox: 0, oy: 0, chr: [], col: [], alp: new Float32Array(0) }

    function draw(c, x, y, color) {
      const w = g.cw
      const h = g.ch
      ac.fillStyle = color
      if (c === '█') return ac.fillRect(x, y, w, h)
      const b = BOX[c]
      if (b) {
        const lw = Math.max(1, Math.round(w * 0.12))
        const cx = x + Math.round((w - lw) / 2)
        const cy = y + Math.round((h - lw) / 2)
        if (b === b.toLowerCase()) {
          if (b.includes('l')) ac.fillRect(x, cy, cx - x + lw, lw)
          if (b.includes('r')) ac.fillRect(cx, cy, x + w - cx, lw)
          if (b.includes('u')) ac.fillRect(cx, y, lw, cy - y + lw)
          if (b.includes('d')) ac.fillRect(cx, cy, lw, y + h - cy)
          return
        }
        // Doppellinien (für den Schriftzug am Ende)
        const d = Math.max(lw + 1, Math.round(w * 0.2))
        const x1 = cx - d
        const x2 = cx + d
        const y1 = cy - d
        const y2 = cy + d
        const L = b.includes('L')
        const R = b.includes('R')
        const U = b.includes('U')
        const D = b.includes('D')
        if (L && R) {
          ac.fillRect(x, y1, w, lw)
          ac.fillRect(x, y2, w, lw)
        } else if (U && D) {
          ac.fillRect(x1, y, lw, h)
          ac.fillRect(x2, y, lw, h)
        } else if (R && D) {
          ac.fillRect(x1, y1, x + w - x1, lw)
          ac.fillRect(x1, y1, lw, y + h - y1)
          ac.fillRect(x2, y2, x + w - x2, lw)
          ac.fillRect(x2, y2, lw, y + h - y2)
        } else if (L && D) {
          ac.fillRect(x, y1, x2 - x + lw, lw)
          ac.fillRect(x2, y1, lw, y + h - y1)
          ac.fillRect(x, y2, x1 - x + lw, lw)
          ac.fillRect(x1, y2, lw, y + h - y2)
        } else if (R && U) {
          ac.fillRect(x1, y, lw, y2 - y + lw)
          ac.fillRect(x1, y2, x + w - x1, lw)
          ac.fillRect(x2, y, lw, y1 - y + lw)
          ac.fillRect(x2, y1, x + w - x2, lw)
        } else if (L && U) {
          ac.fillRect(x2, y, lw, y2 - y + lw)
          ac.fillRect(x, y2, x2 - x + lw, lw)
          ac.fillRect(x1, y, lw, y1 - y + lw)
          ac.fillRect(x, y1, x1 - x + lw, lw)
        }
        return
      }
      ac.save()
      ac.beginPath()
      ac.rect(x, y, w, h)
      ac.clip()
      ac.font = `400 ${(g.fs * g.dpr).toFixed(2)}px ${MONO}`
      ac.textAlign = 'center'
      ac.textBaseline = 'middle'
      ac.fillText(c, x + w / 2, y + h * 0.54)
      ac.restore()
    }

    g.slot = (c, color) => {
      const k = color + c
      let s = slots.get(k)
      if (s !== undefined) return s
      s = used++
      const sy = Math.floor(s / PER) * g.ch
      if (sy + g.ch > atlas.height) {
        const keep = document.createElement('canvas')
        keep.width = atlas.width
        keep.height = atlas.height
        keep.getContext('2d').drawImage(atlas, 0, 0)
        atlas.height *= 2
        ac.drawImage(keep, 0, 0)
      }
      draw(c, (s % PER) * g.cw, sy, color)
      slots.set(k, s)
      return s
    }
    g.resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      g.fs = sizeFor(r.width, r.height)
      g.dpr = dpr
      g.cw = Math.max(3, Math.round(g.fs * 0.6 * dpr))
      g.ch = Math.max(6, Math.round(g.fs * 1.36 * dpr))
      g.W = canvas.width = Math.max(1, Math.round(r.width * dpr))
      g.H = canvas.height = Math.max(1, Math.round(r.height * dpr))
      g.cols = Math.max(1, Math.floor(g.W / g.cw))
      g.rows = Math.max(1, Math.floor(g.H / g.ch))
      g.ox = Math.floor((g.W - g.cols * g.cw) / 2)
      g.oy = Math.floor((g.H - g.rows * g.ch) / 2)
      atlas.width = PER * g.cw
      atlas.height = g.ch * 4
      slots.clear()
      used = 0
      const n = g.cols * g.rows
      g.chr = new Array(n).fill('')
      g.col = new Array(n).fill(C.ink)
      g.alp = new Float32Array(n)
      return g
    }
    // Schrift ist nachgeladen: Glyphen neu zeichnen, Raster bleibt gleich
    g.invalidate = () => {
      slots.clear()
      used = 0
      ac.clearRect(0, 0, atlas.width, atlas.height)
    }
    g.clear = () => {
      g.chr.fill('')
      g.alp.fill(0)
    }
    g.set = (x, y, c, color, a = 1) => {
      if (x < 0 || y < 0 || x >= g.cols || y >= g.rows) return
      const i = y * g.cols + x
      g.chr[i] = c
      g.col[i] = color
      g.alp[i] = a
    }
    g.text = (x, y, s, color, a = 1, max = 1e9) => {
      const n = Math.min(s.length, max)
      for (let k = 0; k < n; k++) g.set(x + k, y, s[k], color, a)
    }
    // ein einzelnes Zeichen frei positioniert (Gerätepixel), über dem Raster
    g.blit = (c, color, a, px, py) => {
      if (a <= 0.01 || c === ' ') return
      const s = g.slot(c, color)
      ctx.globalAlpha = a > 1 ? 1 : a
      ctx.drawImage(atlas, (s % PER) * g.cw, Math.floor(s / PER) * g.ch, g.cw, g.ch, Math.round(px), Math.round(py), g.cw, g.ch)
    }
    g.paint = () => {
      ctx.globalAlpha = 1
      ctx.clearRect(0, 0, g.W, g.H)
      const { cols, rows, cw, ch, ox, oy, chr, col, alp } = g
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          const a = alp[i]
          if (a <= 0.01) continue
          const c = chr[i]
          if (!c || c === ' ') continue
          const s = g.slot(c, col[i])
          ctx.globalAlpha = a > 1 ? 1 : a
          ctx.drawImage(atlas, (s % PER) * cw, Math.floor(s / PER) * ch, cw, ch, ox + x * cw, oy + y * ch, cw, ch)
        }
      }
      ctx.globalAlpha = 1
    }
    g.px = (x) => g.ox + x * g.cw
    g.py = (y) => g.oy + y * g.ch
    grids.push(g)
    return g
  }

  if (document.fonts) {
    const again = () => grids.forEach((g) => g.invalidate())
    document.fonts.load(`400 16px ${MONO}`).then(again, () => {})
    document.fonts.ready.then(again, () => {})
  }

  // Läuft nur, solange el sichtbar und der Tab offen ist. frame(t, dt) gibt false zurück, wenn die Szene fertig ist.
  // first: Anteil, der beim allerersten Start sichtbar sein muss (damit niemand den Anfang verpasst).
  function runner(el, frame, fps = 60, first = 0) {
    let raf = 0
    let visible = !IO
    let begun = !first
    let last = 0
    let acc = 0
    let t = 0
    let done = false
    const step = 1 / fps
    const tick = (now) => {
      raf = 0
      if (!visible || document.hidden || done) return
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
      last = now
      acc += dt
      if (acc + 0.004 < step && dt) {
        raf = requestAnimationFrame(tick)
        return
      }
      const d = Math.min(0.1, acc)
      acc = 0
      t += d
      if (frame(t, d) === false) {
        done = true
        return
      }
      raf = requestAnimationFrame(tick)
    }
    const start = () => {
      if (!raf && !done && visible && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(tick)
      }
    }
    if (IO) {
      new IntersectionObserver(
        (es) => {
          const e = es[es.length - 1]
          if (!begun && e.intersectionRatio >= first) begun = true
          visible = begun && e.isIntersecting
          start()
        },
        { rootMargin: first ? '0px' : '80px 0px', threshold: first ? [0, first] : 0 }
      ).observe(el)
    }
    document.addEventListener('visibilitychange', start)
    start()
    return {
      restart() {
        t = 0
        done = false
        start()
      }
    }
  }

  function onResize(el, fn) {
    let w = el.getBoundingClientRect().width
    let q = 0
    const go = () => {
      q = 0
      const nw = el.getBoundingClientRect().width
      if (Math.abs(nw - w) < 2) return
      w = nw
      fn()
    }
    if ('ResizeObserver' in window) new ResizeObserver(() => q || (q = setTimeout(go, 160))).observe(el)
    else addEventListener('resize', () => q || (q = setTimeout(go, 160)))
  }

  // ---------- Navigation ----------
  {
    const nav = $('.nav')
    if (nav) {
      const on = () => nav.classList.toggle('scrolled', scrollY > 8)
      addEventListener('scroll', on, { passive: true })
      on()
    }
    const menu = $('.menu')
    if (menu) {
      document.addEventListener('click', (e) => {
        if (menu.open && !menu.contains(e.target)) menu.open = false
      })
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.open) {
          menu.open = false
          $('summary', menu).focus()
        }
      })
    }
  }

  // ---------- 1 · Hero: drei Terminals, eines wartet. Die Zeichen regnen herunter, der echte Screenshot entsteht. ----------
  const PANES = {
    api: {
      title: 'api-server',
      state: 'working',
      feed: [
        '> Add pagination to GET /users',
        '● Read(src/routes/users.ts)',
        '● Read(src/db/users.repo.ts)',
        '● Edit(src/routes/users.ts)',
        '  └ +18 -4',
        '● Edit(src/db/users.repo.ts)',
        '  └ +31 -2',
        '● Bash(npm run lint)',
        '  └ ✓ no problems',
        '● Write(src/routes/users.test.ts)',
        '  └ +64',
        '● Bash(npm test -- users)',
        '  └ ✓ 12 passed (0.9s)',
        '● Read(src/middleware/auth.ts)',
        '● Edit(src/routes/users.ts)',
        '  └ +6 -1',
        '● Bash(npm test)',
        '  └ ✓ 58 passed (2.1s)',
        '● Update Todos',
        '  └ [x] cursor-based pagination',
        '    [ ] document ?page= in README'
      ]
    },
    blog: {
      title: 'blog',
      state: 'working',
      feed: [
        '> Add an RSS feed',
        '● Read(astro.config.mjs)',
        '● Bash(npm i @astrojs/rss)',
        '  └ added 3 packages in 2s',
        '● Write(src/pages/rss.xml.ts)',
        '  └ +27',
        '● Read(src/content/config.ts)',
        '● Edit(src/pages/rss.xml.ts)',
        '  └ +6 -1',
        '● Edit(src/layouts/Base.astro)',
        '  └ +2',
        '● Bash(npm run build)',
        '  └ ✓ 41 pages built in 3.2s',
        '● Bash(npx astro check)',
        '  └ ✓ 0 errors, 0 warnings'
      ]
    },
    shop: {
      title: 'shop-frontend',
      state: 'waiting',
      feed: [
        '',
        '> Build a login page with validation',
        '',
        '● Read(src/App.tsx)',
        '● Read(src/pages/Home.tsx)',
        '● Write(src/pages/Login.tsx)',
        '  └ +88',
        '● Edit(src/App.tsx)',
        '  └ +3 -1',
        '● Edit(src/pages/Login.tsx)',
        '  └ +42 -3',
        ''
      ],
      prompt: [' Bash command', '   npm test', '', ' Do you want to proceed?', ' > 1. Yes', "   2. Yes, and don't ask again", '   3. No, tell Claude what to do']
    }
  }
  function tone(line) {
    if (line === ' Bash command' || line.startsWith(' > 1.')) return C.amber
    if (line === '   npm test' || line.startsWith(' Do you')) return C.ink
    if (line.startsWith('>')) return C.ink
    if (line.includes('✓')) return C.green
    if (line.startsWith('●')) return C.ink2
    return C.ink3
  }
  const hueTone = (r, g, b) => {
    const mx = Math.max(r, g, b)
    const mn = Math.min(r, g, b)
    let h = mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4
    h *= 60
    if (h < 0) h += 360
    return h < 70 ? C.amber : h < 170 ? C.green : h < 255 ? C.blue : C.violet
  }

  function story() {
    const fig = $('[data-story]')
    if (!fig) return
    const canvas = $('canvas', fig)
    const img = $('img', fig)
    const again = $('[data-replay]', fig)
    if (RM || !canvas.getContext) {
      fig.classList.add('done')
      return
    }
    fig.classList.add('live')
    const g = makeGrid(canvas, (w) => (w < 560 ? 8 : w < 900 ? 10 : 12))
    const T_RAIN = 3
    const T_DEV = 3.7
    const T_FADE = 6.1
    const T_END = 7.1
    const G = 64 // Fallbeschleunigung in Zeilen pro s²
    let panes = []
    let parts = null
    let pic = null
    let wait = 14 * 60 + 32
    let sec = 0
    let finished = false

    function layout() {
      g.resize()
      const { cols, rows } = g
      const n = cols >= 118 ? 3 : cols >= 74 ? 2 : 1
      const m = n === 1 ? 1 : 2
      const gap = 2
      const w = Math.floor((cols - 2 * m - gap * (n - 1)) / n)
      const keys = n === 3 ? ['api', 'shop', 'blog'] : n === 2 ? ['shop', 'api'] : ['shop']
      panes = keys.map((k, i) => {
        const d = PANES[k]
        const p = { ...d, x: m + i * (w + gap), y: 1, w, h: rows - 2, buf: [], i: Math.floor(hash(i + 11) * 9), next: 0 }
        const inner = p.h - 2
        // Das wartende Terminal steht still: Unterhaltung von oben, die Frage direkt darunter – wie in Claude Code
        if (d.state === 'waiting') p.buf = [...d.feed, ...d.prompt].slice(-inner)
        else for (let k2 = 0; k2 < inner; k2++) p.buf.push(d.feed[p.i++ % d.feed.length])
        return p
      })
      parts = null
      pic = null
      if (img.complete && img.naturalWidth) sample()
      // bis die Geschichte startet, stehen die drei Terminals schon still im Rahmen
      drawPanes(0)
      g.paint()
    }

    function frameBox(x, y, w, h, color, a) {
      g.set(x, y, '┌', color, a)
      g.set(x + w - 1, y, '┐', color, a)
      g.set(x, y + h - 1, '└', color, a)
      g.set(x + w - 1, y + h - 1, '┘', color, a)
      for (let i = 1; i < w - 1; i++) {
        g.set(x + i, y, '─', color, a)
        g.set(x + i, y + h - 1, '─', color, a)
      }
      for (let j = 1; j < h - 1; j++) {
        g.set(x, y + j, '│', color, a)
        g.set(x + w - 1, y + j, '│', color, a)
      }
    }

    function drawPanes(t) {
      g.clear()
      for (const p of panes) {
        const waiting = p.state === 'waiting'
        const a = waiting ? 0.5 + 0.4 * (0.5 + 0.5 * Math.sin(t * 4.2)) : 0.95
        frameBox(p.x, p.y, p.w, p.h, waiting ? C.amber : C.ink4, a)
        g.text(p.x + 2, p.y, ' ', C.ink)
        g.set(p.x + 3, p.y, '●', waiting ? C.amber : C.green)
        g.text(p.x + 4, p.y, ' ' + p.title + ' ', C.ink)
        const right = waiting ? ' waiting ' + mmss(wait) + ' ' : ' working '
        if (p.w > p.title.length + right.length + 10) g.text(p.x + p.w - 2 - right.length, p.y, right, waiting ? C.amber : C.ink3)
        const inner = p.h - 2
        const max = p.w - 4
        for (let k = 0; k < inner; k++) {
          const line = waiting ? p.buf[k] : p.buf[p.buf.length - inner + k]
          if (!line) continue
          const color = tone(line)
          g.text(p.x + 2, p.y + 1 + k, line, color, color === C.ink3 ? 0.85 : 1, max)
          if (line[0] === '●') g.set(p.x + 2, p.y + 1 + k, '●', C.ink3)
        }
      }
    }

    // Das echte Bild als Zeichen: Helligkeit wird zu Dichte, kräftige Farben zu Statusfarben
    function sample() {
      try {
        const { cols, rows } = g
        const K = 4 // Abtastpunkte je Zelle und Richtung
        const W = cols * K
        const off = document.createElement('canvas')
        off.width = W
        off.height = rows * K
        const o = off.getContext('2d', { willReadFrequently: true })
        const iw = img.naturalWidth
        const ih = img.naturalHeight
        const s = Math.max(g.W / iw, g.H / ih)
        const pos = getComputedStyle(img).objectPosition.split(' ').map((v) => parseFloat(v) / 100)
        const sx = (iw - g.W / s) * (isNaN(pos[0]) ? 0.5 : pos[0])
        const sy = (ih - g.H / s) * (isNaN(pos[1]) ? 0.5 : pos[1])
        o.drawImage(img, sx + g.ox / s, sy + g.oy / s, (cols * g.cw) / s, (rows * g.ch) / s, 0, 0, W, rows * K)
        const d = o.getImageData(0, 0, W, rows * K).data
        const RAMP = ' .·:-=+*#%'
        const n = cols * rows
        pic = { chr: new Array(n), col: new Array(n), alp: new Float32Array(n) }
        // Kontrast innerhalb einer Zelle zeigt Schrift, Rahmen und Symbole – die weiche Unschärfe dahinter bleibt leer
        for (let cy = 0; cy < rows; cy++) {
          for (let cx = 0; cx < cols; cx++) {
            let hi = 0
            let lo = 1
            let j0 = 0
            for (let yy = 0; yy < K; yy++) {
              for (let xx = 0; xx < K; xx++) {
                const j = ((cy * K + yy) * W + cx * K + xx) * 4
                const L = (0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]) / 255
                if (L > hi) {
                  hi = L
                  j0 = j
                }
                if (L < lo) lo = L
              }
            }
            const i = cy * cols + cx
            const v = clamp((hi - lo - 0.045) / 0.36) * clamp((hi - 0.1) / 0.45 + 0.3)
            pic.chr[i] = RAMP[Math.round(Math.pow(v, 0.7) * (RAMP.length - 1))]
            const r = d[j0]
            const gr = d[j0 + 1]
            const b = d[j0 + 2]
            const mx = Math.max(r, gr, b)
            const mn = Math.min(r, gr, b)
            pic.col[i] = mx > 110 && (mx - mn) / mx > 0.4 ? hueTone(r, gr, b) : v > 0.55 ? C.ink : v > 0.3 ? C.ink2 : C.ink3
            pic.alp[i] = 0.5 + v * 0.5
          }
        }
      } catch (e) {
        pic = null
      }
    }

    // Was gerade auf dem Raster steht, wird zu Regen: gut die Hälfte der Zeichen fällt,
    // der Rest verblasst an Ort und Stelle – dazu frischer Regen von oben
    function release(t) {
      drawPanes(t)
      parts = []
      const { cols, rows, chr, col, alp } = g
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const i = y * cols + x
          const c = chr[i]
          if (!c || c === ' ' || alp[i] < 0.05) continue
          const t0 = t + hash(i) * 0.8 + (x / cols) * 0.3
          parts.push({ x, y0: y, c, color: col[i], a: alp[i], t0, stay: hash(i + 7919) > 0.6 })
        }
      }
      const n = Math.round(cols * 0.8)
      for (let k = 0; k < n; k++) parts.push({ x: Math.floor(Math.random() * cols), y0: -1 - Math.random() * 6, c: '|', color: C.ink2, a: 0.5, t0: t + Math.random() * 2.4 })
    }

    function fall(t) {
      const top = g.py(0)
      const rows = g.rows
      for (const p of parts) {
        if (p.dead) continue
        const d = t - p.t0
        if (d < 0) {
          if (p.y0 >= 0) g.blit(p.c, p.color, p.a, g.px(p.x), top + p.y0 * g.ch)
          continue
        }
        if (p.stay) {
          if (d > 0.3) p.dead = true
          else g.blit(p.c, p.color, p.a * (1 - d / 0.3), g.px(p.x), top + p.y0 * g.ch)
          continue
        }
        const y = p.y0 + 0.5 * G * d * d + 3 * d
        if (y > rows) {
          p.dead = true
          continue
        }
        // je tiefer ein Tropfen fällt, desto leiser wird er
        const fade = clamp((rows - y) / 5) * clamp(1 - (y - Math.max(0, p.y0)) / (rows * 1.15))
        if (d < 0.07) {
          g.blit(p.c, p.color, p.a * fade, g.px(p.x), top + y * g.ch)
          continue
        }
        g.blit(G * d > 12 ? '|' : ':', C.ink2, 0.6 * fade, g.px(p.x), top + y * g.ch)
      }
    }

    function develop(t) {
      const { cols, rows } = g
      const n = cols * rows
      for (let i = 0; i < n; i++) {
        const c = pic.chr[i]
        if (c === ' ') continue
        const y = (i / cols) | 0
        const tr = T_DEV + (y / rows) * 1.1 + hash(i * 7 + 3) * 0.45
        if (t < tr) continue
        g.chr[i] = c
        g.col[i] = pic.col[i]
        g.alp[i] = clamp((t - tr) / 0.35) * pic.alp[i]
      }
    }

    function frame(t) {
      if (Math.floor(t) !== sec) {
        sec = Math.floor(t)
        wait++
      }
      if (t < T_RAIN) {
        // Die arbeitenden Terminals schreiben weiter, das wartende steht still
        for (const p of panes) {
          if (p.state === 'waiting' || t < p.next) continue
          p.buf.push(p.feed[p.i++ % p.feed.length])
          if (p.buf.length > 240) p.buf.splice(0, 120)
          p.next = t + 0.08 + Math.random() * 0.14
        }
        drawPanes(t)
        g.paint()
        return
      }
      if (!parts) release(t)
      g.clear()
      if (pic && t > T_DEV) develop(t)
      g.paint()
      fall(t)
      if (t > T_FADE) fig.classList.add('reveal')
      if (t > T_END) {
        finished = true
        fig.classList.add('done')
        return false
      }
    }

    layout()
    if (!pic) img.addEventListener('load', () => !pic && g.cols && sample(), { once: true })
    const run = runner($('.story-screen', fig), frame, 30, 0.55)
    onResize(canvas, () => {
      if (finished) return
      layout()
    })
    if (again) {
      again.addEventListener('click', () => {
        fig.classList.remove('reveal', 'done')
        finished = false
        wait = 14 * 60 + 32
        sec = 0
        layout()
        run.restart()
      })
    }
  }

  // ---------- 2 · Ausprobieren: wer wartet, Freigabe mit einem Klick ----------
  const REQ = [
    { cmd: 'npm test', act: 'Wants to run npm test', run: 'Bash(npm test)', ok: '✓ 42 tests passed', done: 'Finished. Tests are green.' },
    { cmd: 'npm run build', act: 'Wants to run npm run build', run: 'Bash(npm run build)', ok: '✓ built in 4.1s', done: 'Finished. The build is ready.' },
    { cmd: 'git push origin login-page', act: 'Wants to push to GitHub', run: 'Bash(git push origin login-page)', ok: '✓ pushed login-page', done: 'Finished. Branch pushed.' }
  ]
  function board() {
    const b = $('[data-board]')
    if (!b) return
    const row = (k) => $(`[data-s="${k}"]`, b)
    const card = $('[data-approve]', b)
    const hint = $('[data-hint]', b)
    const adot = $('[data-adot]', b)
    const cmd = $('[data-req-cmd]', b)
    const toast = $('[data-toast]', b)
    const btns = $$('button', card)
    let req = 0
    let wait = 14 * 60 + 32
    let waiting = true
    let timers = []
    const later = (ms, fn) => timers.push(setTimeout(fn, ms))
    const setRow = (k, st, act) => {
      const r = row(k)
      const cls = { working: 'g', waiting: 'y', done: 'b' }[st]
      $('[data-dot]', r).className = 'dot ' + cls
      const chip = $('[data-chip]', r)
      chip.className = 'sb-st ' + cls
      chip.textContent = st === 'waiting' ? 'waiting ' + mmss(wait) : st
      $('[data-act]', r).textContent = act
      r.classList.toggle('hot', st === 'waiting')
    }
    // Die Wartezeit tickt, solange niemand antwortet
    setInterval(() => {
      if (!waiting || document.hidden) return
      wait++
      $('[data-chip]', row('shop')).textContent = 'waiting ' + mmss(wait)
    }, 1000)
    // api-server arbeitet still vor sich hin
    const steps = ['Edit(src/routes/users.ts)', 'Bash(npm run lint)', 'Read(src/db/schema.ts)', 'Edit(src/db/users.repo.ts)', 'Bash(npm test -- users)']
    let ai = 0
    if (!RM) {
      setInterval(() => {
        if (document.hidden) return
        ai = (ai + 1) % steps.length
        $('[data-act]', row('api')).textContent = steps[ai]
      }, 2600)
    }
    const ask = () => {
      timers.forEach(clearTimeout)
      timers = []
      const q = REQ[req % REQ.length]
      waiting = true
      setRow('shop', 'waiting', q.act)
      cmd.textContent = q.cmd
      card.classList.remove('ok')
      adot.className = 'dot y'
      btns.forEach((x) => (x.disabled = false))
      hint.textContent = 'A new question. Answer it the same way.'
      toast.classList.remove('show')
      b.classList.remove('done')
    }
    card.addEventListener('click', (e) => {
      const btn = e.target.closest('button')
      if (!btn || btn.disabled) return
      const a = btn.dataset.a
      const q = REQ[req % REQ.length]
      if (a === 'term') {
        hint.textContent = 'Opens the terminal with Claude’s usual prompt.'
        return
      }
      waiting = false
      btns.forEach((x) => (x.disabled = true))
      if (a === 'deny') {
        setRow('shop', 'working', 'Denied. Claude takes another route.')
        adot.className = 'dot b'
        hint.textContent = 'Denied. Claude takes another route.'
      } else {
        card.classList.add('ok')
        adot.className = 'dot g'
        setRow('shop', 'working', q.run)
        hint.textContent = a === 'always' ? 'Allowed and remembered. Working again.' : 'Allowed. Working again.'
        later(1500, () => setRow('shop', 'working', q.ok))
        later(2900, () => {
          setRow('shop', 'done', q.done)
          toast.classList.add('show')
          b.classList.add('done')
        })
      }
      later(7600, () => {
        req++
        wait = 0
        ask()
      })
    })
  }

  // ---------- 3 · Gedächtnis: ein Ordner mit Notizen – die neue Session liest drei und lernt eine dazu ----------
  function memory() {
    const fig = $('[data-mem]')
    if (!fig) return
    const log = $$('.mem-log li', fig)
    const note = (k) => $(`[data-note="${k}"]`, fig)
    const fresh = note('new')
    const name = fresh && $('[data-type]', fresh)
    const full = name ? name.dataset.type : ''
    const lastBranch = $('.mem-b', note('tests'))
    const finish = () => {
      log.forEach((l) => l.classList.add('on'))
      ;['login', 'auth', 'cookie'].forEach((k) => note(k).classList.add('read'))
      fresh.classList.add('on')
      lastBranch.textContent = '├── '
    }
    if (!fresh) return
    if (RM || !IO) return finish()
    fig.classList.add('play')
    let timers = []
    const at = (s, fn) => timers.push(setTimeout(fn, s * 1000))
    const play = () => {
      timers.forEach(clearTimeout)
      timers = []
      log.forEach((l) => l.classList.remove('on'))
      $$('.read', fig).forEach((l) => l.classList.remove('read'))
      fresh.classList.remove('on')
      lastBranch.textContent = '└── '
      name.textContent = ''
      at(0.2, () => log[0].classList.add('on'))
      at(0.7, () => log[1].classList.add('on'))
      at(1.6, () => log[2].classList.add('on'))
      at(2.4, () => log[3].classList.add('on'))
      at(2.5, () => note('login').classList.add('read'))
      at(2.8, () => note('auth').classList.add('read'))
      at(3.1, () => note('cookie').classList.add('read'))
      at(3.9, () => log[4].classList.add('on'))
      at(4.8, () => {
        log[5].classList.add('on')
        lastBranch.textContent = '├── '
        fresh.classList.add('on')
        // die neue Notiz tippt sich ein
        let k = 0
        const type = () => {
          name.textContent = full.slice(0, ++k)
          if (k < full.length) timers.push(setTimeout(type, 28))
        }
        type()
      })
    }
    // spielt, sobald der Ordner im Bild ist – und noch einmal, wenn man später zurückkommt
    let shown = false
    new IntersectionObserver(
      (es) => {
        const e = es[es.length - 1]
        if (e.isIntersecting && !shown) {
          shown = true
          play()
        } else if (!e.isIntersecting && shown && e.boundingClientRect.top > 0) {
          shown = false
          timers.forEach(clearTimeout)
          finish()
        }
      },
      { threshold: 0.45 }
    ).observe(fig)
  }

  // ---------- 4 · Ruhe: Regen über die ganze Breite, Stärke per Regler, der Mauszeiger ist ein Schirm ----------
  function rain() {
    const sec = $('[data-rain-field]')
    if (!sec) return
    const canvas = $('canvas', sec)
    const slider = $('[data-rain]', sec)
    const out = $('[data-rain-v]', sec)
    const quietEl = $('[data-quiet]', sec)
    const g = makeGrid(canvas, (w) => (w < 560 ? 10 : 12))
    let density = slider ? Number(slider.value) / 100 : 0.55
    let drops = []
    let rings = []
    let quiet = [0, 0, 0, 0]
    let umbrella = null

    function layout() {
      g.resize()
      drops = []
      rings = []
      if (quietEl) {
        const r = canvas.getBoundingClientRect()
        const q = quietEl.getBoundingClientRect()
        const toX = (px) => ((px - r.left) * g.dpr - g.ox) / g.cw
        const toY = (py) => ((py - r.top) * g.dpr - g.oy) / g.ch
        quiet = [toX(q.left) - 3, toX(q.right) + 3, toY(q.top) - 1.5, toY(q.bottom) + 1.5]
      }
      // gleich zu Beginn schon Regen in der Luft
      const n = Math.round(density * g.cols * 1.6)
      for (let k = 0; k < n; k++) drops.push(drop(Math.random() * (g.rows - 2)))
    }
    const drop = (y = -1 - Math.random() * 2) => {
      const z = Math.random()
      return { x: Math.floor(Math.random() * g.cols), y, z, v: 9 + z * 20 }
    }

    function frame(t, dt) {
      const { cols, rows } = g
      const water = rows - 2
      let want = density * cols * 1.1 * dt
      while (want > 0) {
        if (Math.random() < want) drops.push(drop())
        want -= 1
      }
      g.clear()
      // eine ruhige Wasserlinie, die sich kaum bewegt
      for (let x = 0; x < cols; x++) {
        const v = Math.sin(x * 0.21 + t * 0.9) + Math.sin(x * 0.067 - t * 0.5)
        g.set(x, water, v > 1.3 ? '~' : '_', C.ink3, v > 1.3 ? 0.3 : 0.16)
      }
      // Ringe, wo Tropfen ins Wasser fallen
      for (const r of rings) {
        const age = t - r.t
        if (age > 0.55) {
          r.dead = true
          continue
        }
        const s = Math.floor(age * 12)
        const a = 0.7 * (1 - age / 0.55)
        if (r.u) {
          g.set(r.x - 1 - s, r.y, '·', C.ink2, a)
          g.set(r.x + 1 + s, r.y, '·', C.ink2, a)
          continue
        }
        g.set(r.x - s, water, '~', C.ink2, a)
        g.set(r.x + s, water, '~', C.ink2, a)
        if (age < 0.14) g.set(r.x, water - 1, age < 0.07 ? "'" : '.', C.ink2, a)
      }
      g.paint()
      const top = g.py(0)
      for (const d of drops) {
        if (d.dead) continue
        d.y += d.v * dt
        if (umbrella) {
          const dx = d.x - umbrella[0]
          const R = 6
          if (Math.abs(dx) <= R) {
            const dome = umbrella[1] - 1.6 * (1 - (dx / R) ** 2)
            if (d.y >= dome && d.y < umbrella[1] + 2) {
              d.dead = true
              rings.push({ x: d.x, y: Math.round(dome), t, u: true })
              continue
            }
          }
        }
        if (d.y >= water) {
          d.dead = true
          rings.push({ x: d.x, t })
          continue
        }
        const inQuiet = d.x > quiet[0] && d.x < quiet[1] && d.y > quiet[2] && d.y < quiet[3]
        const a = (0.16 + d.z * 0.56) * (inQuiet ? 0.28 : 1)
        const c = d.z > 0.62 ? '|' : d.z > 0.3 ? '¦' : ':'
        g.blit(c, d.z > 0.5 ? C.ink2 : C.ink3, a, g.px(d.x), top + d.y * g.ch)
      }
      if (drops.length > 600 || rings.length > 300) {
        drops = drops.filter((d) => !d.dead)
        rings = rings.filter((r) => !r.dead)
      }
    }

    if (slider) {
      const apply = () => {
        density = Number(slider.value) / 100
        if (out) out.textContent = slider.value + '%'
      }
      slider.addEventListener('input', apply)
      apply()
    }
    if (FINE && !RM) {
      sec.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect()
        umbrella = [((e.clientX - r.left) * g.dpr - g.ox) / g.cw, ((e.clientY - r.top) * g.dpr - g.oy) / g.ch]
      })
      sec.addEventListener('pointerleave', () => (umbrella = null))
    }
    layout()
    if (RM) {
      // Standbild: ein Moment Regen
      frame(1, 0)
      if (slider) slider.addEventListener('input', () => frame(1, 0))
      onResize(canvas, () => {
        layout()
        frame(1, 0)
      })
      return
    }
    runner(sec, frame)
    onResize(canvas, layout)
  }

  // ---------- 6 · Schluss: der Schriftzug aus Zeichen, auf dessen Kanten der Regen spritzt ----------
  const LETTERS = {
    V: ['██╗   ██╗', '██║   ██║', '██║   ██║', '╚██╗ ██╔╝', ' ╚████╔╝ ', '  ╚═══╝  '],
    I: ['██╗', '██║', '██║', '██║', '██║', '╚═╝'],
    B: ['██████╗ ', '██╔══██╗', '██████╔╝', '██╔══██╗', '██████╔╝', '╚═════╝ '],
    E: ['███████╗', '██╔════╝', '█████╗  ', '██╔══╝  ', '███████╗', '╚══════╝'],
    D: ['██████╗ ', '██╔══██╗', '██║  ██║', '██║  ██║', '██████╔╝', '╚═════╝ '],
    S: ['███████╗', '██╔════╝', '███████╗', '╚════██║', '███████║', '╚══════╝'],
    K: ['██╗  ██╗', '██║ ██╔╝', '█████╔╝ ', '██╔═██╗ ', '██║  ██╗', '╚═╝  ╚═╝']
  }
  const banner = (word) => {
    const rows = ['', '', '', '', '', '']
    for (const ch of word) LETTERS[ch].forEach((r, i) => (rows[i] += r))
    return rows
  }

  function word() {
    const box = $('[data-word]')
    if (!box) return
    const canvas = $('canvas', box)
    const SKY = 7
    let lines = []
    let fs = 20
    let surface = []
    let left = 0
    let top = 0
    let drops = []
    let splashes = []
    const g = makeGrid(canvas, () => fs)

    function layout() {
      const w = box.getBoundingClientRect().width
      const one = banner('VIBEDESK')
      const two = [...banner('VIBE'), '', ...banner('DESK')]
      const wide = w >= 620
      lines = wide ? one : two
      const cols = Math.max(...lines.map((l) => l.length))
      fs = Math.max(6, Math.min(wide ? 26 : 18, (w * 0.92) / (cols * 0.6)))
      canvas.style.height = Math.round((lines.length + SKY + 1) * fs * 1.36) + 'px'
      g.resize()
      left = Math.floor((g.cols - cols) / 2)
      top = g.rows - lines.length - 1
      surface = new Array(g.cols).fill(g.rows)
      lines.forEach((l, y) => {
        for (let x = 0; x < l.length; x++) if (l[x] !== ' ' && surface[left + x] === g.rows) surface[left + x] = top + y
      })
      drops = []
      splashes = []
    }

    function paintWord() {
      g.clear()
      lines.forEach((l, y) => {
        for (let x = 0; x < l.length; x++) {
          const c = l[x]
          if (c === ' ') continue
          g.set(left + x, top + y, c, c === '█' ? C.ink : C.ink3, c === '█' ? 0.94 : 0.85)
        }
      })
    }

    function frame(t, dt) {
      const { cols } = g
      let want = cols * 0.55 * dt
      while (want > 0) {
        if (Math.random() < want) {
          const z = Math.random()
          drops.push({ x: Math.floor(Math.random() * cols), y: -1, v: 10 + z * 16, z })
        }
        want -= 1
      }
      paintWord()
      for (const s of splashes) {
        const age = t - s.t
        if (age > 0.32) {
          s.dead = true
          continue
        }
        const a = 0.8 * (1 - age / 0.32)
        if (age < 0.1) g.set(s.x, s.y, '.', C.ink, a)
        else {
          g.set(s.x - 1, s.y, '·', C.ink2, a)
          g.set(s.x + 1, s.y, '·', C.ink2, a)
        }
      }
      g.paint()
      const y0 = g.py(0)
      for (const d of drops) {
        if (d.dead) continue
        d.y += d.v * dt
        const stop = surface[d.x] - 1
        if (d.y >= stop) {
          d.dead = true
          if (surface[d.x] < g.rows) splashes.push({ x: d.x, y: stop, t })
          continue
        }
        g.blit(d.z > 0.55 ? '|' : ':', C.ink2, 0.2 + d.z * 0.45, g.px(d.x), y0 + d.y * g.ch)
      }
      if (drops.length > 300) {
        drops = drops.filter((d) => !d.dead)
        splashes = splashes.filter((s) => !s.dead)
      }
    }

    layout()
    if (RM) {
      paintWord()
      g.paint()
      onResize(box, () => {
        layout()
        paintWord()
        g.paint()
      })
      return
    }
    runner(box, frame, 30)
    onResize(box, layout)
  }

  // ---------- Nächstes Release: Countdown nur, wenn ein Termin angekündigt ist ----------
  function release() {
    const box = $('[data-next]')
    const line = $('[data-release]')
    if (!box || !line) return
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    fetch('next.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((n) => {
        $$('[data-next-version]').forEach((e) => (e.textContent = n.version))
        const at = new Date(n.date)
        if (!(at > Date.now())) return
        box.hidden = false
        line.hidden = true
        $('[data-next-date]', box).textContent = at.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
        $('[data-next-features]', box).innerHTML = (n.features || [])
          .slice(0, 6)
          .map((f) => `<li>${f.issue ? `<a href="https://github.com/fxd-gif/vibedesk/issues/${Number(f.issue)}">${esc(f.title)}</a>` : esc(f.title)}</li>`)
          .join('')
        const cell = (k) => $(`[data-cd="${k}"]`, box)
        const tick = () => {
          const left = Math.max(0, at - Date.now())
          if (!left) {
            box.hidden = true
            line.hidden = false
            clearInterval(iv)
            return
          }
          const s = Math.floor(left / 1000)
          cell('d').textContent = String(Math.floor(s / 86400)).padStart(2, '0')
          cell('h').textContent = String(Math.floor(s / 3600) % 24).padStart(2, '0')
          cell('m').textContent = String(Math.floor(s / 60) % 60).padStart(2, '0')
          cell('s').textContent = String(s % 60).padStart(2, '0')
        }
        const iv = setInterval(tick, 1000)
        tick()
        const pill = $('[data-next-pill]')
        if (pill) {
          const days = Math.floor((at - Date.now()) / 86400000)
          pill.textContent = days > 0 ? `VibeDesk ${n.version} in ${days} day${days === 1 ? '' : 's'}` : `VibeDesk ${n.version} lands today`
          pill.hidden = false
        }
        // die meistgewünschten Ideen – nur zeigen, wenn es welche gibt
        fetch('https://api.github.com/repos/fxd-gif/vibedesk/issues?labels=enhancement&state=open&per_page=100')
          .then((r) => (r.ok ? r.json() : Promise.reject()))
          .then((list) => {
            const votes = (i) => (i.reactions ? i.reactions['+1'] : 0)
            const items = list.filter((i) => !i.pull_request && votes(i) > 0).sort((a, b) => votes(b) - votes(a)).slice(0, 4)
            if (!items.length) return
            const ul = $('[data-next-wishes]', box)
            ul.innerHTML = items.map((i) => `<li><a href="${esc(i.html_url)}">${esc(i.title)}</a><span>${votes(i)} 👍</span></li>`).join('')
            ul.closest('[data-wishes]').hidden = false
          })
          .catch(() => {})
      })
      .catch(() => {})
  }

  // ---------- Neueste Version aus GitHub (bei Fehler bleibt der Text im HTML) ----------
  function latest() {
    if (!$$('[data-ver]').length) return
    fetch('https://api.github.com/repos/fxd-gif/vibedesk/releases/latest')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        if (!j || !j.tag_name) return
        const v = j.tag_name.replace(/^v/, '')
        $$('[data-ver]').forEach((x) => (x.textContent = v))
      })
      .catch(() => {})
  }

  story()
  board()
  memory()
  rain()
  word()
  release()
  latest()
})()

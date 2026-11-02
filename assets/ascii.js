// VibeDesk website – generative ASCII fields.
// One canvas per field, one pre-rendered glyph atlas, no DOM element per character.
// Runs at most ~30 fps, only while the field is on screen and the tab is visible.
// With prefers-reduced-motion every field renders one still frame and does not react.
;(() => {
  'use strict'
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches
  const FINE = matchMedia('(pointer: fine)').matches

  // ---------- Noise (3D value noise, quintic fade) ----------
  const P = new Uint8Array(512)
  {
    const p = Array.from({ length: 256 }, (_, i) => i)
    let s = 20261101
    for (let i = 255; i > 0; i--) {
      s = (s * 16807) % 2147483647
      const j = s % (i + 1)
      ;[p[i], p[j]] = [p[j], p[i]]
    }
    for (let i = 0; i < 512; i++) P[i] = p[i & 255]
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10)
  const mix = (a, b, t) => a + (b - a) * t
  function noise(x, y, z) {
    const X = Math.floor(x)
    const Y = Math.floor(y)
    const Z = Math.floor(z)
    const u = fade(x - X)
    const v = fade(y - Y)
    const w = fade(z - Z)
    const xi = X & 255
    const yi = Y & 255
    const zi = Z & 255
    const a = P[xi] + yi
    const aa = P[a] + zi
    const ab = P[a + 1] + zi
    const b = P[xi + 1] + yi
    const ba = P[b] + zi
    const bb = P[b + 1] + zi
    return (
      mix(
        mix(mix(P[aa], P[ba], u), mix(P[ab], P[bb], u), v),
        mix(mix(P[aa + 1], P[ba + 1], u), mix(P[ab + 1], P[bb + 1], u), v),
        w
      ) / 255
    )
  }
  const fbm = (x, y, z) => (noise(x, y, z) * 0.57 + noise(x * 2.03, y * 2.03, z * 1.7) * 0.29 + noise(x * 4.1, y * 4.1, z * 2.3) * 0.14)
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
  const smooth = (e0, e1, x) => {
    const t = clamp((x - e0) / (e1 - e0))
    return t * t * (3 - 2 * t)
  }
  const hash = (i) => {
    let x = (i ^ 61) ^ (i >>> 16)
    x = (x + (x << 3)) | 0
    x ^= x >>> 4
    x = Math.imul(x, 0x27d4eb2d)
    x ^= x >>> 15
    return (x >>> 0) / 4294967295
  }

  // ---------- Glyphs ----------
  // Density ramp: index 0 is empty. Rain and water use their own glyphs.
  const RAMP = ' .·:;!/?*%$&8#@'
  const EXTRA = "|'`,~_-01"
  const CHARS = [...new Set((RAMP + EXTRA).split(''))]
  const CI = Object.fromEntries(CHARS.map((c, i) => [c, i]))
  const RAMP_I = RAMP.split('').map((c) => CI[c])
  const LEVELS = 12
  const INK = '#e9e8e3'
  const ACCENT = '#a9bdd8'
  const FONT = '"JetBrains Mono", ui-monospace, Consolas, monospace'

  const fontReady = (document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load(`400 13px ${FONT}`), document.fonts.load('700 40px Geist')])
    : Promise.resolve()
  ).catch(() => {})

  // ---------- Scenes ----------
  // Each scene: setup(f) once per resize, sample(u, v, t, f) -> brightness 0..1 (u/v are 0..1 of the canvas).
  const scenes = {
    // Startseite: eine Regenwolke, aus der Zeichen-Regen fällt.
    cloud: {
      rain: { rate: 0.045, from: 'cloud', speed: [12, 18] },
      gamma: 2.1,
      holes: 0.3,
      jitter: 0.2,
      setup(f) {
        const A = f.W / f.H
        const wide = A > 1.15
        // rechts neben der Headline; auf schmalen Bildschirmen oben über dem Text
        f.cx = wide ? Math.min(0.76, 0.5 + 0.38 / A) : 0.55
        f.cy = wide ? 0.4 : 0.2
        f.sc = wide ? Math.min(0.7, 0.52 + 0.12 * (A - 1)) : 0.4
        f.rainMul = wide ? 1 : 0.45
        // Blobs relativ zur Höhe (rund statt verzerrt)
        f.blobs = [
          [-0.18, 0.04, 0.17],
          [-0.04, -0.07, 0.23],
          [0.15, -0.03, 0.21],
          [0.32, 0.05, 0.15],
          [0.05, 0.07, 0.2],
          [0.45, 0.11, 0.1],
          // Quellwolken-Kuppen
          [-0.02, -0.17, 0.13],
          [0.19, -0.15, 0.12],
          [-0.15, -0.09, 0.11]
        ]
      },
      // einmal pro Frame: Lage der Wolkenteile und ein Rahmen, außerhalb dessen nichts zu rechnen ist
      frame(t, f) {
        const A = f.W / f.H
        const cy = f.cy - f.scroll * 0.1
        const k = f.blobs.length
        if (!f.bl || f.bl.length !== k * 4) f.bl = new Float32Array(k * 4)
        let x0 = 1e9
        let x1 = -1e9
        let y0 = 1e9
        for (let i = 0; i < k; i++) {
          const b = f.blobs[i]
          const r = b[2] * f.sc
          const bx = f.cx * A + b[0] * f.sc + Math.sin(t * 0.07 + i * 1.7) * 0.02
          const by = cy + b[1] * f.sc + Math.cos(t * 0.09 + i) * 0.012
          f.bl[i * 4] = bx
          f.bl[i * 4 + 1] = by
          f.bl[i * 4 + 2] = 1 / (r * 1.25)
          f.bl[i * 4 + 3] = 1 / r
          x0 = Math.min(x0, bx - r * 2.6)
          x1 = Math.max(x1, bx + r * 2.6)
          y0 = Math.min(y0, by - r * 2.2)
        }
        f.box = [x0, x1, y0, cy + 0.13 * f.sc + 0.05]
        f.ccy = cy
      },
      sample(u, v, t, f) {
        const A = f.W / f.H
        const x = u * A
        const bx = f.box
        if (x < bx[0] || x > bx[1] || v < bx[2] || v > bx[3]) return f.dust(u, v, t)
        const s = f.scroll
        const cy = f.ccy
        const bl = f.bl
        let m = 0
        for (let i = 0; i < bl.length; i += 4) {
          const dx = (x - bl[i]) * bl[i + 2]
          const dy = (v - bl[i + 1]) * bl[i + 3]
          const q = dx * dx + dy * dy
          if (q < 9) m += Math.exp(-q * 1.5)
        }
        if (m < 0.05) return f.dust(u, v, t)
        m = Math.min(m, 1.15)
        // flache Unterseite wie bei einer echten Wolke
        const base = cy + 0.13 * f.sc + Math.sin(x * 2.6 + t * 0.15) * 0.012
        const flat = smooth(base + 0.03, base - 0.06, v)
        if (flat <= 0) return f.dust(u, v, t)
        const n = fbm(x * 2.7 + t * 0.03, v * 3.4 - t * 0.012, t * 0.035)
        const fine = noise(x * 9 - t * 0.05, v * 13, t * 0.08)
        const d = (m * 0.95 - 0.5 + (n - 0.5) * 1.5 + (fine - 0.5) * 0.32 - s * 0.25) * flat
        if (d <= 0) return f.dust(u, v, t)
        // Licht von oben: oben hell, zur Unterseite dunkler
        const light = 0.95 - 0.4 * smooth(cy - 0.22 * f.sc, base, v)
        return clamp(d * 1.3) * light
      }
    },
    // Unterseiten: Höhenlinien einer ruhigen Landschaft, rechts betont.
    contour: {
      rain: { rate: 0.012, from: 'right', speed: [10, 16] },
      setup(f) {
        f.wide = f.W > 760
      },
      sample(u, v, t, f) {
        const A = f.W / f.H
        const band = f.wide ? smooth(0.44, 0.86, u) : 0.4 * smooth(0.55, 1, u)
        if (band < 0.02) return 0
        const vf = smooth(0, 0.22, v) * smooth(1.02, 0.7, v)
        const n = fbm(u * A * 1.25 + t * 0.012, v * 1.9 - f.scroll * 0.4, t * 0.018 + f.seed)
        const k = n * 9
        const line = 1 - smooth(0, 0.11, Math.abs(k - Math.round(k)))
        const height = smooth(0.45, 0.8, n)
        return clamp((line * (0.55 + height * 0.6) + height * 0.12) * band * vf)
      }
    },
    // Ambience: Regen über einer Wasserfläche.
    rain: {
      rain: { rate: 0.05, from: 'top', speed: [16, 26] },
      setup() {},
      sample(u, v, t, f) {
        const water = 0.84
        if (v < water) return 0
        const w = fbm(u * 9 + t * 0.12, v * 18, t * 0.3)
        const depth = smooth(water, 1, v)
        const k = w * 5
        const line = 1 - smooth(0, 0.2, Math.abs(k - Math.round(k)))
        return clamp(line * (0.18 + depth * 0.3))
      },
      glyphAt(b, u, v) {
        return v > 0.84 ? (b > 0.28 ? CI['~'] : CI['-']) : -1
      }
    },
    // Schluss: das Wort VibeDesk aus Zeichen.
    word: {
      gamma: 1.35,
      jitter: 0.14,
      setup(f) {
        const cols = f.cols
        const rows = f.rows
        const off = document.createElement('canvas')
        off.width = cols
        off.height = rows
        const o = off.getContext('2d')
        const text = f.el.dataset.word || 'VibeDesk'
        // Zellen sind höher als breit: im Zellraster horizontal strecken, damit das Wort auf dem Bildschirm normal aussieht
        const aspect = f.ch / f.cw
        let size = rows * 0.8
        o.font = `700 ${size}px Geist, system-ui, sans-serif`
        const tw = o.measureText(text).width * aspect
        if (tw > cols * 0.86) size *= (cols * 0.86) / tw
        o.font = `700 ${size}px Geist, system-ui, sans-serif`
        o.textBaseline = 'middle'
        o.textAlign = 'center'
        o.setTransform(aspect, 0, 0, 1, cols / 2, 0)
        o.fillStyle = '#fff'
        o.fillText(text, 0, rows * 0.54)
        const data = o.getImageData(0, 0, cols, rows).data
        f.mask = new Float32Array(cols * rows)
        for (let i = 0; i < cols * rows; i++) f.mask[i] = data[i * 4 + 3] / 255
      },
      sample(u, v, t, f) {
        const x = Math.min(f.cols - 1, Math.max(0, Math.floor(u * f.cols)))
        const y = Math.min(f.rows - 1, Math.max(0, Math.floor(v * f.rows)))
        const m = f.mask[y * f.cols + x]
        if (m < 0.05) return f.dust(u, v, t) * 0.7
        const n = fbm(u * 7 + t * 0.04, v * 3.6, t * 0.05)
        // Kanten der Buchstaben heller, innen ruhiger – so bleibt das Wort lesbar
        const edge = 1 - Math.abs(m - 0.5) * 2
        return clamp(m * (0.5 + n * 0.45) + edge * 0.12)
      }
    }
  }

  // ---------- Field ----------
  function mount(el) {
    const scene = scenes[el.dataset.scene] || scenes.contour
    const ctx = el.getContext('2d')
    const f = {
      el,
      W: 0,
      H: 0,
      cw: 9,
      ch: 15,
      cols: 0,
      rows: 0,
      scroll: 0,
      seed: Number(el.dataset.seed || 0),
      density: 1,
      dust(u, v, t) {
        // vereinzelte Punkte als Atmosphäre, fast unsichtbar
        const i = (Math.floor(u * 997) * 131 + Math.floor(v * 613) * 7) | 0
        const hsh = hash(i)
        if (hsh > 0.012) return 0
        return 0.06 + 0.1 * (0.5 + 0.5 * Math.sin(t * 0.8 + hsh * 900))
      }
    }
    let dpr = 1
    let acw = 9
    let ach = 15
    let atlas = null
    let val = new Float32Array(0)
    let tint = new Float32Array(0)
    let over = new Int16Array(0)
    let reveal = new Float32Array(0)
    // Grundfeld ohne Cursor-Effekte; pro Frame wird nur ein Teil der Zeilen neu berechnet
    let base = new Float32Array(0)
    let baseFull = true
    let frameNo = 0
    let started = 0
    let visible = false
    let raf = 0
    let last = 0
    const drops = []
    const splashes = []
    const ripples = []
    const ptr = { x: -9999, y: -9999, e: 0, inside: false, lx: 0, ly: 0, lt: 0 }

    function buildAtlas() {
      atlas = document.createElement('canvas')
      atlas.width = CHARS.length * acw
      atlas.height = LEVELS * 2 * ach
      const a = atlas.getContext('2d')
      a.textBaseline = 'middle'
      a.textAlign = 'center'
      a.font = `400 ${Math.round(f.ch * 0.74 * dpr)}px ${FONT}`
      for (let c = 0; c < 2; c++) {
        a.fillStyle = c ? ACCENT : INK
        for (let l = 0; l < LEVELS; l++) {
          a.globalAlpha = Math.pow((l + 1) / LEVELS, 1.25)
          for (let i = 0; i < CHARS.length; i++) {
            // jedes Zeichen auf seine Zelle beschneiden, sonst blutet es in die Nachbarn
            const x0 = i * acw
            const y0 = (c * LEVELS + l) * ach
            a.save()
            a.beginPath()
            a.rect(x0, y0, acw, ach)
            a.clip()
            a.fillText(CHARS[i], x0 + acw / 2, y0 + ach / 2 + 0.5)
            a.restore()
          }
        }
      }
    }

    function resize() {
      const r = el.getBoundingClientRect()
      if (!r.width || !r.height) return false
      dpr = Math.min(devicePixelRatio || 1, 2)
      const small = r.width < 640
      // feste Zellgrößen (z. B. das Wort) auf kleinen Bildschirmen feiner rastern
      const k = small ? 0.62 : 1
      f.cw = Number(el.dataset.cw) * k || (small ? 7.5 : 9)
      f.ch = Number(el.dataset.ch) * k || (small ? 12.5 : 15)
      acw = Math.max(4, Math.round(f.cw * dpr))
      ach = Math.max(6, Math.round(f.ch * dpr))
      f.cw = acw / dpr
      f.ch = ach / dpr
      f.W = r.width
      f.H = r.height
      el.width = Math.ceil(r.width * dpr)
      el.height = Math.ceil(r.height * dpr)
      f.cols = Math.ceil(el.width / acw)
      f.rows = Math.ceil(el.height / ach)
      const n = f.cols * f.rows
      val = new Float32Array(n)
      tint = new Float32Array(n)
      over = new Int16Array(n)
      reveal = new Float32Array(n)
      base = new Float32Array(n)
      baseFull = true
      const sweep = el.dataset.reveal === 'center'
      for (let i = 0; i < n; i++) {
        const x = (i % f.cols) / f.cols
        const y = Math.floor(i / f.cols) / f.rows
        const lead = sweep ? Math.hypot(x - 0.5, y - 0.5) * 1.1 : x * 0.55 + y * 0.25
        reveal[i] = 0.15 + lead * 0.9 + hash(i * 7 + 3) * 0.7
      }
      drops.length = 0
      scene.setup(f)
      buildAtlas()
      return true
    }

    // ---------- Rain ----------
    function spawnDrop(t, anywhere) {
      const cfg = scene.rain
      let x
      let y
      if (cfg.from === 'cloud') {
        // unter der Wolke starten, dort wo sie dicht ist
        for (let k = 0; k < 6; k++) {
          const cx = Math.floor(Math.random() * f.cols)
          const cyRow = Math.floor((f.cy - f.scroll * 0.1 + 0.1 * f.sc) * f.rows)
          const i = Math.max(0, Math.min(f.rows - 1, cyRow)) * f.cols + cx
          if (val[i] > 0.12 || k === 5) {
            x = cx
            y = cyRow + 1
            break
          }
        }
        if (anywhere) y += Math.random() * Math.max(1, ground() - y)
      } else {
        // Unterseiten: Regen nur rechts, nie über der Headline
        const lo = cfg.from === 'right' ? (f.wide ? 0.5 : 0.7) : 0
        x = Math.floor((lo + Math.random() * (1 - lo)) * f.cols)
        y = anywhere ? Math.random() * f.rows : -Math.random() * 4
      }
      const sp = cfg.speed
      drops.push({ x, y, v: sp[0] + Math.random() * (sp[1] - sp[0]), len: 2 + Math.floor(Math.random() * 3), a: 0.35 + Math.random() * 0.35, born: t })
    }
    function ground() {
      if (scene === scenes.rain) return Math.floor(f.rows * 0.84)
      if (scene === scenes.cloud) return Math.floor(f.rows * (Number(f.el.dataset.ground) || 0.94))
      return f.rows
    }

    function step(dt, t) {
      const { cols, rows, cw, ch } = f
      const n = cols * rows
      const R = Math.min(170, Math.max(90, f.W * 0.11))
      const R2 = R * R
      const e = ptr.e
      const age = t - started
      const intro = !RM && age < 3.2
      // Ripples altern lassen
      for (let k = ripples.length - 1; k >= 0; k--) if (t - ripples[k].t0 > 1.6) ripples.splice(k, 1)
      const rp = ripples.length
      // Grundfeld: die Szene bewegt sich langsam, darum reicht jede 2. bzw. 3. Zeile pro Frame
      if (scene.frame) scene.frame(t, f)
      const K = baseFull ? 1 : n > 9000 ? 3 : 2
      const ph = frameNo++ % K
      const iw = 1 / f.W
      const ih = 1 / f.H
      for (let y = ph; y < rows; y += K) {
        const v = (y + 0.5) * ch * ih
        const o = y * cols
        for (let x = 0; x < cols; x++) base[o + x] = scene.sample((x + 0.5) * cw * iw, v, t, f)
      }
      baseFull = false
      for (let i = 0; i < n; i++) {
        const cx = i % cols
        const cy = (i - cx) / cols
        const px = (cx + 0.5) * cw
        const py = (cy + 0.5) * ch
        let qx = px
        let qy = py
        let glow = 0
        let lens = 0
        if (e > 0.01) {
          const dx = px - ptr.x
          const dy = py - ptr.y
          const d2 = dx * dx + dy * dy
          if (d2 < R2) {
            const d = Math.sqrt(d2)
            let k = 1 - d / R
            k = k * k * e
            lens = k
            // Linse: der Inhalt weicht nach außen aus
            qx = ptr.x + dx * (1 - 0.5 * k)
            qy = ptr.y + dy * (1 - 0.5 * k)
            const rr = (d - R * 0.62) / (R * 0.16)
            glow = Math.exp(-rr * rr) * e
          }
        }
        let wave = 0
        for (let k = 0; k < rp; k++) {
          const r = ripples[k]
          const a = (t - r.t0) / 1.6
          const dx = px - r.x
          const dy = py - r.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          const dd = Math.abs(dist - a * r.reach)
          if (dd < 34) {
            const w = Math.cos((dd / 34) * 1.5708) * (1 - a) * (1 - a) * r.amp
            wave += w
            qx += (dx / (dist + 1)) * w * 10
            qy += (dy / (dist + 1)) * w * 10
          }
        }
        let b
        if (qx === px && qy === py) b = base[i]
        else {
          // Linse und Wellen lesen das Grundfeld an der verschobenen Stelle
          const sx = Math.min(cols - 1, Math.max(0, Math.floor(qx / cw)))
          const sy = Math.min(rows - 1, Math.max(0, Math.floor(qy / ch)))
          b = base[sy * cols + sx]
        }
        b = b * (1 - lens * 0.3) + glow * 0.16 * (b > 0.03 ? 1 : 0.3) + wave * (b + 0.05) * 0.6
        if (intro) {
          const rv = reveal[i]
          if (age < rv) b = 0
          else if (age < rv + 0.16 && b > 0.02) {
            over[i] = RAMP_I[2 + Math.floor(Math.random() * (RAMP_I.length - 2))]
            b = Math.max(b, 0.4)
            val[i] = b
            tint[i] = 0.6
            continue
          }
        }
        val[i] = b
        tint[i] = glow + wave
        over[i] = scene.glyphAt ? scene.glyphAt(b, cx / cols, cy / rows) : -1
      }

      // Regen
      if (scene.rain && f.density > 0) {
        const g = ground()
        const want = scene.rain.rate * cols * f.density * (f.rainMul || 1) * (RM ? 0 : 1)
        let budget = want * dt
        while (budget > 0) {
          if (Math.random() < budget) spawnDrop(t, false)
          budget -= 1
        }
        for (let k = drops.length - 1; k >= 0; k--) {
          const d = drops[k]
          d.y += d.v * dt
          let head = Math.floor(d.y)
          // Schirm: Tropfen weichen dem Cursor seitlich aus
          if (ptr.inside) {
            const px = (d.x + 0.5) * cw
            const py = (head + 0.5) * ch
            const dx = px - ptr.x
            const dy = py - ptr.y
            if (dy < 8 && dy > -R * 0.8 && Math.abs(dx) < R * 0.42) d.x += dx >= 0 ? 1 : -1
          }
          if (d.x < 0 || d.x >= cols) {
            drops.splice(k, 1)
            continue
          }
          if (head >= g) {
            if (g < rows) splashes.push({ x: d.x, y: g - 1, t0: t })
            drops.splice(k, 1)
            continue
          }
          for (let j = 0; j < d.len + 1; j++) {
            const y = head - j
            if (y < 0 || y >= rows) continue
            const i = y * cols + d.x
            const a = d.a * (1 - j / (d.len + 1))
            if (a > val[i]) {
              val[i] = a
              over[i] = j === 0 ? CI['|'] : j === 1 ? CI[':'] : CI['.']
              tint[i] = Math.max(tint[i], 0.15)
            }
          }
        }
        for (let k = splashes.length - 1; k >= 0; k--) {
          const s = splashes[k]
          const a = (t - s.t0) / 0.35
          if (a >= 1) {
            splashes.splice(k, 1)
            continue
          }
          const put = (x, y, c, b) => {
            if (x < 0 || x >= cols || y < 0 || y >= rows) return
            const i = y * cols + x
            if (b > val[i]) {
              val[i] = b
              over[i] = CI[c]
            }
          }
          const b = 0.45 * (1 - a)
          if (a < 0.5) put(s.x, s.y, '.', b)
          else {
            put(s.x - 1, s.y, ',', b)
            put(s.x + 1, s.y, '`', b)
          }
        }
      }
    }

    function paint() {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, el.width, el.height)
      const { cols, rows } = f
      const n = cols * rows
      const top = RAMP_I.length - 1
      const gam = scene.gamma || 1
      const holes = scene.holes || 0
      const jit = scene.jitter || 0.08
      for (let i = 0; i < n; i++) {
        let b = val[i]
        if (b < 0.035) continue
        if (b > 1) b = 1
        let g = over[i]
        if (g < 0) {
          // feste Lücken geben dem Feld Struktur, im Kern weniger als am Rand
          if (holes && hash(i * 5 + 1) < holes * (1 - b * 0.7)) continue
          const j = Math.pow(b, gam) + (hash(i) - 0.5) * jit
          g = RAMP_I[1 + Math.min(top - 1, Math.max(0, Math.floor(j * top)))]
        }
        const lvl = Math.min(LEVELS - 1, Math.floor(b * LEVELS))
        const col = tint[i] > 0.32 ? 1 : 0
        const cx = i % cols
        const cy = (i - cx) / cols
        ctx.drawImage(atlas, g * acw, (col * LEVELS + lvl) * ach, acw, ach, cx * acw, cy * ach, acw, ach)
      }
    }

    // ---------- Loop ----------
    const tick = (now) => {
      raf = 0
      if (!visible || document.hidden) return
      raf = requestAnimationFrame(tick)
      if (now - last < 31) return
      const dt = Math.min(0.06, last ? (now - last) / 1000 : 0.033)
      last = now
      const t = now / 1000
      if (!started) started = t
      ptr.e *= Math.pow(0.5, dt / 1.1)
      if (el.dataset.scroll !== undefined) {
        const r = el.getBoundingClientRect()
        f.scroll = clamp(-r.top / Math.max(1, r.height))
      }
      step(dt, t)
      paint()
    }
    const start = () => {
      if (!raf && visible && !document.hidden) {
        last = 0
        raf = requestAnimationFrame(tick)
      }
    }
    function still() {
      // Standbild (reduzierte Bewegung): einmal fertig zeichnen
      started = -100
      const t = 40 + f.seed
      if (scene.rain) for (let k = 0; k < scene.rain.rate * f.cols * 1.2; k++) spawnDrop(t, true)
      step(0, t)
      paint()
    }

    // ---------- Pointer ----------
    function onMove(ev) {
      const r = el.getBoundingClientRect()
      const x = ev.clientX - r.left
      const y = ev.clientY - r.top
      const inside = x >= 0 && y >= 0 && x <= r.width && y <= r.height
      ptr.inside = inside
      if (!inside) return
      const dist = Math.hypot(x - ptr.lx, y - ptr.ly)
      ptr.x = x
      ptr.y = y
      ptr.e = Math.min(1, ptr.e + dist / 260)
      const now = performance.now() / 1000
      if (dist > 14 && now - ptr.lt > 0.12 && ripples.length < 5) {
        ripples.push({ x, y, t0: now, reach: 260 + Math.random() * 140, amp: Math.min(0.45, 0.12 + dist / 400) })
        ptr.lt = now
      }
      ptr.lx = x
      ptr.ly = y
      start()
    }

    const api = {
      setDensity(d) {
        f.density = d
        if (RM) {
          drops.length = 0
          still()
        }
      },
      pulse(x, y) {
        const r = el.getBoundingClientRect()
        ripples.push({ x: x == null ? r.width / 2 : x, y: y == null ? r.height / 2 : y, t0: performance.now() / 1000, reach: Math.max(r.width, r.height) * 0.7, amp: 0.5 })
        start()
      }
    }
    el.asciiField = api

    fontReady.then(() => {
      if (!resize()) {
        // noch unsichtbar (z. B. display:none) – beim nächsten Resize erneut
      }
      let rt
      addEventListener('resize', () => {
        clearTimeout(rt)
        rt = setTimeout(() => {
          if (resize()) (RM ? still() : null)
        }, 140)
      })
      if (RM) {
        still()
        return
      }
      if (FINE) addEventListener('pointermove', onMove, { passive: true })
      else
        el.closest('section, header, div')?.addEventListener(
          'pointerdown',
          (ev) => {
            onMove(ev)
            const r = el.getBoundingClientRect()
            api.pulse(ev.clientX - r.left, ev.clientY - r.top)
          },
          { passive: true }
        )
      const io = 'IntersectionObserver' in window ? new IntersectionObserver(([en]) => {
        visible = en.isIntersecting
        if (visible && !f.cols) resize()
        start()
      }, { rootMargin: '60px' }) : null
      if (io) io.observe(el)
      else {
        visible = true
        start()
      }
      document.addEventListener('visibilitychange', start)
    })
    return api
  }

  // ---------- Scramble wipe (used when the showcase switches views) ----------
  function wipe(el, ms = 620) {
    if (RM || !el) return
    const ctx = el.getContext('2d')
    const r = el.getBoundingClientRect()
    const dpr = Math.min(devicePixelRatio || 1, 2)
    el.width = Math.ceil(r.width * dpr)
    el.height = Math.ceil(r.height * dpr)
    const cw = Math.round(9 * dpr)
    const ch = Math.round(15 * dpr)
    const cols = Math.ceil(el.width / cw)
    const rows = Math.ceil(el.height / ch)
    const band = Math.max(6, Math.round(cols * 0.14))
    ctx.font = `400 ${Math.round(12 * dpr)}px ${FONT}`
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'center'
    const t0 = performance.now()
    if (el._raf) cancelAnimationFrame(el._raf)
    const frame = (now) => {
      const p = Math.min(1, (now - t0) / ms)
      const e = 1 - Math.pow(1 - p, 3)
      const front = Math.floor(e * (cols + band * 2)) - band
      ctx.clearRect(0, 0, el.width, el.height)
      ctx.fillStyle = '#0d0f13'
      const solid = Math.max(0, front + band)
      ctx.fillRect(solid * cw, 0, el.width - solid * cw, el.height)
      for (let x = Math.max(0, front); x < Math.min(cols, front + band); x++) {
        const k = 1 - (x - front) / band
        for (let y = 0; y < rows; y++) {
          if (Math.random() > 0.55 + k * 0.35) continue
          ctx.fillStyle = '#0d0f13'
          ctx.globalAlpha = 0.6 + (1 - k) * 0.4
          ctx.fillRect(x * cw, y * ch, cw, ch)
          ctx.globalAlpha = 0.25 + k * 0.6
          ctx.fillStyle = Math.random() < 0.18 ? ACCENT : INK
          ctx.fillText(RAMP[2 + Math.floor(Math.random() * (RAMP.length - 2))], x * cw + cw / 2, y * ch + ch / 2)
        }
      }
      ctx.globalAlpha = 1
      if (p < 1) el._raf = requestAnimationFrame(frame)
      else ctx.clearRect(0, 0, el.width, el.height)
    }
    el._raf = requestAnimationFrame(frame)
  }

  window.VDAscii = { mount, wipe }
  document.querySelectorAll('canvas.ascii[data-scene]').forEach(mount)
})()

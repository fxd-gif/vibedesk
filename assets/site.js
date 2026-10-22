// VibeDesk website – shared behaviour and live demos.
// Every demo only runs while it is on screen and respects prefers-reduced-motion.
;(() => {
  'use strict'
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches
  const $ = (s, el = document) => el.querySelector(s)
  const $$ = (s, el = document) => [...el.querySelectorAll(s)]
  const h = (tag, cls, html) => {
    const e = document.createElement(tag)
    if (cls) e.className = cls
    if (html != null) e.innerHTML = html
    return e
  }
  const SVGNS = 'http://www.w3.org/2000/svg'
  const s = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(SVGNS, tag)
    for (const k in attrs) e.setAttribute(k, attrs[k])
    if (parent) parent.appendChild(e)
    return e
  }
  const rand = (a, b) => a + Math.random() * (b - a)
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

  // ---------- Nav ----------
  const nav = $('.nav')
  if (nav) {
    const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8)
    addEventListener('scroll', onScroll, { passive: true })
    onScroll()
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

  // ---------- Latest release (hidden on error) ----------
  const latest = $('#latest')
  if (latest) {
    fetch('https://api.github.com/repos/fxd-gif/vibedesk/releases/latest')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => {
        if (!j || !j.tag_name) return
        $('#latest-v').textContent = j.tag_name
        if (j.html_url) $('#latest-link').href = j.html_url
        latest.hidden = false
      })
      .catch(() => {})
  }

  // ---------- YouTube erst nach Klick laden (youtube-nocookie, kein Tracking vorher) ----------
  for (const box of document.querySelectorAll('[data-yt]')) {
    const btn = box.querySelector('.yt-play')
    btn.addEventListener('click', () => {
      const f = document.createElement('iframe')
      f.src = `https://www.youtube-nocookie.com/embed/${box.dataset.yt}?autoplay=1&rel=0`
      f.title = btn.getAttribute('aria-label') || 'YouTube video'
      f.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen'
      f.allowFullscreen = true
      btn.replaceWith(f)
    })
  }

  // ---------- Next release: countdown, planned features, most wanted wishes ----------
  const nextCount = $('[data-next-count]')
  if (nextCount) {
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    const issueUrl = (n) => 'https://github.com/fxd-gif/vibedesk/issues/' + n
    fetch('next.json')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((n) => {
        const at = new Date(n.date)
        $('[data-next-version]').textContent = n.version
        $('[data-next-date]').textContent = at.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' })
        $('[data-next-features]').innerHTML = n.features
          .map((f) => `<li>${f.issue ? `<a href="${issueUrl(f.issue)}"><b>${esc(f.title)}</b></a>` : `<b>${esc(f.title)}</b>`}<small>${esc(f.text)}</small></li>`)
          .join('')
        const cell = (k) => nextCount.querySelector(`[data-cd="${k}"]`)
        const tick = () => {
          const left = Math.max(0, at - Date.now())
          const s = Math.floor(left / 1000)
          cell('d').textContent = Math.floor(s / 86400)
          cell('h').textContent = String(Math.floor(s / 3600) % 24).padStart(2, '0')
          cell('m').textContent = String(Math.floor(s / 60) % 60).padStart(2, '0')
          cell('s').textContent = String(s % 60).padStart(2, '0')
        }
        tick()
        setInterval(tick, 1000)
        const pill = $('[data-next-pill]')
        const days = Math.floor((at - Date.now()) / 86400000)
        if (pill && at > Date.now()) {
          pill.textContent = days > 0 ? `VibeDesk ${n.version} in ${days} day${days === 1 ? "" : "s"} →` : `VibeDesk ${n.version} lands today →`
          pill.hidden = false
        }
      })
      .catch(() => {})
    // Offene Wünsche, sortiert nach 👍. Bewusst die Issues-API statt der Suche: die Suche indiziert neue Issues erst verzögert.
    fetch('https://api.github.com/repos/fxd-gif/vibedesk/issues?labels=enhancement&state=open&per_page=100')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((list) => {
        const votes = (i) => (i.reactions ? i.reactions['+1'] : 0)
        const items = list.filter((i) => !i.pull_request).sort((a, b) => votes(b) - votes(a) || a.number - b.number).slice(0, 6)
        if (!items.length) return
        $('[data-next-wishes]').innerHTML = items
          .map((i) => {
            const planned = i.labels.some((l) => l.name === 'planned')
            return `<li><a href="${esc(i.html_url)}"><span class="nx-votes">👍 ${votes(i)}</span><b>${esc(i.title)}</b></a>${planned ? '<small class="nx-planned">planned for the next release</small>' : ''}</li>`
          })
          .join('')
      })
      .catch(() => {})
  }

  // ---------- Visibility helpers ----------
  /** Calls cb(true|false) when the element enters/leaves the viewport */
  function watch(el, cb, margin = '80px') {
    if (!('IntersectionObserver' in window)) return cb(true)
    new IntersectionObserver(([e]) => cb(e.isIntersecting), { rootMargin: margin }).observe(el)
  }
  /** Sequenced demo: time only passes while visible and the tab is active */
  function sequence(el, run, still) {
    if (RM) return still && still()
    let visible = false
    let started = false
    const ctx = {
      wait: (ms) =>
        new Promise((res) => {
          let left = ms
          const step = () => {
            if (visible && !document.hidden) left -= 50
            if (left <= 0) res()
            else setTimeout(step, 50)
          }
          setTimeout(step, 50)
        })
    }
    watch(el, (v) => {
      visible = v
      if (v && !started) {
        started = true
        ;(async () => {
          for (;;) await run(ctx)
        })()
      }
    })
  }
  /** Frame loop at most ~fps, only while visible */
  function frames(el, draw, fps = 60) {
    let visible = false
    let last = 0
    let raf = 0
    const min = 1000 / fps - 2
    const tick = (t) => {
      raf = 0
      if (!visible || document.hidden) return
      raf = requestAnimationFrame(tick)
      if (t - last < min) return
      const dt = Math.min(50, last ? t - last : 16)
      last = t
      draw(dt, t)
    }
    const start = () => {
      if (!raf) {
        last = 0
        raf = requestAnimationFrame(tick)
      }
    }
    watch(el, (v) => {
      visible = v
      if (v) start()
    })
    document.addEventListener('visibilitychange', () => !document.hidden && visible && start())
  }
  /** Position a fake cursor over a target inside a container */
  function moveCursor(cur, box, target, dx = 0.6, dy = 0.55) {
    const b = box.getBoundingClientRect()
    const r = target.getBoundingClientRect()
    cur.style.transform = `translate(${r.left - b.left + r.width * dx}px, ${r.top - b.top + r.height * dy}px)`
    cur.classList.add('show')
  }
  const CURSOR = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 2.5v13.2l3.4-3.1 2.2 5 2.3-1-2.2-4.9 4.6-.3z" fill="#fff" stroke="#0b0d12" stroke-width="1.2" stroke-linejoin="round"/></svg>'
  function cursorIn(box) {
    const c = h('div', 'fcursor', CURSOR)
    box.appendChild(c)
    return c
  }
  async function click(ctx, cur, el) {
    cur.classList.add('down')
    el.classList.add('press')
    await ctx.wait(160)
    cur.classList.remove('down')
    el.classList.remove('press')
  }

  // ---------- Rain (any canvas.rain) ----------
  $$('canvas.rain').forEach((c) => {
    const ctx = c.getContext('2d')
    let w = 0
    let hgt = 0
    let drops = []
    let density = Number(c.dataset.density || 1)
    const make = () => {
      const n = Math.round(((w * hgt) / 16000) * density)
      drops = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * hgt, l: 10 + Math.random() * 22, v: 3 + Math.random() * 5, a: 0.04 + Math.random() * 0.1 }))
    }
    const resize = () => {
      const r = c.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      w = r.width
      hgt = r.height
      c.width = Math.max(1, w * dpr)
      c.height = Math.max(1, hgt * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      make()
      draw()
    }
    const draw = () => {
      ctx.clearRect(0, 0, w, hgt)
      ctx.lineWidth = 1
      for (const d of drops) {
        ctx.strokeStyle = `rgba(190, 205, 235, ${d.a})`
        ctx.beginPath()
        ctx.moveTo(d.x, d.y)
        ctx.lineTo(d.x - d.l * 0.08, d.y + d.l)
        ctx.stroke()
      }
    }
    c.setDensity = (v) => {
      density = v
      make()
      draw()
    }
    resize()
    let rt
    addEventListener('resize', () => {
      clearTimeout(rt)
      rt = setTimeout(resize, 120)
    })
    if (RM) return
    frames(
      c,
      () => {
        for (const d of drops) {
          d.y += d.v
          d.x -= d.v * 0.08
          if (d.y > hgt) {
            d.y = -d.l
            d.x = Math.random() * w
          }
        }
        draw()
      },
      30
    )
  })

  // ---------- Index: clickable approval card ----------
  const demo = $('#demo')
  if (demo) {
    const dot = $('#demo-dot')
    const hint = $('#demo-hint')
    demo.addEventListener('click', (e) => {
      const b = e.target.closest('button')
      if (!b) return
      const a = b.dataset.a
      $$('button', demo).forEach((x) => (x.disabled = true))
      if (a === 'deny') {
        dot.className = 'dot b'
        hint.textContent = 'Denied – Claude takes another route'
      } else {
        dot.className = 'dot g'
        demo.classList.add('ok')
        hint.textContent = a === 'always' ? 'Allowed and remembered – working again' : 'Allowed – working again'
      }
      setTimeout(() => {
        dot.className = 'dot y'
        demo.classList.remove('ok')
        $$('button', demo).forEach((x) => (x.disabled = false))
        hint.textContent = 'Try it – click Allow'
      }, 3200)
    })
  }

  // ---------- Fake terminal helper ----------
  /** lines: array of html strings. Returns {add(i), clear()} */
  function termWriter(el) {
    return {
      add(html) {
        const l = h('div', 'l', html || '&nbsp;')
        el.appendChild(l)
        // wie ein Terminal: oben fällt heraus, was nicht mehr passt
        while (el.children.length > 1 && el.scrollHeight > el.clientHeight + 2) el.firstChild.remove()
        requestAnimationFrame(() => l.classList.add('in'))
        return l
      },
      clear() {
        el.innerHTML = ''
      }
    }
  }
  const T = {
    head: (name) => `<span class="t-o">✻</span> <span class="t-b">Claude Code</span>  <span class="t-dim">~/Projects/${name}</span>`,
    you: (t) => `<span class="t-b">&gt;</span> ${t}`,
    tool: (tool, arg) => `<span class="t-g">●</span> ${tool}(<span class="t-b">${arg}</span>)`,
    sub: (html) => `<span class="t-dim">  ⎿ </span> ${html}`,
    plus: (code) => `<span class="t-g">   + ${code}</span>`,
    done: (t) => `<span class="t-o">✻</span> <span class="t-dim">${t}</span>`
  }

  // ---------- Sessions: desk demo ----------
  const desk = $('[data-demo="desk"]')
  if (desk) {
    const term = termWriter($('.term', desk))
    const card = $('.approve', desk)
    const allow = $('[data-a="allow"]', card)
    const rows = { sf: $('[data-s="sf"]', desk), as: $('[data-s="as"]', desk), bl: $('[data-s="bl"]', desk) }
    const title = $('.win-dot', desk)
    const titleSt = $('.win-st', desk)
    const next = $('.queue', desk)
    const toast = $('.toast', desk)
    const cur = cursorIn(desk)
    const set = (row, cls, txt) => {
      $('.dot', row).className = 'dot ' + cls
      $('.st', row).textContent = txt
    }
    const setTitle = (cls, txt) => {
      title.className = 'dot win-dot ' + cls
      titleSt.textContent = '· ' + txt
    }
    const still = () => {
      ;[T.head('shop-frontend'), '', T.you('Build a login page with validation'), '', T.tool('Edit', 'src/pages/Login.tsx'), T.sub('<span class="t-g">+42</span> <span class="t-r">-3</span>'), T.tool('Bash', 'npm test')].forEach((l) => term.add(l).classList.add('in'))
      card.classList.add('in')
    }
    sequence(
      desk,
      async (ctx) => {
        term.clear()
        card.classList.remove('in', 'ok', 'out')
        $('.dot', card).className = 'dot y'
        toast.classList.remove('in')
        next.classList.remove('run')
        set(rows.sf, 'g', 'working')
        set(rows.as, 'g', 'working')
        set(rows.bl, 'b', 'done')
        setTitle('g', 'working')
        cur.classList.remove('show')
        const lines = [T.head('shop-frontend'), '', T.you('Build a login page with validation'), '', T.tool('Read', 'src/App.tsx'), T.tool('Edit', 'src/pages/Login.tsx'), T.sub('<span class="t-g">+42</span> <span class="t-r">-3</span>'), T.plus("const [email, setEmail] = useState('')")]
        for (const l of lines) {
          term.add(l)
          await ctx.wait(l ? 380 : 120)
        }
        term.add(T.tool('Bash', 'npm test'))
        await ctx.wait(500)
        // Claude asks
        set(rows.sf, 'y', 'waiting for you')
        setTitle('y', 'waiting for you')
        card.classList.add('in')
        await ctx.wait(1500)
        moveCursor(cur, desk, allow)
        await ctx.wait(900)
        await click(ctx, cur, allow)
        card.classList.add('ok')
        $('.dot', card).className = 'dot g'
        set(rows.sf, 'g', 'working')
        setTitle('g', 'working')
        await ctx.wait(600)
        card.classList.add('out')
        cur.classList.remove('show')
        term.add(T.sub('<span class="t-g">✓ 24 tests passed</span> <span class="t-dim">(1.8s)</span>'))
        await ctx.wait(700)
        set(rows.as, 'b', 'done')
        await ctx.wait(500)
        term.add('')
        term.add(T.done('Done – the login page is in place.'))
        set(rows.sf, 'b', 'done')
        setTitle('b', 'done')
        toast.classList.add('in')
        await ctx.wait(1300)
        // queue kicks in
        next.classList.add('run')
        await ctx.wait(900)
        toast.classList.remove('in')
        term.add('')
        term.add(T.you('Add an E2E test for the login flow'))
        set(rows.sf, 'g', 'working')
        setTitle('g', 'working')
        await ctx.wait(3200)
      },
      still
    )
  }

  // ---------- Sessions: limit chip countdown ----------
  const limit = $('[data-demo="limit"]')
  if (limit) {
    const chip = $('.pill.warn', limit)
    const line = $('.resume', limit)
    const clock = $('.clock', limit)
    sequence(
      limit,
      async (ctx) => {
        line.classList.remove('in')
        chip.classList.remove('gone')
        let sec = 6
        for (; sec > 0; sec--) {
          clock.textContent = `23:59:${String(60 - sec).padStart(2, '0')}`
          await ctx.wait(800)
        }
        clock.textContent = '00:00:00'
        chip.classList.add('gone')
        line.classList.add('in')
        await ctx.wait(3500)
      },
      () => line.classList.add('in')
    )
  }

  // ---------- Sessions: watchdog ----------
  const dog = $('[data-demo="watchdog"]')
  if (dog) {
    const items = $$('.toast', dog)
    sequence(
      dog,
      async (ctx) => {
        for (const t of items) {
          items.forEach((x) => x.classList.remove('in'))
          await ctx.wait(300)
          t.classList.add('in')
          await ctx.wait(2800)
        }
      },
      () => items[0].classList.add('in')
    )
  }

  // ---------- Phone: live companion ----------
  const ph = $('[data-demo="phone"]')
  if (ph) {
    const pc = termWriter($('.pc .term', ph))
    const mob = termWriter($('.sheet .term', ph))
    const phone = $('.phone', ph)
    const sheet = $('.sheet', ph)
    const acts = $('.acts', ph)
    const perm = $('.p-perm', ph)
    const permBtn = $('.p-allow', ph)
    const viewBtn = $('.p-view', ph)
    const sugg = $('.p-sugg', ph)
    const st = $('.p-state', ph)
    const dot = $('.p-dot', ph)
    const pcDot = $('.pc .win-dot', ph)
    const pcSt = $('.pc .win-st', ph)
    const tap = h('div', 'tap')
    $('.phone-screen', ph).appendChild(tap)
    const doTap = async (ctx, el) => {
      const b = $('.phone-screen', ph).getBoundingClientRect()
      const r = el.getBoundingClientRect()
      tap.style.left = r.left - b.left + r.width / 2 + 'px'
      tap.style.top = r.top - b.top + r.height / 2 + 'px'
      tap.classList.remove('go')
      void tap.offsetWidth
      tap.classList.add('go')
      el.classList.add('press')
      await ctx.wait(200)
      el.classList.remove('press')
    }
    const state = (cls, txt) => {
      dot.className = 'dot p-dot ' + cls
      st.textContent = txt
      pcDot.className = 'dot win-dot ' + cls
      pcSt.textContent = '· ' + txt
    }
    const act = (icon, verb, arg) => {
      const r = h('div', 'act', `<i class="spin"></i><b>${verb}</b><code>${arg}</code><span>just now</span>`)
      acts.prepend(r)
      while (acts.children.length > 3) acts.lastChild.remove()
      requestAnimationFrame(() => r.classList.add('in'))
      return r
    }
    const finish = (r, ok = true) => {
      const i = $('i', r)
      i.className = ok ? 'ok' : 'err'
      i.textContent = ok ? '✓' : '✗'
    }
    const both = (l) => {
      pc.add(l)
      mob.add(l)
    }
    const still = () => {
      ;[T.head('shop-frontend'), '', T.you('Build a login page'), '', T.tool('Edit', 'src/pages/Login.tsx'), T.sub('<span class="t-g">+42</span> <span class="t-r">-3</span>')].forEach((l) => {
        pc.add(l).classList.add('in')
        mob.add(l).classList.add('in')
      })
      sheet.classList.add('open')
      state('g', 'working')
    }
    sequence(
      ph,
      async (ctx) => {
        pc.clear()
        mob.clear()
        acts.innerHTML = ''
        sheet.classList.remove('open')
        perm.classList.remove('in', 'ok')
        sugg.classList.remove('in')
        state('g', 'working')
        both(T.head('shop-frontend'))
        both('')
        both(T.you('Build a login page with validation'))
        both('')
        await ctx.wait(600)
        let a = act('r', 'Reads', 'src/App.tsx')
        both(T.tool('Read', 'src/App.tsx'))
        await ctx.wait(900)
        finish(a)
        a = act('e', 'Edits', 'src/pages/Login.tsx')
        both(T.tool('Edit', 'src/pages/Login.tsx'))
        await ctx.wait(500)
        both(T.sub('<span class="t-g">+42</span> <span class="t-r">-3</span>'))
        await ctx.wait(700)
        finish(a)
        // permission on the phone
        a = act('c', 'Command', 'npm test')
        both(T.tool('Bash', 'npm test'))
        state('y', 'waiting for you')
        perm.classList.add('in')
        phone.classList.remove('buzz')
        void phone.offsetWidth
        phone.classList.add('buzz')
        await ctx.wait(1600)
        await doTap(ctx, permBtn)
        perm.classList.add('ok')
        state('g', 'working')
        await ctx.wait(900)
        perm.classList.remove('in')
        await ctx.wait(400)
        // open the whole terminal
        await doTap(ctx, viewBtn)
        sheet.classList.add('open')
        await ctx.wait(700)
        mob.add(T.sub('<span class="t-g">✓ 24 tests passed</span> <span class="t-dim">(1.8s)</span>'))
        pc.add(T.sub('<span class="t-g">✓ 24 tests passed</span> <span class="t-dim">(1.8s)</span>'))
        finish(a)
        await ctx.wait(800)
        both(T.tool('Bash', 'npm run dev'))
        await ctx.wait(500)
        both('<span class="t-g">  ➜</span>  Local:   <span class="t-c">http://localhost:<b>5173</b>/</span>')
        await ctx.wait(800)
        both('')
        both(T.done('Done – should I add an E2E test too?'))
        state('b', 'done')
        await ctx.wait(1600)
        sheet.classList.remove('open')
        await ctx.wait(500)
        sugg.classList.add('in')
        await ctx.wait(1400)
        const first = $('button', sugg)
        await doTap(ctx, first)
        await ctx.wait(500)
        sugg.classList.remove('in')
        state('g', 'working')
        both('')
        both(T.you('Add an E2E test for the login flow'))
        await ctx.wait(2400)
      },
      still
    )
  }

  // ---------- Brain: force graph ----------
  const TYPE = {
    area: '#a5b8ff',
    decision: '#c4b5fd',
    pitfall: '#f87171',
    convention: '#4ade80',
    task: '#facc15',
    fact: '#67e8f9',
    file: '#6b7280'
  }
  const STATE = { reading: '#67e8f9', editing: '#4ade80', learning: '#c4b5fd' }
  function brainGraph(canvas, data) {
    const ctx = canvas.getContext('2d')
    let W = 0
    let H = 0
    const nodes = data.nodes.map((n, i) => ({ ...n, i, x: 0, y: 0, vx: 0, vy: 0, glow: 0, state: null, born: 1, r: n.type === 'file' ? 3.2 : n.big ? 9 : 7, phase: Math.random() * 6.28 }))
    const byId = Object.fromEntries(nodes.map((n) => [n.id, n]))
    let edges = data.edges.map(([a, b]) => ({ a: byId[a], b: byId[b], dash: byId[a].type === 'file' || byId[b].type === 'file' }))
    const pulses = []
    const rings = []
    let hover = null
    let drag = null
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      const dpr = Math.min(devicePixelRatio || 1, 2)
      const first = !W
      const ow = W
      const oh = H
      W = r.width
      H = r.height
      canvas.width = W * dpr
      canvas.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (first) {
        nodes.forEach((n, i) => {
          const a = (i / nodes.length) * Math.PI * 2
          n.x = W / 2 + Math.cos(a) * W * 0.28 + rand(-20, 20)
          n.y = H / 2 + Math.sin(a) * H * 0.3 + rand(-20, 20)
        })
      } else
        nodes.forEach((n) => {
          n.x *= W / ow
          n.y *= H / oh
        })
    }
    const small = () => W < 560
    const step = (dt, t) => {
      const k = dt / 16
      const cx = W / 2
      const cy = H / 2
      const rest = Math.min(W, H) * (small() ? 0.2 : 0.22)
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          let dx = a.x - b.x
          let dy = a.y - b.y
          let d2 = dx * dx + dy * dy
          if (d2 < 1) d2 = 1
          const f = (small() ? 1000 : 2800) / d2
          const d = Math.sqrt(d2)
          dx /= d
          dy /= d
          a.vx += dx * f
          a.vy += dy * f
          b.vx -= dx * f
          b.vy -= dy * f
        }
      }
      for (const e of edges) {
        const dx = e.b.x - e.a.x
        const dy = e.b.y - e.a.y
        const d = Math.sqrt(dx * dx + dy * dy) || 1
        const want = e.dash ? rest * 0.55 : rest
        const f = (d - want) * 0.004
        e.a.vx += (dx / d) * f
        e.a.vy += (dy / d) * f
        e.b.vx -= (dx / d) * f
        e.b.vy -= (dy / d) * f
      }
      for (const n of nodes) {
        if (n === drag) continue
        // gentle drift, like the brain window
        n.vx += Math.cos(t / 1700 + n.phase) * 0.012 + (cx - n.x) * 0.0006
        n.vy += Math.sin(t / 2100 + n.phase) * 0.012 + (cy - n.y) * 0.0012
        n.vx *= 0.9
        n.vy *= 0.9
        n.x += n.vx * k
        n.y += n.vy * k
        const m = 30
        n.x = Math.max(m, Math.min(W - m, n.x))
        n.y = Math.max(small() ? 84 : 52, Math.min(H - (small() ? 64 : 48), n.y))
        n.glow = Math.max(0, n.glow - dt / 1800)
        if (n.born < 1) n.born = Math.min(1, n.born + dt / 600)
        if (n.glow <= 0) n.state = null
      }
      for (let i = pulses.length - 1; i >= 0; i--) {
        pulses[i].p += dt / pulses[i].dur
        if (pulses[i].p >= 1) {
          const p = pulses.splice(i, 1)[0]
          p.to.glow = Math.max(p.to.glow, 0.5)
          if (!p.to.state) p.to.state = p.state
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        rings[i].p += dt / 1400
        if (rings[i].p >= 1) rings.splice(i, 1)
      }
    }
    const near = (n) => hover && (n === hover || edges.some((e) => (e.a === hover && e.b === n) || (e.b === hover && e.a === n)))
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const e of edges) {
        const lit = hover && (e.a === hover || e.b === hover)
        const alpha = Math.min(e.a.born, e.b.born) * (lit ? 0.6 : hover ? 0.08 : 0.2)
        ctx.strokeStyle = `rgba(190,200,230,${alpha})`
        ctx.lineWidth = lit ? 1.4 : 1
        ctx.setLineDash(e.dash ? [3, 4] : [])
        ctx.beginPath()
        ctx.moveTo(e.a.x, e.a.y)
        ctx.lineTo(e.b.x, e.b.y)
        ctx.stroke()
      }
      ctx.setLineDash([])
      for (const p of pulses) {
        const x = p.from.x + (p.to.x - p.from.x) * p.p
        const y = p.from.y + (p.to.y - p.from.y) * p.p
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9)
        g.addColorStop(0, p.color)
        g.addColorStop(1, 'transparent')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, 9, 0, 7)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(x, y, 1.6, 0, 7)
        ctx.fill()
      }
      for (const r of rings) {
        ctx.strokeStyle = r.color
        ctx.globalAlpha = (1 - r.p) * 0.7
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(r.n.x, r.n.y, r.n.r + 4 + r.p * 26, 0, 7)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      const fs = small() ? 10.5 : 12
      ctx.font = `500 ${fs}px Geist, system-ui, sans-serif`
      ctx.textAlign = 'center'
      for (const n of nodes) {
        const dim = hover && !near(n) ? 0.3 : 1
        const r = n.r * (0.4 + 0.6 * n.born)
        if (n.glow > 0 && n.state) {
          const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 4)
          g.addColorStop(0, STATE[n.state] + '66')
          g.addColorStop(1, 'transparent')
          ctx.globalAlpha = n.glow
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(n.x, n.y, r * 4, 0, 7)
          ctx.fill()
          ctx.globalAlpha = 1
        }
        ctx.globalAlpha = dim * n.born
        ctx.fillStyle = TYPE[n.type]
        ctx.beginPath()
        ctx.arc(n.x, n.y, r, 0, 7)
        ctx.fill()
        if (n.glow > 0 && n.state) {
          ctx.strokeStyle = STATE[n.state]
          ctx.lineWidth = 2
          ctx.globalAlpha = dim * n.glow
          ctx.beginPath()
          ctx.arc(n.x, n.y, r + 3.5, 0, 7)
          ctx.stroke()
        }
        if (n.type !== 'file' || n === hover) {
          ctx.globalAlpha = dim * n.born * (n.type === 'file' ? 0.8 : 1)
          ctx.fillStyle = n.type === 'file' ? '#8b93a3' : '#dfe3ea'
          if (n.type === 'file') ctx.font = `400 ${fs - 1}px "JetBrains Mono", monospace`
          const half = ctx.measureText(n.label).width / 2 + 4
          ctx.fillText(n.label, Math.max(half, Math.min(W - half, n.x)), n.y + r + fs + 3)
          if (n.type === 'file') ctx.font = `500 ${fs}px Geist, system-ui, sans-serif`
        }
        ctx.globalAlpha = 1
      }
    }
    const neighbors = (n) => edges.filter((e) => e.a === n || e.b === n).map((e) => (e.a === n ? e.b : e.a))
    const activity = () => {
      const notes = nodes.filter((n) => n.type !== 'file')
      const st = pick(['reading', 'reading', 'editing', 'learning'])
      const n = st === 'editing' ? pick(nodes.filter((x) => x.type === 'file')) || pick(notes) : pick(notes)
      n.state = st
      n.glow = 1
      rings.push({ n, p: 0, color: STATE[st] })
      for (const m of neighbors(n)) pulses.push({ from: n, to: m, p: 0, dur: rand(700, 1300), color: STATE[st], state: st })
    }
    const learn = () => {
      if (!data.extra || !data.extra.length) return
      const notes = nodes.filter((n) => n.type !== 'file')
      const spec = data.extra.shift()
      data.extra.push(spec)
      const old = nodes.find((n) => n.id === spec.id)
      if (old) {
        // leave the graph again so it does not grow forever
        old.born = 0.999
        nodes.splice(nodes.indexOf(old), 1)
        edges = edges.filter((e) => e.a !== old && e.b !== old)
        return
      }
      const to = byId[spec.link] || pick(notes)
      const n = { ...spec, x: to.x + rand(-30, 30), y: to.y + rand(-30, 30), vx: 0, vy: 0, glow: 1, state: 'learning', born: 0, r: 7, phase: Math.random() * 6.28 }
      nodes.push(n)
      byId[n.id] = n
      edges.push({ a: n, b: to, dash: false })
      rings.push({ n, p: 0, color: STATE.learning })
      pulses.push({ from: n, to, p: 0, dur: 900, color: STATE.learning, state: 'learning' })
    }
    resize()
    let rt
    addEventListener('resize', () => {
      clearTimeout(rt)
      rt = setTimeout(resize, 120)
    })
    // settle before the first paint
    for (let i = 0; i < 260; i++) step(16, i * 16)
    draw()
    const pos = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const hit = (p) => nodes.find((n) => (n.x - p.x) ** 2 + (n.y - p.y) ** 2 < (n.r + 8) ** 2)
    canvas.addEventListener('pointermove', (e) => {
      const p = pos(e)
      if (drag) {
        drag.x = p.x
        drag.y = p.y
        drag.vx = drag.vy = 0
      }
      hover = drag || hit(p) || null
      canvas.style.cursor = hover ? 'grab' : ''
      if (RM) draw()
    })
    canvas.addEventListener('pointerleave', () => {
      hover = null
      if (RM) draw()
    })
    canvas.addEventListener('pointerdown', (e) => {
      const n = hit(pos(e))
      if (n) {
        drag = n
        canvas.setPointerCapture(e.pointerId)
        n.state = 'reading'
        n.glow = 1
      }
    })
    canvas.addEventListener('pointerup', () => (drag = null))
    if (RM) return
    let nextAct = 600
    let nextLearn = 4000
    frames(canvas, (dt, t) => {
      nextAct -= dt
      nextLearn -= dt
      if (nextAct <= 0) {
        activity()
        nextAct = rand(1100, 2000)
      }
      if (nextLearn <= 0) {
        learn()
        nextLearn = rand(3500, 5000)
      }
      step(dt, t)
      draw()
    })
  }
  $$('canvas[data-graph]').forEach((c) => {
    const src = $('#' + c.dataset.graph)
    if (src) brainGraph(c, JSON.parse(src.textContent))
  })

  // ---------- Merge Studio: branch diagram ----------
  const mg = $('[data-demo="merge"]')
  if (mg) {
    const holder = $('.merge-svg', mg)
    const log = $('.merge-log', mg)
    let vertical = null
    let el = {}
    const build = () => {
      const v = holder.clientWidth < 620
      if (v === vertical) return
      vertical = v
      holder.innerHTML = ''
      const W = v ? 360 : 1000
      const H = v ? 620 : 340
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: v ? 'vert' : '', role: 'img', 'aria-label': 'Two isolated sessions branch off main, a conflict in Login.tsx is predicted, a checkpoint is set, then both are merged back.' }, holder)
      // map (t along main, lane) -> point
      const P = (t, lane) => (v ? [W / 2 + lane * 115, 50 + t * (H - 90)] : [60 + t * (W - 120), H / 2 + lane * 105])
      const path = (pts, cls, color) => {
        let d = `M${P(...pts[0]).join(' ')}`
        for (let i = 1; i < pts.length; i++) {
          const [x0, y0] = P(...pts[i - 1])
          const [x1, y1] = P(...pts[i])
          if (v) d += ` C${x0} ${(y0 + y1) / 2} ${x1} ${(y0 + y1) / 2} ${x1} ${y1}`
          else d += ` C${(x0 + x1) / 2} ${y0} ${(x0 + x1) / 2} ${y1} ${x1} ${y1}`
        }
        return s('path', { d, class: 'mline ' + cls, stroke: color, pathLength: 1 }, svg)
      }
      const dot = (t, lane, color, cls = '', r = 6) => {
        const [x, y] = P(t, lane)
        return s('circle', { cx: x, cy: y, r, fill: color, class: 'mdot ' + cls }, svg)
      }
      const label = (t, lane, text, cls, dx = 0, dy = 0, anchor) => {
        const [x, y] = P(t, lane)
        const e = s('text', { x: x + dx, y: y + dy, class: 'mlabel ' + cls, 'text-anchor': anchor || (v ? 'middle' : 'start') }, svg)
        e.textContent = text
        return e
      }
      const main = '#8b93a3'
      const A = '#60a5fa'
      const B = '#c4b5fd'
      el.main = path([[0, 0], [1, 0]], 'm-main on', main)
      el.mainLbl = label(0, 0, 'main', 'm-main-l show', v ? 26 : 0, v ? -14 : -16, v ? 'start' : 'start')
      el.a = path([[0.12, 0], [0.26, -1], [0.62, -1]], 'm-a', A)
      el.b = path([[0.18, 0], [0.32, 1], [0.6, 1]], 'm-b', B)
      el.aLbl = v ? label(0.33, -1, 'dark-mode', 'm-a-l', 10, 4, 'start') : label(0.275, -1, 'vd/dark-mode', 'm-a-l', 0, -14, 'start')
      el.bLbl = v ? label(0.37, 1, 'login-validation', 'm-b-l', -10, 4, 'end') : label(0.335, 1, 'vd/login-validation', 'm-b-l', 0, 26, 'start')
      el.a1 = dot(0.44, -1, A, 'm-a1')
      el.a2 = dot(0.54, -1, A, 'm-a2')
      el.b1 = dot(0.46, 1, B, 'm-b1')
      el.b2 = dot(0.56, 1, B, 'm-b2')
      el.a1l = label(0.44, -1, 'theme.css', 'm-a1l file', v ? 14 : 0, v ? 4 : 24, v ? 'start' : 'middle')
      el.a2l = label(0.54, -1, 'Login.tsx', 'm-a2l file', v ? 14 : 0, v ? 4 : 24, v ? 'start' : 'middle')
      el.b1l = label(0.46, 1, 'validate.ts', 'm-b1l file', v ? -14 : 0, v ? 4 : -14, v ? 'end' : 'middle')
      el.b2l = label(0.56, 1, 'Login.tsx', 'm-b2l file', v ? -14 : 0, v ? 4 : -14, v ? 'end' : 'middle')
      const [ax, ay] = P(0.54, -1)
      const [bx, by] = P(0.56, 1)
      el.conf = s('path', { d: `M${ax} ${ay} L${bx} ${by}`, class: 'mconf', pathLength: 1 }, svg)
      const [cx2, cy2] = [(ax + bx) / 2, (ay + by) / 2]
      el.confLbl = s('g', { class: 'mbadge' }, svg)
      s('rect', { x: cx2 - 52, y: cy2 - 12, width: 104, height: 24, rx: 12 }, el.confLbl)
      const ct = s('text', { x: cx2, y: cy2 + 4, 'text-anchor': 'middle' }, el.confLbl)
      ct.textContent = '⚠ Conflicts'
      // checkpoint flag on main
      const [fx, fy] = P(0.68, 0)
      el.flag = s('g', { class: 'mflag' }, svg)
      s('line', { x1: fx, y1: fy, x2: fx, y2: fy - 26 }, el.flag)
      s('path', { d: `M${fx} ${fy - 26} l14 5 -14 5z` }, el.flag)
      const fl = s('text', { x: fx + (v ? 20 : 0), y: fy + (v ? -12 : 24), 'text-anchor': v ? 'start' : 'middle' }, el.flag)
      fl.textContent = 'checkpoint'
      el.mb = path([[0.6, 1], [0.76, 0]], 'm-mb', B)
      el.ma = path([[0.62, -1], [0.88, 0]], 'm-ma', A)
      el.m1 = dot(0.76, 0, '#eef1f6', 'm-m1', 5)
      el.m2 = dot(0.88, 0, '#eef1f6', 'm-m2', 5)
      el.end = dot(1, 0, main, 'm-end show', 4)
    }
    build()
    let rt
    addEventListener('resize', () => {
      clearTimeout(rt)
      rt = setTimeout(() => {
        const was = vertical
        build()
        if (was !== vertical) show(allSteps)
      }, 150)
    })
    const on = (...keys) => keys.forEach((k) => el[k] && el[k].classList.add('on', 'show'))
    const say = (html, cls = '') => {
      const l = h('div', 'ml ' + cls, html)
      log.appendChild(l)
      while (log.children.length > 4) log.firstChild.remove()
      requestAnimationFrame(() => l.classList.add('in'))
    }
    const steps = [
      [['a', 'aLbl'], 'Isolated session <b>Dark mode</b> → own worktree on <code>vd/dark-mode</code>'],
      [['b', 'bLbl'], 'Isolated session <b>Login validation</b> → <code>vd/login-validation</code>'],
      [['a1', 'a1l', 'b1', 'b1l'], 'Both sessions work in parallel – nobody steps on anybody'],
      [['a2', 'a2l', 'b2', 'b2l'], 'Both touch <code>src/pages/Login.tsx</code>'],
      [['conf', 'confLbl'], '<code>git merge-tree</code> predicts a conflict – nothing was touched yet', 'warn'],
      [['flag'], 'Checkpoint saved under <code>refs/vibedesk/checkpoints</code>'],
      [['mb', 'm1'], 'Merged <b>login-validation</b> into main'],
      [['ma', 'm2'], 'Merged <b>dark-mode</b> – only the hunks you picked', 'ok']
    ]
    const allSteps = steps.length
    const show = (n) => {
      for (let i = 0; i < n; i++) on(...steps[i][0])
    }
    if (RM) {
      show(steps.length)
      steps.slice(-3).forEach(([, t, c]) => say(t, c))
    } else
      sequence(mg, async (ctx) => {
        build()
        holder.querySelectorAll('.on, .show').forEach((x) => {
          if (!x.classList.contains('m-main') && !x.classList.contains('m-main-l') && !x.classList.contains('m-end')) x.classList.remove('on', 'show')
        })
        log.innerHTML = ''
        await ctx.wait(700)
        for (const [keys, text, cls] of steps) {
          on(...keys)
          say(text, cls)
          await ctx.wait(cls === 'warn' ? 2200 : 1500)
        }
        await ctx.wait(3000)
      })
  }

  // ---------- Ambience: player ----------
  const amb = $('[data-demo="player"]')
  if (amb) {
    const tracks = [
      { t: 'Window Seat', a: 'Rainy evening playlist', d: 154, c: ['#e8a35a', '#7c3aed'] },
      { t: 'Slow Tram', a: 'Rainy evening playlist', d: 181, c: ['#60a5fa', '#0f172a'] },
      { t: 'Late Night Study', a: 'Rainy evening playlist', d: 139, c: ['#f472b6', '#1e1b4b'] }
    ]
    let i = 0
    let pos = 23
    let playing = !RM
    const title = $('.sp-title', amb)
    const artist = $('.sp-artist', amb)
    const cover = $('.sp-cover', amb)
    const bar = $('.sp-bar i', amb)
    const tPos = $('.sp-pos', amb)
    const tDur = $('.sp-dur', amb)
    const btn = $('.sp-play', amb)
    const queue = $('.sp-queue', amb)
    const eq = $('.eq', amb)
    const fmt = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, '0')}`
    const render = () => {
      const tr = tracks[i]
      title.textContent = tr.t
      artist.textContent = tr.a
      cover.style.background = `radial-gradient(120% 120% at 20% 10%, ${tr.c[0]}, transparent 60%), radial-gradient(100% 100% at 90% 90%, ${tr.c[0]}55, ${tr.c[1]})`
      tDur.textContent = fmt(tr.d)
      queue.innerHTML = ''
      for (let k = 1; k <= 2; k++) {
        const q = tracks[(i + k) % tracks.length]
        queue.appendChild(h('li', '', `<span class="q-c" style="background:linear-gradient(135deg,${q.c[0]},${q.c[1]})"></span><span>${q.t}</span><span class="q-d">${fmt(q.d)}</span>`))
      }
    }
    const tickUi = () => {
      bar.style.width = (pos / tracks[i].d) * 100 + '%'
      tPos.textContent = fmt(pos)
      btn.setAttribute('aria-label', playing ? 'Pause' : 'Play')
      btn.classList.toggle('paused', !playing)
      eq.classList.toggle('paused', !playing)
    }
    const nextTrack = (d = 1) => {
      i = (i + d + tracks.length) % tracks.length
      pos = 0
      render()
      tickUi()
    }
    btn.addEventListener('click', () => {
      playing = !playing
      tickUi()
    })
    $('.sp-next', amb).addEventListener('click', () => nextTrack(1))
    $('.sp-prev', amb).addEventListener('click', () => (pos > 3 ? ((pos = 0), tickUi()) : nextTrack(-1)))
    render()
    tickUi()
    // speed up a little so the progress is visible
    frames(
      amb,
      (dt) => {
        if (!playing) return
        pos += (dt / 1000) * 4
        if (pos >= tracks[i].d) nextTrack(1)
        tickUi()
      },
      20
    )
    // source tabs
    $$('[role="tab"]', amb).forEach((tab) =>
      tab.addEventListener('click', () => {
        $$('[role="tab"]', amb).forEach((x) => x.setAttribute('aria-selected', String(x === tab)))
        $$('[role="tabpanel"]', amb).forEach((p) => (p.hidden = p.id !== tab.getAttribute('aria-controls')))
      })
    )
    // rain slider controls the stage rain
    const rainC = $('canvas.rain', amb)
    const slider = $('.rain-slider', amb)
    if (slider && rainC)
      slider.addEventListener('input', () => {
        rainC.setDensity && rainC.setDensity(Number(slider.value) / 50)
        $('.rain-val', amb).textContent = slider.value + ' %'
      })
  }

  // ---------- Ambience: focus ring ----------
  const focus = $('[data-demo="focus"]')
  if (focus) {
    const ring = $('.ring-fg', focus)
    const time = $('.f-time', focus)
    const phase = $('.f-phase', focus)
    const dots = $$('.f-dots i', focus)
    const len = 2 * Math.PI * 88
    ring.style.strokeDasharray = len
    let left = 25 * 60
    let total = left
    let round = 0
    let isBreak = false
    const ui = () => {
      time.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(Math.floor(left % 60)).padStart(2, '0')}`
      ring.style.strokeDashoffset = len * (1 - left / total)
      phase.textContent = isBreak ? 'Break · music gets quieter' : 'Focus'
      focus.classList.toggle('brk', isBreak)
      dots.forEach((d, k) => d.classList.toggle('on', k <= round))
    }
    ui()
    if (!RM)
      frames(
        focus,
        (dt) => {
          left -= (dt / 1000) * 30
          if (left <= 0) {
            isBreak = !isBreak
            if (!isBreak) round = (round + 1) % 4
            total = left = isBreak ? 5 * 60 : 25 * 60
          }
          ui()
        },
        20
      )
  }

  // ---------- Calm: growing dock ----------
  const dk = $('[data-demo="dock"]')
  if (dk) {
    const dockEl = $('.dock', dk)
    const cap = $('.dock-cap', dk)
    const tip = $('.dock-tip', dk)
    const winEl = $('.calm-win', dk)
    const pills = $('.zen-pills', dk)
    const items = Object.fromEntries($$('[data-k]', dk).map((e) => [e.dataset.k, e]))
    const sayCap = async (ctx, text) => {
      cap.classList.remove('in')
      await ctx.wait(250)
      cap.innerHTML = text
      cap.classList.add('in')
    }
    const grow = (k) => items[k].classList.add('in')
    const showTip = (text, k) => {
      tip.textContent = text
      const b = dk.getBoundingClientRect()
      const r = items[k].getBoundingClientRect()
      tip.style.left = Math.max(12, Math.min(b.width - 252, r.left - b.left + r.width / 2 - 120)) + 'px'
      tip.classList.add('in')
    }
    const reset = () => {
      Object.values(items).forEach((e) => !e.classList.contains('base') && e.classList.remove('in'))
      dk.classList.remove('typing', 'zen')
      tip.classList.remove('in')
      winEl.classList.remove('in')
      pills.classList.remove('in')
    }
    const still = () => {
      Object.values(items).forEach((e) => e.classList.add('in'))
      winEl.classList.add('in')
      cap.innerHTML = 'Tools appear when they have something to do'
      cap.classList.add('in')
    }
    sequence(
      dk,
      async (ctx) => {
        reset()
        await sayCap(ctx, 'A fresh desk: rain, a few tools, nothing else')
        await ctx.wait(1800)
        await sayCap(ctx, 'You start a session')
        winEl.classList.add('in')
        grow('sf')
        await ctx.wait(1700)
        await sayCap(ctx, 'Claude changed files → <b>Git</b> shows up')
        grow('git')
        await ctx.wait(300)
        showTip('Claude changed files – review and commit them in Git.', 'git')
        await ctx.wait(2400)
        tip.classList.remove('in')
        await sayCap(ctx, 'Claude used the brain → <b>Brain</b> shows up')
        grow('brain')
        await ctx.wait(1600)
        await sayCap(ctx, 'A dev server runs on :5173 → <b>Preview</b>')
        grow('preview')
        await ctx.wait(1600)
        await sayCap(ctx, 'A second session → <b>Merge Studio</b>')
        grow('as')
        await ctx.wait(400)
        grow('merge')
        await ctx.wait(300)
        showTip('Two sessions at once? Merge Studio compares them.', 'merge')
        await ctx.wait(2400)
        tip.classList.remove('in')
        await sayCap(ctx, 'While you type, the dock steps back')
        dk.classList.add('typing')
        await ctx.wait(2200)
        dk.classList.remove('typing')
        await sayCap(ctx, 'Zen mode <kbd>Ctrl</kbd> + <kbd>.</kbd> – only Claude and the rain')
        dk.classList.add('zen')
        pills.classList.add('in')
        await ctx.wait(3200)
      },
      still
    )
  }

  // ---------- Tools: flow editor ----------
  const fl = $('[data-demo="flow"]')
  if (fl) {
    const nodes = $$('.fnode', fl)
    const wires = $$('.fwire', fl)
    const svg = $('.fwires', fl)
    const logEl = $('.flog', fl)
    const run = $('.frun', fl)
    const layout = () => {
      const b = fl.querySelector('.fcanvas').getBoundingClientRect()
      svg.setAttribute('viewBox', `0 0 ${b.width} ${b.height}`)
      wires.forEach((w) => {
        const [a, c] = w.dataset.link.split('>').map((id) => $('#' + id, fl))
        const ra = a.getBoundingClientRect()
        const rc = c.getBoundingClientRect()
        const vertical = b.width < 560
        let d
        if (vertical) {
          const x1 = ra.left - b.left + ra.width / 2
          const y1 = ra.bottom - b.top
          const x2 = rc.left - b.left + rc.width / 2
          const y2 = rc.top - b.top
          d = `M${x1} ${y1} C${x1} ${(y1 + y2) / 2} ${x2} ${(y1 + y2) / 2} ${x2} ${y2}`
        } else {
          const x1 = ra.right - b.left
          const y1 = ra.top - b.top + ra.height / 2
          const x2 = rc.left - b.left
          const y2 = rc.top - b.top + rc.height / 2
          d = `M${x1} ${y1} C${(x1 + x2) / 2} ${y1} ${(x1 + x2) / 2} ${y2} ${x2} ${y2}`
        }
        w.setAttribute('d', d)
      })
    }
    layout()
    addEventListener('resize', layout)
    const pulse = (w, ms) =>
      new Promise((res) => {
        const len = w.getTotalLength()
        const p = $('.fpulse', fl)
        const t0 = performance.now()
        const f = (t) => {
          const k = Math.min(1, (t - t0) / ms)
          const pt = w.getPointAtLength(len * k)
          p.setAttribute('cx', pt.x)
          p.setAttribute('cy', pt.y)
          p.style.opacity = k < 1 ? 1 : 0
          if (k < 1) requestAnimationFrame(f)
          else res()
        }
        requestAnimationFrame(f)
      })
    const say = (t) => {
      const l = h('div', 'fl-l', t)
      logEl.appendChild(l)
      while (logEl.children.length > 3) logEl.firstChild.remove()
      requestAnimationFrame(() => l.classList.add('in'))
    }
    const still = () => {
      nodes.forEach((n) => n.classList.add('in'))
      wires.forEach((w) => w.classList.add('in'))
    }
    sequence(
      fl,
      async (ctx) => {
        nodes.forEach((n) => n.classList.remove('in', 'hot'))
        wires.forEach((w) => w.classList.remove('in'))
        logEl.innerHTML = ''
        layout()
        for (let k = 0; k < nodes.length; k++) {
          nodes[k].classList.add('in')
          await ctx.wait(450)
          if (wires[k - 1]) wires[k - 1].classList.add('in')
          if (k > 0) await ctx.wait(250)
        }
        layout()
        wires.forEach((w) => w.classList.add('in'))
        await ctx.wait(800)
        run.classList.add('press')
        await ctx.wait(200)
        run.classList.remove('press')
        for (let k = 0; k < nodes.length; k++) {
          const n = nodes[k]
          n.classList.add('hot')
          say(n.dataset.log || '')
          await ctx.wait(500)
          n.classList.remove('hot')
          if (wires[k]) {
            await pulse(wires[k], 650)
          }
        }
        await ctx.wait(2600)
      },
      still
    )
  }

  // ---------- Tools: "Point at it" ----------
  const pt = $('[data-demo="point"]')
  if (pt) {
    const target = $('.pv-btn', pt)
    const box = $('.pv-page', pt)
    const outline = $('.pv-outline', pt)
    const bubble = $('.pv-bubble', pt)
    const input = $('.pv-input', pt)
    const sent = $('.pv-sent', pt)
    const lens = $('.pv-lens', pt)
    const cur = cursorIn(box)
    const place = () => {
      const b = box.getBoundingClientRect()
      const r = target.getBoundingClientRect()
      outline.style.cssText = `left:${r.left - b.left - 4}px;top:${r.top - b.top - 4}px;width:${r.width + 8}px;height:${r.height + 8}px`
    }
    const still = () => {
      target.classList.add('wide')
      bubble.classList.add('in')
      input.textContent = 'Make this button full width'
    }
    sequence(
      pt,
      async (ctx) => {
        target.classList.remove('wide')
        outline.classList.remove('in')
        bubble.classList.remove('in')
        sent.classList.remove('in')
        input.textContent = ''
        cur.classList.remove('show')
        await ctx.wait(600)
        moveCursor(cur, box, lens)
        await ctx.wait(800)
        await click(ctx, cur, lens)
        lens.classList.add('on')
        await ctx.wait(400)
        moveCursor(cur, box, target)
        await ctx.wait(700)
        place()
        outline.classList.add('in')
        await ctx.wait(700)
        await click(ctx, cur, target)
        bubble.classList.add('in')
        cur.classList.remove('show')
        const text = 'Make this button full width'
        for (let k = 1; k <= text.length; k++) {
          input.textContent = text.slice(0, k)
          await ctx.wait(45)
        }
        await ctx.wait(500)
        sent.classList.add('in')
        await ctx.wait(1200)
        bubble.classList.remove('in')
        outline.classList.remove('in')
        lens.classList.remove('on')
        await ctx.wait(900)
        target.classList.add('wide')
        await ctx.wait(3000)
      },
      still
    )
  }

  // ---------- Calm: Claude bedient den Desktop (MCP) ----------
  const mc = $('[data-demo="mcp"]')
  if (mc) {
    const term = termWriter($('.mcp-term', mc))
    const rainC = $('canvas.rain', mc)
    const typeLine = async (ctx, text) => {
      const l = term.add('<span class="t-b">&gt;</span> ')
      for (let k = 1; k <= text.length; k++) {
        l.innerHTML = '<span class="t-b">&gt;</span> ' + text.slice(0, k)
        await ctx.wait(40)
      }
    }
    sequence(
      mc,
      async (ctx) => {
        term.clear()
        mc.classList.remove('sorted', 'tokyo')
        rainC && rainC.setDensity && rainC.setDensity(0.6)
        await ctx.wait(800)
        await typeLine(ctx, 'sort my windows')
        await ctx.wait(500)
        term.add('<span class="t-g">●</span> <span class="t-dim">VibeDesk · arranging windows</span>')
        mc.classList.add('sorted')
        await ctx.wait(1600)
        await typeLine(ctx, 'tokyo scene with more rain')
        await ctx.wait(500)
        term.add('<span class="t-g">●</span> <span class="t-dim">VibeDesk · scene Tokyo alley, rain up</span>')
        mc.classList.add('tokyo')
        rainC && rainC.setDensity && rainC.setDensity(2)
        await ctx.wait(3200)
      },
      () => {
        mc.classList.add('sorted')
        term.add('<span class="t-b">&gt;</span> sort my windows').classList.add('in')
      }
    )
  }

  // ---------- Social: Discord presence ----------
  const dc = $('[data-demo="discord"]')
  if (dc) {
    const l1 = $('.dc-l1', dc)
    const l2 = $('.dc-l2', dc)
    const el = $('.dc-el', dc)
    const lines = [
      ['Vibecoding on shop-frontend', 'writing code'],
      ['Vibecoding on shop-frontend', 'Builds the login page · 3/7'],
      ['Vibecoding on shop-frontend', 'running commands'],
      ['Vibecoding on shop-frontend', '🔥 5 days in a row'],
      ['Vibecoding on shop-frontend', 'sends 3 agents off']
    ]
    let k = 0
    let sec = 42 * 60 + 12
    const tick = () => {
      el.textContent = `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')} elapsed`
    }
    tick()
    sequence(dc, async (ctx) => {
      for (let n = 0; n < 4; n++) {
        await ctx.wait(1000)
        sec++
        tick()
      }
      l2.classList.add('out')
      await ctx.wait(250)
      k = (k + 1) % lines.length
      l1.textContent = lines[k][0]
      l2.textContent = lines[k][1]
      l2.classList.remove('out')
    })
  }

  // ---------- Social: OBS overlay + Twitch suggestion ----------
  const ob = $('[data-demo="overlay"]')
  if (ob) {
    const feed = $('.ov-feed', ob)
    const chat = $('.tw-chat', ob)
    const sug = $('.tw-sug', ob)
    const prog = $('.ov-prog i', ob)
    const progT = $('.ov-prog-t', ob)
    const acts = [
      ['Edit', 'src/pages/Login.tsx'],
      ['Bash', ''],
      ['Read', 'src/lib/validate.ts'],
      ['Edit', 'src/theme.css'],
      ['Bash', '']
    ]
    let a = 0
    let done = 3
    const still = () => {
      acts.slice(0, 3).forEach(([t, x]) => feed.appendChild(h('div', 'ov-row in', `<b>${t}</b><span>${x}</span><i>✓</i>`)))
      sug.classList.add('in')
    }
    sequence(
      ob,
      async (ctx) => {
        for (let n = 0; n < 3; n++) {
          const [t, x] = acts[a++ % acts.length]
          const r = h('div', 'ov-row', `<b>${t}</b><span>${x}</span><i></i>`)
          feed.prepend(r)
          while (feed.children.length > 4) feed.lastChild.remove()
          requestAnimationFrame(() => r.classList.add('in'))
          await ctx.wait(900)
          $('i', r).textContent = '✓'
          await ctx.wait(500)
        }
        done = done >= 7 ? 3 : done + 1
        prog.style.width = (done / 7) * 100 + '%'
        progT.textContent = `${done}/7`
        // chat suggestion
        const msg = h('div', 'tw-msg', '<b>night_owl</b> !vibe add a dark mode toggle')
        chat.appendChild(msg)
        while (chat.children.length > 3) chat.firstChild.remove()
        requestAnimationFrame(() => msg.classList.add('in'))
        await ctx.wait(900)
        sug.classList.add('in')
        await ctx.wait(1800)
        $('.tw-ok', sug).classList.add('press')
        await ctx.wait(250)
        $('.tw-ok', sug).classList.remove('press')
        sug.classList.add('ok')
        await ctx.wait(1400)
        sug.classList.remove('in', 'ok')
        await ctx.wait(600)
      },
      still
    )
  }

  // ---------- Social: Wrapped bars ----------
  const wr = $('[data-demo="wrapped"]')
  if (wr) {
    const bars = $$('.wr-bars i', wr)
    const set = () => bars.forEach((b) => (b.style.height = b.dataset.v + '%'))
    if (RM) set()
    else
      watch(wr, (v) => {
        if (v) setTimeout(set, 200)
      })
  }
})()

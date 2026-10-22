// VibeDesk-Gehirn als MCP-Server (stdio, JSON-RPC je Zeile). Claude Code startet ihn pro Session;
// jede Werkzeug-Anfrage geht an die laufende VibeDesk-App (nur 127.0.0.1, Token-geschützt).
'use strict'
const http = require('http')
const fs = require('fs')

const { VIBEDESK_SESSION_ID: sessionId, VIBEDESK_PORT: envPort, VIBEDESK_TOKEN: envToken } = process.env
// Sessions von vor v0.17.2 kennen VIBEDESK_ENDPOINT noch nicht – dann der Standardort von userData
const endpointFile = process.env.VIBEDESK_ENDPOINT || (process.env.APPDATA ? require('path').join(process.env.APPDATA, 'vibedesk', 'endpoint.json') : '')

/** Startet VibeDesk neu (z. B. nach einem Update), gelten Port und Token aus der Umgebung nicht mehr – die App legt die aktuellen in einer Datei ab */
function freshEndpoint() {
  try {
    const e = JSON.parse(fs.readFileSync(endpointFile, 'utf8'))
    if (Number.isInteger(e.port) && typeof e.token === 'string') return { port: e.port, token: e.token }
  } catch {
    /* keine Datei – App läuft nicht */
  }
  return null
}
let endpoint = envPort && envToken ? { port: Number(envPort), token: envToken } : freshEndpoint()
const PROTOCOL = '2025-06-18'

const TYPES = ['module', 'decision', 'pitfall', 'convention', 'task', 'fact']
const SCOPE = {
  type: 'string',
  enum: ['project', 'me'],
  description: 'project (Standard) = dieses Projekt; me = persönliches Gehirn über den User, gilt in allen Projekten'
}
const TOOLS = [
  {
    name: 'brain_overview',
    description:
      'Überblick über das Projektgedächtnis (VibeDesk-Gehirn): alle Notizen nach Typ, Notizen „zu prüfen“ und zuletzt geänderte Dateien. Nutze es zu Beginn einer größeren Aufgabe.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'brain_search',
    description: 'Durchsucht das Projektgedächtnis und das persönliche Gehirn nach Stichworten (Titel, Inhalt, Tags, Dateien). Nutze es, bevor du einen Bereich des Projekts neu erkundest.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Stichworte, z. B. „auth token refresh“' } }, required: ['query'] }
  },
  {
    name: 'brain_read',
    description: 'Liest eine Notiz aus dem Projektgedächtnis inklusive verknüpfter Dateien und Rückverweise. Ohne scope wird erst im Projekt, dann im persönlichen Gehirn gesucht.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, scope: SCOPE }, required: ['title'] }
  },
  {
    name: 'brain_related',
    description: 'Was weiß das Gedächtnis über eine Datei? Zugehörige Notizen und Dateien, die oft zusammen mit ihr geändert werden. Nutze es, bevor du eine Datei änderst, die du nicht kennst.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Pfad relativ zum Projekt oder absolut' } }, required: ['file'] }
  },
  {
    name: 'brain_write',
    description:
      'Legt eine Notiz im Projektgedächtnis an oder ersetzt sie (gleicher Titel = gleiche Notiz). Halte fest, was künftigen Sessions Zeit spart: Überblick über einen Bereich, Entscheidungen samt Grund, Stolperfallen, Projekt-Konventionen. Kurz und sachlich, Markdown, verlinke verwandte Notizen mit [[Titel]]. Was du über den User selbst lernst (Vorlieben, Arbeitsweise, Stack, was er nicht mag), gehört mit scope "me" ins persönliche Gehirn – das gilt dann in allen Projekten.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'kurzer, eindeutiger Titel – wird zum Dateinamen' },
        type: { type: 'string', enum: TYPES, description: 'module = Bereich, decision = Entscheidung, pitfall = Stolperfalle, convention = Regel, task = Aufgabe, fact = Wissen' },
        body: { type: 'string', description: 'Inhalt in Markdown, mit [[Links]] zu verwandten Notizen' },
        files: { type: 'array', items: { type: 'string' }, description: 'betroffene Projektdateien' },
        tags: { type: 'array', items: { type: 'string' } },
        scope: SCOPE
      },
      required: ['title', 'type', 'body']
    }
  },
  {
    name: 'brain_forget',
    description: 'Archiviert eine veraltete oder falsche Notiz.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, scope: SCOPE }, required: ['title'] }
  }
]

// Desktop steuern: Fenster, Zen, Atmosphäre, Musik … (VibeDesk als MCP)
const DESK_TOOLS = [
  { name: 'desk_state', description: 'Zeigt, wie VibeDesk gerade eingestellt ist: Aufbau, Szene, Regen, Musik, Farbschema, laufende Sessions. Nutze es, bevor du etwas am Desktop änderst.', inputSchema: { type: 'object', properties: {} } },
  { name: 'desk_arrange', description: 'Ordnet alle offenen Fenster in VibeDesk neu an (Terminals oben, Werkzeuge darunter). Für Bitten wie „sortier meine Fenster“.', inputSchema: { type: 'object', properties: {} } },
  { name: 'desk_tidy', description: 'Räumt auf: alle Werkzeug-Fenster außer dem obersten wandern ins Dock, der Rest wird angeordnet.', inputSchema: { type: 'object', properties: {} } },
  { name: 'desk_zen', description: 'Zen-Modus: nur das aktuelle Claude-Terminal und der Regen sind zu sehen. Ohne on wird umgeschaltet.', inputSchema: { type: 'object', properties: { on: { type: 'boolean' } } } },
  {
    name: 'desk_scene',
    description: 'Atmosphäre hinter dem Desktop ändern: Szene (city = Stadt bei Nacht, forest = Wald, tokyo = Tokyo-Gasse), Regenstärke und Unschärfe (je 0 bis 1).',
    inputSchema: { type: 'object', properties: { scene: { type: 'string', enum: ['city', 'forest', 'tokyo'] }, rain: { type: 'number', minimum: 0, maximum: 1 }, blur: { type: 'number', minimum: 0, maximum: 1 } } }
  },
  {
    name: 'desk_music',
    description: 'Musik und Regengeräusch: music = lofi (Lofi-Radio an) oder off, volume 0–100, rainSound an/aus.',
    inputSchema: { type: 'object', properties: { music: { type: 'string', enum: ['lofi', 'off'] }, volume: { type: 'number', minimum: 0, maximum: 100 }, rainSound: { type: 'boolean' } } }
  },
  {
    name: 'desk_open',
    description: 'Öffnet ein VibeDesk-Fenster.',
    inputSchema: { type: 'object', properties: { window: { type: 'string', enum: ['projects', 'inspector', 'git', 'brain', 'merge', 'ambience', 'focus', 'prompts', 'skills', 'addons', 'companion', 'discord', 'lounge', 'streamer', 'settings'] } }, required: ['window'] }
  },
  { name: 'desk_layout', description: 'Aufbau wechseln: desktop = freie Fenster mit Dock, studio = Seitenleiste mit Seiten.', inputSchema: { type: 'object', properties: { layout: { type: 'string', enum: ['desktop', 'studio'] } }, required: ['layout'] } },
  {
    name: 'desk_terminal_theme',
    description: 'Farbschema der Terminals: scene (passend zur Szene), vibedesk, wald, neon, kontrast, mono oder custom (das zuletzt mit desk_custom_theme erzeugte).',
    inputSchema: { type: 'object', properties: { theme: { type: 'string', enum: ['scene', 'vibedesk', 'wald', 'neon', 'kontrast', 'mono', 'custom'] } }, required: ['theme'] }
  },
  {
    name: 'desk_custom_theme',
    description:
      'Erzeugt ein eigenes Farbschema für die Terminals und schaltet es ein (z. B. „Herbstfarben“, „Dracula-artig“). Farben als Hex #rrggbb. Der Hintergrund bleibt durchsichtig (Glas über der Regenszene), also helle, gut lesbare Vordergrundfarben wählen. Pflicht: foreground. Ein neues Schema ersetzt das vorige eigene.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'kurzer Name, z. B. Herbst' },
        colors: {
          type: 'object',
          properties: Object.fromEntries(['foreground', 'cursor', 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite'].map((k) => [k, { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' }])),
          required: ['foreground']
        }
      },
      required: ['colors']
    }
  },
  {
    name: 'desk_preview',
    description: 'Öffnet die lokale App des Users im Vorschau-Fenster von VibeDesk, z. B. nachdem du den Dev-Server gestartet hast. Nur localhost/127.0.0.1.',
    inputSchema: { type: 'object', properties: { url: { type: 'string', description: 'z. B. http://localhost:5173/' } }, required: ['url'] }
  },
  { name: 'desk_focus', description: 'Fokus-Timer (Pomodoro) steuern.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['start', 'pause', 'resume', 'stop'] } }, required: ['action'] } },
  {
    name: 'desk_scene_create',
    description: [
      'Lebende Szene erschaffen oder ändern: ein interaktiver Hintergrund hinter allen Fenstern, z. B. Schnee, der wirklich auf dem Hausdach im Bild liegen bleibt, Glühwürmchen, die der Maus folgen, Regen mit Spritzern, Gewitter auf Klick. Du schreibst ein kurzes JavaScript gegen die globale vd-API; es läuft abgeschottet (kein Netz, kein DOM außer dem Canvas). Danach wird die Szene eingeschaltet; Skriptfehler bekommst du zurück.',
      'Bild: image = "current" (das eigene Hintergrundbild des Users, Pfad steht in desk_state), ein Pfad zu einem Bild auf dem PC, oder weglassen (beim Ändern bleibt es). LIES DAS BILD VORHER (Read), um Dächer, Fenster, Laternen zu finden. Positionen im Bild gibst du als Anteile [nx, ny] von 0 bis 1 an (0,0 = oben links), das Bild füllt den Schirm wie CSS cover.',
      'API: vd.background({dim:0..1, blur:px, top, bottom}) · vd.surface([[nx,ny],…], {snow:true, maxDepth:18}) Fläche von links nach rechts (Dachkante, Fensterbank – Schnee/Blätter bleiben darauf liegen, Regen spritzt) · await vd.autoSurfaces({threshold:0.12}) findet Kanten vor ruhigem Himmel selbst · vd.debugSurfaces(true) zeigt Flächen farbig (zum Prüfen).',
      'Effekte (alle Optionen optional): vd.snow({amount:1, size:1, speed:1, wind:0, settle:true, ground:true, maxDepth:18, start:0.5, melt:0}) – start = wie viel schon liegt (0..1) – Maus pustet Flocken weg, Ziehen mit gedrückter Maus wischt Schnee vom Dach · vd.rain({amount, speed, wind:0.15, splash:true, mouse:"umbrella"}) · vd.fireflies({count:40, color, region:[x0,y0,x1,y1], followMouse:0.35}) · vd.leaves({count, colors:[…], shape:"leaf"|"petal", settle:true}) · vd.embers({at:[nx,ny], spread, count, color}) · vd.fog({density:0.35, color, region}) · vd.stars({count, region, twinkle, shooting:true}) · vd.lightning({every:14, flash:0.55, onClick:false}) · vd.glow({at:[nx,ny], radius:0.06, color, flicker:0.25}).',
      'Eigenes: vd.onFrame((ctx, dt, t) => {…}) zeichnet nach den Effekten (Canvas 2D, CSS-Pixel), vd.onBefore(fn) davor · vd.on("click"|"move"|"down"|"up", (x, y) => {}) · vd.mouse {x,y,vx,vy,down,active} · vd.px(nx,ny) → {x,y} Pixel, vd.norm(x,y) · vd.width/height/time · vd.wind (global, −1..1) · vd.noise(x,y,z), vd.rand(a,b), vd.lerp, vd.clamp.',
      'Beispiel Schnee auf dem Dach: vd.background({dim:0.15}); vd.surface([[0.18,0.42],[0.40,0.27],[0.62,0.42]]); vd.surface([[0.25,0.61],[0.33,0.61]], {maxDepth:8}); vd.snow({amount:1.2}); vd.glow({at:[0.29,0.55], color:"rgba(255,190,110,0.7)"})',
      'Danach mit desk_scene_snapshot ansehen und nachbessern (id angeben, um zu ändern statt neu anzulegen). Ruhig und stimmungsvoll bleiben – es ist ein Hintergrund zum Arbeiten.'
    ].join('\n'),
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'kurzer Name, z. B. „Winterhaus“ (Pflicht bei neuen Szenen)' },
        code: { type: 'string', description: 'JavaScript gegen die vd-API' },
        image: { type: 'string', description: '"current", Pfad zu einem Bild, "none" (kein Bild) oder weglassen' },
        id: { type: 'string', description: 'id einer bestehenden Szene, um sie zu ändern' },
        activate: { type: 'boolean', description: 'Standard true: gleich einschalten' }
      },
      required: ['code']
    }
  },
  {
    name: 'desk_scene_snapshot',
    description: 'Schnappschuss der laufenden lebenden Szene als Bild (ohne die Fenster davor) – so prüfst du, ob Schnee wirklich auf dem Dach liegt, Lichter an der richtigen Stelle sitzen usw. wait = Sekunden warten (z. B. 8, damit sich Schnee sammelt).',
    inputSchema: { type: 'object', properties: { wait: { type: 'number', minimum: 0, maximum: 30 } } }
  },
  { name: 'desk_scene_list', description: 'Listet die lebenden Szenen (id, Name, Bildgröße) und welche gerade läuft.', inputSchema: { type: 'object', properties: {} } },
  { name: 'desk_scene_code', description: 'Liefert das Skript einer lebenden Szene, um es zu ändern.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'desk_scene_show', description: 'Schaltet eine gespeicherte lebende Szene ein.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'desk_scene_delete', description: 'Löscht eine lebende Szene.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  {
    name: 'desk_notify',
    description: 'Zeigt dem User in VibeDesk eine kurze Karte (z. B. „Build fertig“). Sparsam nutzen.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title'] }
  }
]

// Gehirn aus: nur die Desktop-Werkzeuge
const ALL_TOOLS = process.env.VIBEDESK_BRAIN === '0' ? DESK_TOOLS : [...TOOLS, ...DESK_TOOLS]

const UNREACHABLE = { text: 'VibeDesk ist nicht erreichbar – läuft die App noch?', isError: true }

/** null = Verbindung abgelehnt oder Token falsch – dann lohnt ein zweiter Versuch mit frischem Endpunkt */
/** Szenen warten auf die Rückmeldung bzw. ein paar Sekunden für den Schnappschuss */
const timeoutFor = (tool) => (tool.startsWith('desk_scene_') ? 60000 : 10000)

function post(ep, tool, args) {
  return new Promise((resolve) => {
    // cwd: Kennt eine neu gestartete App die Session nicht, findet sie das Projekt über den Ordner
    const body = JSON.stringify({ sessionId, tool, args: args || {}, cwd: process.cwd() })
    const req = http.request(
      {
        host: '127.0.0.1',
        port: ep.port,
        path: '/brain',
        method: 'POST',
        timeout: timeoutFor(tool),
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-vibedesk-token': ep.token }
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          if (res.statusCode === 403) return resolve(null)
          try {
            const r = JSON.parse(data)
            const image = r.image && typeof r.image.data === 'string' && typeof r.image.mimeType === 'string' ? r.image : null
            resolve({ text: String(r.text ?? ''), isError: !!r.isError, image })
          } catch {
            resolve({ text: `VibeDesk antwortete unerwartet (HTTP ${res.statusCode}).`, isError: true })
          }
        })
      }
    )
    req.on('error', () => resolve(null))
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.end(body)
  })
}

async function callApp(tool, args) {
  if (!sessionId) return { text: 'VibeDesk ist nicht erreichbar.', isError: true }
  // mit dem Endpunkt vergleichen, den dieser Aufruf benutzt hat – parallele Aufrufe können ihn inzwischen erneuert haben
  const used = endpoint
  const first = used && (await post(used, tool, args))
  if (first) return first
  const fresh = freshEndpoint()
  if (!fresh || (used && fresh.port === used.port && fresh.token === used.token)) return UNREACHABLE
  endpoint = fresh
  return (await post(endpoint, tool, args)) || UNREACHABLE
}

const send = (msg) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n')

async function handle(msg) {
  const { id, method, params } = msg
  if (id === undefined || id === null) return // Benachrichtigungen brauchen keine Antwort
  switch (method) {
    case 'initialize':
      return send({
        id,
        result: {
          protocolVersion: typeof params?.protocolVersion === 'string' ? params.protocolVersion : PROTOCOL,
          capabilities: { tools: {} },
          serverInfo: { name: 'vibedesk-brain', version: '1.0.0' },
          instructions:
            (process.env.VIBEDESK_BRAIN === '0' ? '' : 'Projektgedächtnis von VibeDesk: vor dem Erkunden suchen (brain_search, brain_related), Gelerntes festhalten (brain_write). ') +
            'Den VibeDesk-Desktop steuern die desk_*-Werkzeuge (Fenster anordnen, Zen-Modus, Szene, Musik …), wenn der User darum bittet. Interaktive Hintergründe (z. B. Schnee, der auf dem Dach im eigenen Bild liegen bleibt) baust du mit desk_scene_create und prüfst sie mit desk_scene_snapshot.'
        }
      })
    case 'ping':
      return send({ id, result: {} })
    case 'tools/list':
      return send({ id, result: { tools: ALL_TOOLS } })
    case 'tools/call': {
      const name = params?.name
      if (!ALL_TOOLS.some((t) => t.name === name)) return send({ id, error: { code: -32602, message: `Unbekanntes Werkzeug: ${name}` } })
      const r = await callApp(name, params?.arguments)
      const content = [{ type: 'text', text: r.text }]
      if (r.image) content.push({ type: 'image', data: r.image.data, mimeType: r.image.mimeType })
      return send({ id, result: { content, isError: r.isError } })
    }
    default:
      return send({ id, error: { code: -32601, message: `Methode nicht unterstützt: ${method}` } })
  }
}

let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let i
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i).trim()
    buf = buf.slice(i + 1)
    if (!line) continue
    let msg
    try {
      msg = JSON.parse(line)
    } catch {
      send({ id: null, error: { code: -32700, message: 'Parse error' } })
      continue
    }
    handle(msg).catch((err) => send({ id: msg.id ?? null, error: { code: -32603, message: String(err && err.message ? err.message : err) } }))
  }
})
process.stdin.on('end', () => process.exit(0))

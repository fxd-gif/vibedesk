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
    name: 'desk_notify',
    description: 'Zeigt dem User in VibeDesk eine kurze Karte (z. B. „Build fertig“). Sparsam nutzen.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' } }, required: ['title'] }
  }
]

// Gehirn aus: nur die Desktop-Werkzeuge
const ALL_TOOLS = process.env.VIBEDESK_BRAIN === '0' ? DESK_TOOLS : [...TOOLS, ...DESK_TOOLS]

const UNREACHABLE = { text: 'VibeDesk ist nicht erreichbar – läuft die App noch?', isError: true }

/** null = Verbindung abgelehnt oder Token falsch – dann lohnt ein zweiter Versuch mit frischem Endpunkt */
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
        timeout: 10000,
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
            resolve({ text: String(r.text ?? ''), isError: !!r.isError })
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
            'Den VibeDesk-Desktop steuern die desk_*-Werkzeuge (Fenster anordnen, Zen-Modus, Szene, Musik …), wenn der User darum bittet.'
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
      return send({ id, result: { content: [{ type: 'text', text: r.text }], isError: r.isError } })
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

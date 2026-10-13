// VibeDesk-Gehirn als MCP-Server (stdio, JSON-RPC je Zeile). Claude Code startet ihn pro Session;
// jede Werkzeug-Anfrage geht an die laufende VibeDesk-App (nur 127.0.0.1, Token-geschützt).
'use strict'
const http = require('http')

const { VIBEDESK_SESSION_ID: sessionId, VIBEDESK_PORT: port, VIBEDESK_TOKEN: token } = process.env
const PROTOCOL = '2025-06-18'

const TYPES = ['module', 'decision', 'pitfall', 'convention', 'task', 'fact']
const TOOLS = [
  {
    name: 'brain_overview',
    description:
      'Überblick über das Projektgedächtnis (VibeDesk-Gehirn): alle Notizen nach Typ, Notizen „zu prüfen“ und zuletzt geänderte Dateien. Nutze es zu Beginn einer größeren Aufgabe.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'brain_search',
    description: 'Durchsucht das Projektgedächtnis nach Stichworten (Titel, Inhalt, Tags, Dateien). Nutze es, bevor du einen Bereich des Projekts neu erkundest.',
    inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Stichworte, z. B. „auth token refresh“' } }, required: ['query'] }
  },
  {
    name: 'brain_read',
    description: 'Liest eine Notiz aus dem Projektgedächtnis inklusive verknüpfter Dateien und Rückverweise.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
  },
  {
    name: 'brain_related',
    description: 'Was weiß das Gedächtnis über eine Datei? Zugehörige Notizen und Dateien, die oft zusammen mit ihr geändert werden. Nutze es, bevor du eine Datei änderst, die du nicht kennst.',
    inputSchema: { type: 'object', properties: { file: { type: 'string', description: 'Pfad relativ zum Projekt oder absolut' } }, required: ['file'] }
  },
  {
    name: 'brain_write',
    description:
      'Legt eine Notiz im Projektgedächtnis an oder ersetzt sie (gleicher Titel = gleiche Notiz). Halte fest, was künftigen Sessions Zeit spart: Überblick über einen Bereich, Entscheidungen samt Grund, Stolperfallen, Projekt-Konventionen. Kurz und sachlich, Markdown, verlinke verwandte Notizen mit [[Titel]].',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'kurzer, eindeutiger Titel – wird zum Dateinamen' },
        type: { type: 'string', enum: TYPES, description: 'module = Bereich, decision = Entscheidung, pitfall = Stolperfalle, convention = Regel, task = Aufgabe, fact = Wissen' },
        body: { type: 'string', description: 'Inhalt in Markdown, mit [[Links]] zu verwandten Notizen' },
        files: { type: 'array', items: { type: 'string' }, description: 'betroffene Projektdateien' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['title', 'type', 'body']
    }
  },
  {
    name: 'brain_forget',
    description: 'Archiviert eine veraltete oder falsche Notiz.',
    inputSchema: { type: 'object', properties: { title: { type: 'string' } }, required: ['title'] }
  }
]

function callApp(tool, args) {
  return new Promise((resolve) => {
    if (!sessionId || !port || !token) return resolve({ text: 'VibeDesk ist nicht erreichbar.', isError: true })
    const body = JSON.stringify({ sessionId, tool, args: args || {} })
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(port),
        path: '/brain',
        method: 'POST',
        timeout: 10000,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-vibedesk-token': token }
      },
      (res) => {
        let data = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (data += c))
        res.on('end', () => {
          try {
            const r = JSON.parse(data)
            resolve({ text: String(r.text ?? ''), isError: !!r.isError })
          } catch {
            resolve({ text: `VibeDesk antwortete unerwartet (HTTP ${res.statusCode}).`, isError: true })
          }
        })
      }
    )
    req.on('error', () => resolve({ text: 'VibeDesk ist nicht erreichbar – läuft die App noch?', isError: true }))
    req.on('timeout', () => req.destroy(new Error('timeout')))
    req.end(body)
  })
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
          instructions: 'Projektgedächtnis von VibeDesk: vor dem Erkunden suchen (brain_search, brain_related), Gelerntes festhalten (brain_write).'
        }
      })
    case 'ping':
      return send({ id, result: {} })
    case 'tools/list':
      return send({ id, result: { tools: TOOLS } })
    case 'tools/call': {
      const name = params?.name
      if (!TOOLS.some((t) => t.name === name)) return send({ id, error: { code: -32602, message: `Unbekanntes Werkzeug: ${name}` } })
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

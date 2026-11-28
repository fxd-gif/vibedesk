// Misst die Claude-Code-Brücke: Node-Skripte gegen die Rust-Brücke (native/bridge), auf dem eigenen PC.
// Aufruf (nach `node native/build.mjs`): node native/bench.mjs [Durchläufe]
// Gemessen wird der Prozess selbst (ohne die Shell, über die Claude Code ihn startet – die kostet bei beiden gleich).
import { execFileSync, spawn } from 'child_process'
import fs from 'fs'
import http from 'http'
import path from 'path'

const root = path.resolve(import.meta.dirname, '..')
const RUNS = Number(process.argv[2]) || 40
const BRIDGE = path.join(root, 'resources', 'bin', process.platform === 'win32' ? 'vibedesk-bridge.exe' : 'vibedesk-bridge')
if (!fs.existsSync(BRIDGE)) {
  console.error('Rust-Brücke fehlt – erst `node native/build.mjs`')
  process.exit(1)
}
const IMPLS = {
  hook: { node: [process.execPath, [path.join(root, 'resources', 'hook-forwarder.js')]], rust: [BRIDGE, ['hook']] },
  statusline: { node: [process.execPath, [path.join(root, 'resources', 'statusline.js')]], rust: [BRIDGE, ['statusline']] },
  mcp: { node: [process.execPath, [path.join(root, 'resources', 'brain-mcp.js')]], rust: [BRIDGE, ['mcp']] }
}

// Hook-Server wie in der App: Token prüfen, JSON lesen, leer antworten
const server = http.createServer((req, res) => {
  req.resume()
  req.on('end', () => {
    res.writeHead(req.headers['x-vibedesk-token'] === 'bench' ? 200 : 403, { connection: 'close' })
    res.end(req.url === '/brain' ? JSON.stringify({ text: 'ok' }) : undefined)
  })
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const env = { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', VIBEDESK_SESSION_ID: 'bench', VIBEDESK_PORT: String(server.address().port), VIBEDESK_TOKEN: 'bench' }

// Ein typisches PostToolUse-Event (Edit mit etwas Inhalt), ca. 2 KB
const hookInput = JSON.stringify({
  session_id: 'bench',
  transcript_path: 'C:/x/transcript.jsonl',
  cwd: 'C:/x/projekt',
  hook_event_name: 'PostToolUse',
  tool_name: 'Edit',
  tool_input: { file_path: 'C:/x/projekt/src/app.ts', old_string: 'a'.repeat(600), new_string: 'b'.repeat(600) },
  tool_response: { filePath: 'C:/x/projekt/src/app.ts', success: true }
})
const statusInput = JSON.stringify({ session_id: 'bench', model: { id: 'claude-opus-5-5' }, rate_limits: { five_hour: { used_percentage: 42, resets_at: 1 }, seven_day: { used_percentage: 12, resets_at: 2 } } })

/** Startet den Prozess, schreibt stdin und misst bis zum Ende (ms) */
function once([cmd, args], input) {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint()
    const p = spawn(cmd, args, { env, stdio: ['pipe', 'ignore', 'ignore'] })
    p.on('close', () => resolve(Number(process.hrtime.bigint() - t) / 1e6))
    p.stdin.end(input)
  })
}

/** MCP: vom Start bis zur Antwort auf initialize (ms) */
function mcpStart([cmd, args]) {
  return new Promise((resolve) => {
    const t = process.hrtime.bigint()
    const p = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'ignore'] })
    p.stdout.once('data', () => {
      resolve(Number(process.hrtime.bigint() - t) / 1e6)
      p.stdin.end()
    })
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) + '\n')
  })
}

/** MCP: Arbeitsspeicher eines laufenden Servers nach initialize, tools/list und einem Aufruf (MB) */
function mcpMemory([cmd, args]) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env, stdio: ['pipe', 'pipe', 'ignore'] })
    let lines = 0
    p.stdout.on('data', (c) => {
      lines += String(c).split('\n').length - 1
      if (lines < 3) return
      setTimeout(() => {
        let mb = NaN
        try {
          const ws = process.platform === 'win32'
            ? execFileSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${p.pid}).WorkingSet64`], { encoding: 'utf8' })
            : String(Number(fs.readFileSync(`/proc/${p.pid}/statm`, 'utf8').split(' ')[1]) * 4096)
          mb = Number(ws.trim()) / 1024 / 1024
        } catch {
          /* kein Messwert */
        }
        p.stdin.end()
        resolve(mb)
      }, 300)
    })
    for (const [id, method, params] of [[1, 'initialize', { protocolVersion: '2025-06-18' }], [2, 'tools/list', {}], [3, 'tools/call', { name: 'desk_state', arguments: {} }]])
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
}

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))]
  return { median: q(0.5), p90: q(0.9), min: s[0] }
}
const fmt = (n) => (n >= 10 ? n.toFixed(0) : n.toFixed(1))
async function series(fn, impl, input, runs) {
  await fn(impl, input) // Aufwärmen (Dateicache, Virenscanner)
  const xs = []
  for (let i = 0; i < runs; i++) xs.push(await fn(impl, input))
  return stats(xs)
}

const rows = []
for (const [name, fn, input, runs] of [
  ['Hook (PostToolUse, 2 KB)', once, hookInput, RUNS],
  ['Statuszeile (Limits melden)', once, statusInput, RUNS],
  ['MCP-Server bis initialize', mcpStart, null, Math.max(10, RUNS / 2)]
]) {
  const kind = name.startsWith('Hook') ? 'hook' : name.startsWith('Status') ? 'statusline' : 'mcp'
  const n = await series(fn, IMPLS[kind].node, input, runs)
  const r = await series(fn, IMPLS[kind].rust, input, runs)
  rows.push([name, `${fmt(n.median)} ms (p90 ${fmt(n.p90)})`, `${fmt(r.median)} ms (p90 ${fmt(r.p90)})`, `${(n.median / r.median).toFixed(1)}×`])
}
const memNode = await mcpMemory(IMPLS.mcp.node)
const memRust = await mcpMemory(IMPLS.mcp.rust)
rows.push(['MCP-Server, Arbeitsspeicher', `${fmt(memNode)} MB`, `${fmt(memRust)} MB`, `${(memNode / memRust).toFixed(1)}×`])
server.close()

const nodeVersion = process.version
const bridgeVersion = execFileSync(BRIDGE, ['--version'], { encoding: 'utf8' }).trim()
console.log(`\n${RUNS} Durchläufe je Messung · Node ${nodeVersion} · ${bridgeVersion} · ${process.platform}\n`)
console.log('| Messung | Node + JS | Rust | Faktor |')
console.log('|---|---|---|---|')
for (const r of rows) console.log(`| ${r.join(' | ')} |`)

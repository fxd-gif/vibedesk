// VibeDesk Hook-Forwarder: liest das Hook-JSON von stdin und schickt es an die App.
// Darf Claude Code niemals stören: beendet sich immer mit Exit-Code 0.
'use strict'
const http = require('http')

const done = () => process.exit(0)
let guard = setTimeout(done, 1500)
guard.unref()

// Freigaben warten, bis jemand in VibeDesk (oder auf dem Handy) antwortet – knapp unter dem Hook-Timeout von 600 s
const PERMISSION_MS = 595000

const { VIBEDESK_SESSION_ID: sessionId, VIBEDESK_PORT: port, VIBEDESK_TOKEN: token } = process.env
// Sessions von vor v0.17.2 kennen VIBEDESK_ENDPOINT noch nicht – dann der Standardort von userData
const endpointFile = process.env.VIBEDESK_ENDPOINT || (process.env.APPDATA ? require('path').join(process.env.APPDATA, 'vibedesk', 'endpoint.json') : '')
if (!sessionId || !port || !token) done()

/** Nach einem Neustart von VibeDesk (z. B. Update) stehen Port und Token nur noch in der Endpunkt-Datei */
function freshEndpoint() {
  try {
    const e = JSON.parse(require('fs').readFileSync(endpointFile, 'utf8'))
    if (Number.isInteger(e.port) && typeof e.token === 'string' && (e.port !== Number(port) || e.token !== token)) return e
  } catch {
    /* keine Datei */
  }
  return null
}

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (input += c))
process.stdin.on('error', done)
process.stdin.on('end', () => {
  let payload
  try {
    payload = JSON.parse(input)
  } catch {
    return done()
  }
  const permission = payload && payload.hook_event_name === 'PermissionRequest'
  if (permission) {
    clearTimeout(guard)
    guard = setTimeout(done, PERMISSION_MS)
    guard.unref()
  }
  const body = JSON.stringify({ sessionId, payload })
  const send = (ep, retry) => {
    const again = () => {
      const fresh = retry && freshEndpoint()
      if (fresh) send(fresh, false)
      else done()
    }
    const req = http.request(
      {
        host: '127.0.0.1',
        port: Number(ep.port),
        path: permission ? '/permission' : '/event',
        method: 'POST',
        timeout: permission ? PERMISSION_MS - 1000 : 1200,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-vibedesk-token': ep.token }
      },
      (res) => {
        if (res.statusCode === 403) {
          res.resume()
          return again()
        }
        // Antwort (z. B. Kontext beim Session-Start oder eine Freigabe-Entscheidung) geht an Claude Code
        let out = ''
        res.setEncoding('utf8')
        res.on('data', (c) => (out += c))
        res.on('end', () => {
          if (res.statusCode === 200 && out) process.stdout.write(out, done)
          else done()
        })
      }
    )
    req.on('error', again)
    req.on('timeout', () => {
      req.destroy()
      done()
    })
    req.end(body)
  }
  send({ port, token }, true)
})

// VibeDesk Hook-Forwarder: liest das Hook-JSON von stdin und schickt es an die App.
// Darf Claude Code niemals stören: beendet sich immer mit Exit-Code 0.
'use strict'
const http = require('http')

const done = () => process.exit(0)
setTimeout(done, 1500).unref()

const { VIBEDESK_SESSION_ID: sessionId, VIBEDESK_PORT: port, VIBEDESK_TOKEN: token } = process.env
if (!sessionId || !port || !token) done()

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
  const body = JSON.stringify({ sessionId, payload })
  const req = http.request(
    {
      host: '127.0.0.1',
      port: Number(port),
      path: '/event',
      method: 'POST',
      timeout: 1200,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-vibedesk-token': token }
    },
    (res) => {
      // Antwort (z. B. Kontext beim Session-Start) geht an Claude Code
      let out = ''
      res.setEncoding('utf8')
      res.on('data', (c) => (out += c))
      res.on('end', () => {
        if (res.statusCode === 200 && out) process.stdout.write(out, done)
        else done()
      })
    }
  )
  req.on('error', done)
  req.on('timeout', () => {
    req.destroy()
    done()
  })
  req.end(body)
})

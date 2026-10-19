// VibeDesk-Statuszeile für Claude Code: schickt die Abo-Limits (rate_limits) an die App und zeigt danach
// die eigene Statuszeile des Nutzers, falls er eine hat. Darf Claude Code nie stören: endet immer mit Exit-Code 0.
'use strict'
const http = require('http')

const done = () => process.exit(0)
const guard = setTimeout(done, 4000)
guard.unref()

const { VIBEDESK_SESSION_ID: sessionId, VIBEDESK_PORT: port, VIBEDESK_TOKEN: token, VIBEDESK_USER_STATUSLINE: userCmd } = process.env

let input = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (c) => (input += c))
process.stdin.on('error', done)
process.stdin.on('end', () => {
  let pending = 2
  const finish = () => --pending <= 0 && done()
  report(finish)
  runUser(finish)
})

/** nur die Limits weitergeben – der Rest des JSON bleibt auf dem PC, wo er ist */
function report(next) {
  let limits
  try {
    limits = JSON.parse(input).rate_limits
  } catch {
    return next()
  }
  if (!limits || !sessionId || !port || !token) return next()
  const body = JSON.stringify({ sessionId, payload: { hook_event_name: 'StatusLine', rate_limits: limits } })
  const req = http.request(
    {
      host: '127.0.0.1',
      port: Number(port),
      path: '/event',
      method: 'POST',
      timeout: 800,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'x-vibedesk-token': token }
    },
    (res) => {
      res.resume()
      res.on('end', next)
    }
  )
  req.on('error', next)
  req.on('timeout', () => {
    req.destroy()
  })
  req.end(body)
}

/** eigene Statuszeile des Nutzers mit demselben JSON ausführen und ihre Ausgabe durchreichen */
function runUser(next) {
  if (!userCmd) return next()
  let out = ''
  let child
  try {
    child = require('child_process').spawn(userCmd, { shell: true, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] })
  } catch {
    return next()
  }
  const kill = setTimeout(() => {
    try {
      child.kill()
    } catch {
      /* schon weg */
    }
  }, 3000)
  child.stdout.setEncoding('utf8')
  child.stdout.on('data', (c) => (out += c))
  child.on('error', () => {
    clearTimeout(kill)
    next()
  })
  child.on('close', () => {
    clearTimeout(kill)
    if (out) process.stdout.write(out, next)
    else next()
  })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
}

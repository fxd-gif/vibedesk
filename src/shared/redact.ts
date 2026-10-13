// Schwärzt Secrets und persönliche Daten in Text (Streamer-Modus). Rein, in Main + Renderer nutzbar.
// Ersetzt Zeichen 1:1 durch „•“, damit Terminal-Layouts nicht verrutschen.

export interface RedactOptions {
  /** Windows-/Unix-Benutzername – wird in Pfaden wie C:\Users\<name> verborgen */
  user?: string
  emails?: boolean
}

const DOT = '•'
const mask = (s: string, keep = 0): string => s.slice(0, keep) + DOT.repeat(Math.max(0, s.length - keep))

type Rule = [RegExp, (m: string, ...g: string[]) => string]

const TOKEN_RULES: Rule[] = [
  // private Schlüssel: Kopfzeile bleibt, Inhalt verschwindet
  [/(-----BEGIN [A-Z ]*PRIVATE KEY-----)([\s\S]*?)(-----END [A-Z ]*PRIVATE KEY-----|$)/g, (_m, a, b, c) => a + b.replace(/[^\r\n]/g, DOT) + c],
  [/\bsk-ant-[A-Za-z0-9_-]{8,}/g, (m) => mask(m, 7)],
  [/\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/g, (m) => mask(m, 3)],
  [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/g, (m) => mask(m, 4)],
  [/\bglpat-[A-Za-z0-9_-]{16,}/g, (m) => mask(m, 6)],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, (m) => mask(m, 4)],
  [/\bAIza[0-9A-Za-z_-]{30,}/g, (m) => mask(m, 4)],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, (m) => mask(m, 5)],
  [/\b[rsp]k_(?:live|test)_[A-Za-z0-9]{10,}/g, (m) => mask(m, 8)],
  [/\bnpm_[A-Za-z0-9]{30,}/g, (m) => mask(m, 4)],
  [/\bhf_[A-Za-z0-9]{30,}/g, (m) => mask(m, 3)],
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, (m) => mask(m, 3)],
  // Discord-Bot-Token
  [/\b[MNO][A-Za-z\d_-]{23,25}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}/g, (m) => mask(m, 0)],
  [/\b(Bearer|Basic)(\s+)([A-Za-z0-9._~+/-]{12,}=*)/g, (_m, a, s, t) => a + s + mask(t)],
  // Zugangsdaten in URLs: https://user:pass@host
  [/(\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)([^\s@/]+)(@)/gi, (_m, a, p, c) => a + mask(p) + c]
]

const SKIP_VALUE = /^(?:process\.env|os\.environ|import\.meta|env\.|self\.|this\.|config\.|settings\.|options\.|true$|false$|null$|undefined$|none$|\$\{|\$[A-Z_]|<|\*{3,}|•)/i
// KEY=wert, "apiKey": "wert", PASSWORD: wert …
const ASSIGN: Rule = [
  /\b([A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|passw(?:or)?d|pwd|private[_-]?key|access[_-]?key|auth[_-]?key|client[_-]?secret|credentials?)[A-Za-z0-9_-]*)(["']?\s*[:=]\s*)(["']?)([^\s"'`,;()<>{}[\]]{6,})/gi,
  (m, k, sep, q, v) => (SKIP_VALUE.test(v) ? m : k + sep + q + mask(v))
]

const EMAIL: Rule = [/\b([A-Za-z0-9._%+-])([A-Za-z0-9._%+-]*)(@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,})\b/g, (_m, a, b, d) => a + mask(b) + d]

const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const userRules = new Map<string, Rule>()
function userRule(user: string): Rule {
  let r = userRules.get(user)
  if (!r) {
    r = [new RegExp(`([\\\\/]+(?:Users|home)[\\\\/]+)(${esc(user)})(?=[\\\\/"'\\s:]|$)`, 'gi'), (_m, a, u) => a + mask(u)]
    userRules.set(user, r)
  }
  return r
}

export function redact(text: string, opts: RedactOptions = {}): string {
  if (!text) return text
  let out = text
  for (const [re, fn] of TOKEN_RULES) out = out.replace(re, fn as (m: string, ...a: unknown[]) => string)
  out = out.replace(ASSIGN[0], ASSIGN[1] as (m: string, ...a: unknown[]) => string)
  if (opts.emails) out = out.replace(EMAIL[0], EMAIL[1] as (m: string, ...a: unknown[]) => string)
  if (opts.user && opts.user.length >= 2) {
    const [re, fn] = userRule(opts.user)
    out = out.replace(re, fn as (m: string, ...a: unknown[]) => string)
  }
  return out
}

/**
 * Schwärzt einen Datenstrom (Terminal-Ausgabe), der in beliebigen Stücken ankommt.
 * Das Ende der letzten Zeile wird kurz zurückgehalten, damit ein Secret, das über zwei
 * Stücke verteilt ankommt, trotzdem erkannt wird. Bestmöglich – kein Ersatz für Vorsicht.
 */
export function createStreamRedactor(fn: (s: string) => string, emit: (s: string) => void, holdMs = 30): { push(chunk: string): void; flush(): void } {
  let carry = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const flush = (): void => {
    if (timer) clearTimeout(timer)
    timer = null
    if (!carry) return
    const c = carry
    carry = ''
    emit(fn(c))
  }
  return {
    push(chunk) {
      const s = carry + chunk
      const nl = Math.max(s.lastIndexOf('\n'), s.lastIndexOf('\r'))
      let cut = nl + 1
      if (s.length - cut > 400) {
        // sehr lange Zeile: nur den letzten „Wort“-Rest festhalten
        const m = /[^\s]{1,240}$/.exec(s)
        cut = m ? s.length - m[0].length : s.length
      }
      const head = s.slice(0, cut)
      carry = s.slice(cut)
      if (head) emit(fn(head))
      if (carry && !timer) timer = setTimeout(flush, holdMs)
      else if (!carry && timer) (clearTimeout(timer), (timer = null))
    },
    flush
  }
}

const SENSITIVE_FILE = /(^|[\\/])(\.env(\..*)?|\.envrc|\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials(\.[a-z]+)?|secrets?\.[a-z]+|id_(rsa|dsa|ecdsa|ed25519)|[^\\/]*\.(pem|key|p12|pfx|keystore|jks|kdbx|ovpn)|service-?account[^\\/]*\.json)$/i

/** Dateien, deren Inhalt im Streamer-Modus nicht automatisch gezeigt wird. */
export function isSensitiveFile(path: string): boolean {
  return SENSITIVE_FILE.test(path)
}

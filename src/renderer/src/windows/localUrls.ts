// Erkennt lokale Dev-Server-URLs in Terminal-Ausgaben.

// Farb-Codes (SGR, enden auf "m") stecken oft mitten in einer URL → ersatzlos entfernen.
// Alle anderen Steuersequenzen (Cursor-Sprünge von ConPTY statt Zeilenumbruch, Zeile löschen …) → Leerzeichen.
// eslint-disable-next-line no-control-regex
const SGR = /\x1b\[[0-9;]*m/g
// eslint-disable-next-line no-control-regex
const OTHER = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
const URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):(\d{2,5})(?:\/[^\s"'<>()]*)?/g
const CARRY = 200

export function detectLocalUrls(chunk: string, carry: string): { urls: string[]; carry: string } {
  const text = carry + chunk.replace(SGR, '').replace(OTHER, ' ')
  const urls: string[] = []
  let lastEnd = 0
  for (const m of text.matchAll(URL_RE)) {
    const end = (m.index ?? 0) + m[0].length
    // URL könnte am Chunk-Ende abgeschnitten sein → im nächsten Durchlauf mit vollem Text prüfen
    if (end === text.length && !/[\s]$/.test(chunk)) break
    lastEnd = end
    const port = Number(m[1])
    if (port < 1 || port > 65535) continue
    const url = m[0].replace(/[.,;:!?)\]]+$/, '').replace('://0.0.0.0:', '://localhost:')
    if (!urls.includes(url)) urls.push(url)
  }
  // Rest ab der letzten erkannten URL (max. CARRY Zeichen) für den nächsten Chunk aufheben
  const rest = text.slice(Math.max(lastEnd, text.length - CARRY))
  return { urls, carry: rest }
}

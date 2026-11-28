import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { NativeBridge } from './hookSettings'

export const BRIDGE_FILE = 'vibedesk-bridge.exe'

/**
 * Macht die Rust-Brücke (native/bridge) für Claude-Sessions bereit: Kopie aus den App-Ressourcen nach `dir`
 * (userData/bin), dann ein kurzer Probelauf.
 *
 * Warum eine Kopie: Ein laufender MCP-Server sperrt seine .exe. Läge sie im Installationsordner, scheiterte das
 * nächste Update, solange eine Session offen ist. Außerdem behalten Sessions, die ein Update überleben, so
 * denselben Pfad.
 *
 * null = JS-Weg mit node: Brücke fehlt (z. B. Entwicklung ohne Rust), ist per VIBEDESK_BRIDGE=node abgeschaltet
 * oder startet nicht (z. B. von einem Virenscanner blockiert).
 */
export async function prepareBridge(source: string, dir: string, env: NodeJS.ProcessEnv = process.env): Promise<NativeBridge | null> {
  if (env.VIBEDESK_BRIDGE === 'node' || !fs.existsSync(source)) return null
  try {
    const exe = installBridge(source, dir)
    const version = await probeBridge(exe)
    return version ? { exe, version } : null
  } catch {
    return null
  }
}

/**
 * Kopiert nur, wenn sich die Datei geändert hat. Eine noch laufende alte Fassung lässt Windows nicht
 * überschreiben, aber umbenennen – sie wird beiseitegelegt und beim nächsten Start aufgeräumt.
 */
export function installBridge(source: string, dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  const target = path.join(dir, BRIDGE_FILE)
  for (const f of fs.readdirSync(dir)) {
    if (!f.startsWith(`${BRIDGE_FILE}.old-`) && !f.startsWith(`${BRIDGE_FILE}.new-`)) continue
    try {
      fs.rmSync(path.join(dir, f), { force: true })
    } catch {
      // läuft noch – beim nächsten Start
    }
  }
  const bytes = fs.readFileSync(source)
  if (fs.existsSync(target) && fs.readFileSync(target).equals(bytes)) return target
  const tmp = `${target}.new-${process.pid}`
  fs.writeFileSync(tmp, bytes)
  if (fs.existsSync(target)) fs.renameSync(target, `${target}.old-${Date.now()}`)
  fs.renameSync(tmp, target)
  return target
}

/** Startet die Brücke mit --version; gibt ihre Version zurück oder null, wenn sie nicht sauber läuft */
export function probeBridge(exe: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(exe, ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      const m = err ? null : /^vibedesk-bridge (\d+\.\d+\.\d+)/.exec(String(stdout).trim())
      resolve(m ? m[1] : null)
    })
  })
}

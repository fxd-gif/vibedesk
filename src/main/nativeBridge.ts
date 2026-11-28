import { execFile } from 'child_process'
import fs from 'fs'
import path from 'path'
import { nativeCommand, type NativeBridge } from './hookSettings'

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
    let exe = installBridge(source, dir)
    // Leerzeichen oder Umlaute im Benutzerpfad: Hooks laufen durch eine Shell – dann der 8.3-Kurzpfad, falls es ihn gibt
    if (!nativeCommand(exe, 'hook')) exe = (await shortPath(exe)) ?? exe
    const version = await probeBridge(exe)
    return version ? { exe, version } : null
  } catch {
    return null
  }
}

/** 8.3-Kurzpfad (nur ASCII, ohne Leerzeichen) oder null, wenn das Laufwerk keine Kurznamen hat */
export function shortPath(p: string): Promise<string | null> {
  if (process.platform !== 'win32' || /["%]/.test(p)) return Promise.resolve(null)
  return new Promise((resolve) => {
    execFile('cmd.exe', ['/d', '/c', `for %I in ("${p}") do @echo %~sI`], { windowsHide: true, timeout: 5000, windowsVerbatimArguments: true }, (err, stdout) => {
      const s = err ? '' : String(stdout).trim()
      resolve(s && nativeCommand(s, 'hook') && fs.existsSync(s) ? s : null)
    })
  })
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
  const old = `${target}.old-${Date.now()}`
  const hadOld = fs.existsSync(target)
  if (hadOld) fs.renameSync(target, old)
  try {
    fs.renameSync(tmp, target)
  } catch (e) {
    // Laufende Sessions haben diesen Pfad in ihren Settings – lieber die alte Fassung behalten als gar keine
    if (hadOld) fs.renameSync(old, target)
    throw e
  }
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

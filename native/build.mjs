// Baut die nativen Teile von VibeDesk (Rust, siehe native/README.md) und legt sie unter resources/bin ab.
// Ohne Rust-Toolchain läuft VibeDesk mit den JS-Fassungen weiter – dann gibt es nur eine Warnung.
// Aufruf: node native/build.mjs [--required] [--test]
//   --required: ohne Rust abbrechen statt warnen (Releases)   --test: vorher cargo test
import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

const here = import.meta.dirname
const root = path.resolve(here, '..')
const required = process.argv.includes('--required')
const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name)
const BINS = ['vibedesk-bridge']

function findCargo() {
  for (const c of [process.env.CARGO, 'cargo', path.join(os.homedir(), '.cargo', 'bin', exe('cargo'))]) {
    if (c && spawnSync(c, ['--version'], { stdio: 'ignore' }).status === 0) return c
  }
  return null
}

const cargo = findCargo()
if (!cargo) {
  const msg = 'Rust (cargo) nicht gefunden – VibeDesk nutzt die JS-Brücke. Installieren: https://rustup.rs'
  if (required) {
    console.error(`✗ ${msg}`)
    process.exit(1)
  }
  console.warn(`⚠ ${msg}`)
  process.exit(0)
}

const manifest = ['--release', '--locked', '--manifest-path', path.join(here, 'Cargo.toml')]
if (process.argv.includes('--test') && spawnSync(cargo, ['test', '--workspace', ...manifest], { stdio: 'inherit' }).status !== 0) {
  console.error('✗ cargo test ist fehlgeschlagen')
  process.exit(1)
}
const build = spawnSync(cargo, ['build', ...manifest], { stdio: 'inherit' })
if (build.status !== 0) {
  console.error('✗ cargo build ist fehlgeschlagen')
  process.exit(1)
}

const out = path.join(root, 'resources', 'bin')
fs.mkdirSync(out, { recursive: true })
for (const name of BINS) {
  const from = path.join(here, 'target', 'release', exe(name))
  const to = path.join(out, exe(name))
  if (fs.existsSync(to) && fs.readFileSync(to).equals(fs.readFileSync(from))) continue
  try {
    fs.copyFileSync(from, to)
  } catch {
    // Unter Windows lässt sich eine laufende .exe nicht überschreiben, aber umbenennen
    const old = `${to}.old-${Date.now()}`
    fs.renameSync(to, old)
    fs.copyFileSync(from, to)
  }
  console.log(`✓ ${path.relative(root, to)} (${Math.round(fs.statSync(to).size / 1024)} KB)`)
}
// Reste früherer Builds, die damals noch liefen
for (const f of fs.readdirSync(out)) {
  if (!f.includes('.old-')) continue
  try {
    fs.rmSync(path.join(out, f), { force: true })
  } catch {
    // läuft noch – beim nächsten Build
  }
}

// Planke 2: Layout des Gehirn-Graphen als WebAssembly (native/layout). Der Worker bettet die Datei beim Bauen ein;
// ohne sie rechnet er mit d3-force – dann nur eine Warnung, außer bei --required.
const WASM_TARGET = 'wasm32-unknown-unknown'
const wasmOut = path.join(root, 'src', 'renderer', 'src', 'windows', 'brain', 'layout', 'wasm.gen.ts')
const wasm = spawnSync(cargo, ['build', ...manifest, '-p', 'vibedesk-layout', '--target', WASM_TARGET], { stdio: 'inherit' })
if (wasm.status !== 0) {
  const msg = `Gehirn-Layout (WebAssembly) nicht gebaut – fehlt das Ziel? rustup target add ${WASM_TARGET}. VibeDesk nutzt d3-force.`
  if (required) {
    console.error(`✗ ${msg}`)
    process.exit(1)
  }
  console.warn(`⚠ ${msg}`)
} else {
  const from = path.join(here, 'target', WASM_TARGET, 'release', 'vibedesk_layout.wasm')
  const bytes = fs.readFileSync(from)
  // als Modul eingebettet: der Renderer läuft unter file://, dort gibt es kein fetch für Nachbardateien
  const mod = `// generiert von native/build.mjs aus native/layout – nicht von Hand ändern
export default '${bytes.toString('base64')}'
`
  if (!fs.existsSync(wasmOut) || fs.readFileSync(wasmOut, 'utf8') !== mod) {
    fs.writeFileSync(wasmOut, mod)
    console.log(`✓ ${path.relative(root, wasmOut)} (WebAssembly ${Math.round(bytes.length / 1024)} KB)`)
  }
}

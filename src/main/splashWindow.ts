// Kleines Update-Fensterchen (Discord-Stil): beim Start und kurz vor dem Installieren.
import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import type { SplashView } from './splashGate'

const HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#07090d;color:#e8ecf3;font:13px/1.4 'Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-app-region:drag}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;border:1px solid rgba(255,255,255,.08);box-sizing:border-box;border-radius:12px;
background:radial-gradient(120% 80% at 50% 0%,rgba(110,140,255,.18),transparent 60%),#07090d}
.orb{width:72px;height:72px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#a9b8ff,#5865f2 55%,#1d2150);box-shadow:0 0 40px rgba(88,101,242,.55);animation:p 2.4s ease-in-out infinite}
@keyframes p{50%{transform:scale(1.06);box-shadow:0 0 60px rgba(88,101,242,.8)}}
h1{margin:0;font-size:20px;font-weight:600;letter-spacing:.5px}
#t{opacity:.75;min-height:18px;text-align:center;padding:0 20px}
.bar{width:200px;height:4px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;position:relative}
#f{position:absolute;inset:0 auto 0 0;width:0;background:linear-gradient(90deg,#5865f2,#a9b8ff);border-radius:2px;transition:width .25s}
.indet #f{width:35%;animation:s 1.2s ease-in-out infinite}
@keyframes s{from{left:-35%}to{left:100%}}
</style></head><body class="indet"><div class="orb"></div><h1>VibeDesk</h1><div id="t">Suche nach Updates …</div><div class="bar"><div id="f"></div></div>
<script>window.setView=function(v){document.getElementById('t').textContent=v.text;document.body.classList.toggle('indet',v.percent===null);
if(v.percent!==null)document.getElementById('f').style.width=v.percent+'%'}</script></body></html>`

export class SplashWindow {
  private win: BrowserWindow | null
  private loaded = false
  private last: SplashView | null = null

  constructor() {
    this.win = new BrowserWindow({
      width: 300,
      height: 340,
      frame: false,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      center: true,
      show: false,
      backgroundColor: '#07090d',
      title: 'VibeDesk',
      webPreferences: { sandbox: true, contextIsolation: true }
    })
    this.win.once('ready-to-show', () => this.win?.show())
    this.win.webContents.once('did-finish-load', () => {
      this.loaded = true
      if (this.last) this.set(this.last)
    })
    this.win.on('closed', () => (this.win = null))
    this.win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(HTML))
  }

  get open(): boolean {
    return !!this.win && !this.win.isDestroyed()
  }

  set(view: SplashView): void {
    this.last = view
    if (!this.loaded || !this.open) return
    this.win!.webContents.executeJavaScript(`setView(${JSON.stringify(view)})`).catch(() => {})
  }

  close(): void {
    if (this.open) this.win!.close()
  }
}

/**
 * Überbrückt die Zeit, in der VibeDesk für den Installer schon beendet ist: ein eigenständiger
 * PowerShell-Prozess zeigt dasselbe Fensterchen, bis die neue Version ihr Fenster öffnet.
 * Das Skript wird nach %TEMP% kopiert, weil der Installer den Ressourcen-Ordner austauscht.
 */
export function showInstallBridge(script: string, version: string): void {
  if (process.platform !== 'win32' || !fs.existsSync(script)) return
  try {
    const dir = join(os.tmpdir(), 'vibedesk-update')
    fs.mkdirSync(dir, { recursive: true })
    const copy = join(dir, 'update-splash.ps1')
    fs.copyFileSync(script, copy)
    const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    spawn(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-STA', '-WindowStyle', 'Hidden', '-File', copy, version], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }).unref()
  } catch {
    /* nur Anzeige – das Update läuft auch ohne */
  }
}

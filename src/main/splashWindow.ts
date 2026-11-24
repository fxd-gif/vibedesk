// Kleines Update-Fensterchen im Nacht-Design: beim Start und kurz vor dem Installieren. Fortschritt aus Zeichen [####------].
import { BrowserWindow } from 'electron'
import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import { join } from 'path'
import type { SplashView } from './splashGate'
import { getLang, t } from '../shared/i18n'

const html = (): string => `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#0c0f18;color:#e3e7ef;font:13px/1.45 'Instrument Sans','Segoe UI',system-ui,sans-serif;overflow:hidden;user-select:none;-webkit-app-region:drag;-webkit-font-smoothing:antialiased}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;box-sizing:border-box;border:1px solid rgba(170,185,215,.14);border-radius:14px;background:#10141f}
h1{margin:0 0 4px;font-size:22px;font-weight:600;letter-spacing:-.035em}
#t{color:#a3abbb;min-height:19px;text-align:center;padding:0 20px}
.bar{display:flex;gap:10px;align-items:baseline;font:12px/1 'JetBrains Mono',Consolas,'Cascadia Mono',monospace;color:#6f788a;white-space:pre}
#b{color:#a3abbb}
</style></head><body><h1>VibeDesk</h1><div id="t">${t('Suche nach Updates …')}</div><div class="bar"><span id="s">·</span><span id="b">[----------]</span></div>
<script>var F='·:¦|',k=0,ind=true,pos=0;
function bar(p){var n=p>=100?10:Math.min(9,Math.max(p>0?1:0,Math.round(p/10)));return '['+'#'.repeat(n)+'-'.repeat(10-n)+']'}
setInterval(function(){k=(k+1)%4;document.getElementById('s').textContent=F[k];if(ind){pos=(pos+1)%13;var a='';for(var i=0;i<10;i++)a+=(i>=pos-3&&i<pos)?'#':'-';document.getElementById('b').textContent='['+a+']'}},200);
window.setView=function(v){document.getElementById('t').textContent=v.text;ind=v.percent===null;if(!ind)document.getElementById('b').textContent=bar(v.percent)}</script></body></html>`

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
      backgroundColor: '#10141f',
      title: 'VibeDesk',
      webPreferences: { sandbox: true, contextIsolation: true }
    })
    this.win.once('ready-to-show', () => this.win?.show())
    this.win.webContents.once('did-finish-load', () => {
      this.loaded = true
      if (this.last) this.set(this.last)
    })
    this.win.on('closed', () => (this.win = null))
    this.win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html()))
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

/** Wie lange VibeDesk höchstens wartet, bis das Brücken-Fensterchen steht */
const BRIDGE_READY_MS = 6000

/**
 * Überbrückt die Zeit, in der VibeDesk für den Installer schon beendet ist: ein eigenständiger
 * PowerShell-Prozess zeigt dasselbe Fensterchen, bis die neue Version ihr Fenster öffnet.
 * Das Skript wird nach %TEMP% kopiert, weil der Installer den Ressourcen-Ordner austauscht.
 * Wird erfüllt, sobald das Fensterchen sichtbar ist (oder nach spätestens 6 s) – erst dann darf VibeDesk enden.
 */
export async function showInstallBridge(script: string, version: string): Promise<void> {
  if (process.platform !== 'win32' || !fs.existsSync(script)) return
  let ready = ''
  try {
    const dir = join(os.tmpdir(), 'vibedesk-update')
    fs.mkdirSync(dir, { recursive: true })
    const copy = join(dir, 'update-splash.ps1')
    fs.copyFileSync(script, copy)
    ready = join(dir, `ready-${process.pid}-${Date.now()}.txt`)
    const ps = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    // Nicht detached: PowerShell braucht eine (versteckte) Konsole. Das Skript startet sich mit -Launch selbst
    // per Start-Process neu – dieser Enkelprozess liegt nicht mehr im Job von Electron und überlebt das Beenden.
    spawn(ps, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', copy, '-Launch', '-Version', version.replace(/[^\w.+-]/g, ''), '-Ready', ready], {
      stdio: 'ignore',
      windowsHide: true
    }).unref()
  } catch {
    return /* nur Anzeige – das Update läuft auch ohne */
  }
  const until = Date.now() + BRIDGE_READY_MS
  while (Date.now() < until && !fs.existsSync(ready)) await new Promise((r) => setTimeout(r, 100))
  fs.rmSync(ready, { force: true })
}

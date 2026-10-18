// Schnell-Prompt von überall: Strg+Alt+Leertaste öffnet über jeder App ein Eingabefeld, der Text geht an eine Claude-Session.
// Das Fenster hat keine Preload-Brücke – es meldet sich nur über seinen Titel (vd-send:/vd-close), mehr kann es nicht.
import { BrowserWindow, globalShortcut, screen } from 'electron'
import { getLang, t } from '../shared/i18n'

export const QUICK_SHORTCUT = 'Control+Alt+Space'
export const QUICK_MAX = 4000

export interface QuickTarget {
  id: string
  name: string
  status: string
}

/** Text sicher als JS-Literal ins Skript einsetzen */
const js = (s: string): string => JSON.stringify(s).replace(/</g, '\\u003c')

/** Erst beim Öffnen gebaut – dann steht die Sprache fest */
const html = (): string => `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:transparent;font:14px/1.4 'Segoe UI',system-ui,sans-serif;color:#e8ecf3;overflow:hidden}
.box{position:absolute;inset:6px;display:flex;flex-direction:column;gap:6px;padding:12px 14px;border-radius:16px;background:rgba(14,17,26,.96);border:1px solid rgba(159,184,255,.35);box-shadow:0 18px 50px rgba(0,0,0,.55)}
.row{display:flex;align-items:center;gap:10px}
.orb{flex:none;width:22px;height:22px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#c7d4ff,#5865f2 60%,#1d2150);box-shadow:0 0 14px rgba(88,101,242,.6)}
input{flex:1;background:transparent;border:0;outline:0;color:#fff;font:inherit;font-size:17px}
input::placeholder{color:rgba(232,236,243,.4)}
.meta{display:flex;gap:8px;align-items:center;font-size:11.5px;color:rgba(232,236,243,.55)}
.chip{padding:1px 8px;border-radius:999px;background:rgba(159,184,255,.15);color:#c7d4ff}
.chip.working{background:rgba(74,222,128,.15);color:#bbf7d0}
.chip.waiting{background:rgba(250,204,21,.15);color:#fde68a}
kbd{font:10.5px ui-monospace,monospace;padding:0 4px;border-radius:4px;border:1px solid rgba(255,255,255,.18)}
</style></head><body><div class="box"><div class="row"><div class="orb"></div><input id="q" maxlength="${QUICK_MAX}" placeholder="${t('Was soll Claude tun?')}" autofocus></div>
<div class="meta"><span>${t('an')}</span><span id="t" class="chip">–</span><span style="flex:1"></span><span>${t('<kbd>Tab</kbd> Session · <kbd>Enter</kbd> senden · <kbd>Esc</kbd> zu')}</span></div></div>
<script>
let targets=[],i=0;const q=document.getElementById('q'),t=document.getElementById('t');
const label={working:${js(t('arbeitet – wird vorgemerkt'))},waiting:${js(t('wartet – wird vorgemerkt'))},done:${js(t('fertig'))},idle:${js(t('bereit'))},error:${js(t('Fehler'))}};
function draw(){const x=targets[i];t.textContent=x?x.name+' · '+(label[x.status]||x.status):${js(t('neue Session im letzten Projekt'))};t.className='chip '+(x?x.status:'')}
window.setTargets=function(l){const cur=targets[i]&&targets[i].id;targets=l;i=Math.max(0,l.findIndex(x=>x.id===cur));draw()};
window.reset=function(){q.value='';i=0;draw();q.focus()};
q.addEventListener('keydown',e=>{
if(e.key==='Escape'){document.title='vd-close:'+Date.now()}
else if(e.key==='Tab'){e.preventDefault();if(targets.length){i=(i+(e.shiftKey?targets.length-1:1))%targets.length;draw()}}
else if(e.key==='Enter'&&q.value.trim()){document.title='vd-send:'+JSON.stringify({text:q.value,id:targets[i]?targets[i].id:null,n:Date.now()})}
});draw();
</script></body></html>`

/** Titel des Fensters → Aktion (getrennt, damit es testbar ist) */
export function parseQuickTitle(title: string): { kind: 'close' } | { kind: 'send'; text: string; id: string | null } | null {
  if (title.startsWith('vd-close:')) return { kind: 'close' }
  if (!title.startsWith('vd-send:')) return null
  try {
    const j = JSON.parse(title.slice('vd-send:'.length)) as { text?: unknown; id?: unknown }
    if (typeof j.text !== 'string' || !j.text.trim()) return null
    return { kind: 'send', text: j.text.slice(0, QUICK_MAX), id: typeof j.id === 'string' ? j.id : null }
  } catch {
    return null
  }
}

export class QuickPrompt {
  private win: BrowserWindow | null = null
  private targets: QuickTarget[] = []
  private registered = false

  constructor(private onSend: (text: string, sessionId: string | null) => void) {}

  /** an/aus – liefert false, wenn das Kürzel schon von einer anderen App belegt ist */
  configure(enabled: boolean): boolean {
    if (enabled === this.registered) return true
    if (!enabled) {
      globalShortcut.unregister(QUICK_SHORTCUT)
      this.registered = false
      this.win?.hide()
      return true
    }
    this.registered = globalShortcut.register(QUICK_SHORTCUT, () => this.toggle())
    return this.registered
  }

  setTargets(list: QuickTarget[]): void {
    this.targets = list.slice(0, 20)
    this.push()
  }

  private push(): void {
    if (this.win && !this.win.isDestroyed()) void this.win.webContents.executeJavaScript(`window.setTargets && setTargets(${JSON.stringify(this.targets)})`).catch(() => undefined)
  }

  private create(): BrowserWindow {
    const w = new BrowserWindow({
      width: 640,
      height: 112,
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      title: t('VibeDesk Schnell-Prompt'),
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, devTools: false }
    })
    w.setAlwaysOnTop(true, 'pop-up-menu')
    w.on('page-title-updated', (e, title) => {
      e.preventDefault()
      const a = parseQuickTitle(title)
      if (!a) return
      if (a.kind === 'send') this.onSend(a.text, a.id)
      w.hide()
    })
    w.on('blur', () => w.hide())
    w.on('closed', () => (this.win = null))
    // nichts nachladen oder öffnen lassen
    w.webContents.on('will-navigate', (e) => e.preventDefault())
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    w.webContents.once('did-finish-load', () => this.push())
    void w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html()))
    return w
  }

  toggle(): void {
    if (this.win?.isVisible()) return this.win.hide()
    const w = this.win && !this.win.isDestroyed() ? this.win : (this.win = this.create())
    // dort öffnen, wo die Maus ist – im oberen Drittel
    const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const [ww, wh] = w.getSize()
    w.setPosition(Math.round(d.x + (d.width - ww) / 2), Math.round(d.y + d.height * 0.28 - wh / 2))
    void w.webContents.executeJavaScript('window.reset && reset()').catch(() => undefined)
    this.push()
    w.show()
    w.focus()
  }

  dispose(): void {
    if (this.registered) globalShortcut.unregister(QUICK_SHORTCUT)
    this.registered = false
    if (this.win && !this.win.isDestroyed()) this.win.destroy()
  }
}

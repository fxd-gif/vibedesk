// Zweiter Bildschirm (Beta): ein ruhiges Zweitfenster auf einem anderen Monitor zeigt einzelne Werkzeug-Fenster – Sessions, Hooks und Audio bleiben im Hauptfenster.
import { app, BrowserWindow, ipcMain, screen, shell, type WebContents } from 'electron'
import { t } from '../shared/i18n'
import { cleanAction, cleanItem, moveItem, persisted, pickDisplay, restoreItems, type ScreenItem, type ScreenState } from '../shared/secondScreen'
import { logError } from './errorLog'
import type { SettingsStore } from './settingsStore'

export interface SecondScreenDeps {
  main: () => BrowserWindow | null
  settings: SettingsStore
  preload: string
  /** lädt den Renderer im Zweitfenster-Modus (#second) */
  load: (win: BrowserWindow) => void
}

export class SecondScreen {
  private win: BrowserWindow | null = null
  private items: ScreenItem[]
  /** Monitor, auf dem das Zweitfenster steht (bzw. zuletzt stand) */
  private displayId: number | null = null
  /** App endet: Zweitfenster geht zu, die gemerkten Fenster bleiben für den nächsten Start */
  private ending = false
  /** zuletzt gemeldet: gibt es einen zweiten Monitor? (nur Änderungen melden) */
  private told = false

  constructor(private d: SecondScreenDeps) {
    // ohne zweiten Monitor bleibt alles im Hauptfenster – dort stehen die Fenster ohnehin in visiblePanels
    this.items = restoreItems(d.settings.get().secondScreen, this.target() !== null)
    this.save()
    this.told = this.state().available
  }

  window(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null
  }

  state(): ScreenState {
    return { available: !!this.window() || this.target() !== null, open: !!this.window(), items: this.items }
  }

  register(): void {
    ipcMain.handle('screen:state', () => this.state())
    ipcMain.on('screen:open', (e) => {
      if (this.isMain(e.sender)) this.open()
    })
    ipcMain.on('screen:close', () => this.close())
    // hinüber nur aus dem Hauptfenster, zurück bzw. zu aus beiden
    ipcMain.on('screen:move', (e, id: unknown, to: unknown, url: unknown) => {
      if (to !== 'second' || this.isMain(e.sender)) this.move(id, to, url)
    })
    // Zweitfenster → Hauptfenster: nur geprüfte Aufträge
    ipcMain.on('screen:relay', (e, raw: unknown) => {
      if (!this.isSecond(e.sender)) return
      const a = cleanAction(raw)
      if (!a) return
      this.toMain('screen:action', a)
      // Terminal, Editor oder ein anderes Fenster im Hauptfenster gewünscht: dort geht es mit der Tastatur weiter
      const m = this.d.main()
      if ((a.kind === 'focus' || a.kind === 'open' || a.kind === 'editor') && m && !m.isDestroyed() && m.isVisible()) m.focus()
    })
    // Hauptfenster → Zweitfenster: Sessions, Vorhang, Ablauf
    ipcMain.on('screen:mirror', (e, m: unknown) => {
      if (this.isMain(e.sender) && m && typeof m === 'object') this.toSecond('screen:mirror', m)
    })
    ipcMain.on('screen:ready', (e) => {
      if (this.isSecond(e.sender)) this.toMain('screen:hello')
    })
    // Klick im Hauptfenster auf ein Fenster, das drüben ist: dort nach vorn holen, ohne den Fokus zu stehlen
    ipcMain.on('screen:focus', (e, id: unknown) => {
      const w = this.window()
      if (!w || !this.isMain(e.sender) || typeof id !== 'string' || !this.items.some((x) => x.id === id)) return
      if (!w.isVisible()) w.showInactive()
      w.moveTop()
      w.webContents.send('screen:focus', id)
    })
    screen.on('display-added', () => this.displaysChanged())
    screen.on('display-removed', () => this.displaysChanged())
    screen.on('display-metrics-changed', () => this.displaysChanged())
    app.on('before-quit', () => (this.ending = true))
  }

  /** Start: gemerkte Fenster wieder hinüber, sobald das Hauptfenster steht */
  restore(): void {
    if (!this.items.length || this.window()) return
    if (!this.open()) this.giveBack()
  }

  /** Hauptfenster versteckt (Infobereich) bzw. wieder da */
  hide(): void {
    this.window()?.hide()
  }

  show(): void {
    const w = this.window()
    if (w && !w.isVisible()) w.showInactive()
  }

  /** Hauptfenster ist weg: Zweitfenster mit schließen, gemerkte Fenster behalten */
  shutdown(): void {
    this.ending = true
    this.window()?.destroy()
  }

  /** zusätzlich ans Zweitfenster (siehe SECOND_CHANNELS) */
  toSecond(ch: string, ...args: unknown[]): void {
    this.window()?.webContents.send(ch, ...args)
  }

  open(): boolean {
    if (this.window()) return true
    const d = this.target()
    if (!d) return false
    this.displayId = d.id
    const w = new BrowserWindow({
      x: d.workArea.x,
      y: d.workArea.y,
      width: d.workArea.width,
      height: d.workArea.height,
      frame: false,
      show: false,
      backgroundColor: '#07090d',
      autoHideMenuBar: true,
      title: t('VibeDesk – zweiter Bildschirm'),
      webPreferences: { preload: this.d.preload, sandbox: true, contextIsolation: true, webviewTag: true }
    })
    this.win = w
    w.on('page-title-updated', (e) => e.preventDefault())
    w.once('ready-to-show', () => {
      if (w.isDestroyed()) return
      // nach dem Laden noch einmal setzen – bei Monitoren mit anderer Skalierung stimmt die Größe sonst nicht
      w.setBounds(d.workArea)
      // Hauptfenster gerade im Infobereich? Dann kommt das Zweitfenster mit ihm zurück
      if (this.d.main()?.isVisible() !== false) w.showInactive()
    })
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/.test(url)) shell.openExternal(url)
      return { action: 'deny' }
    })
    const page = (u: string): string => u.replace(/[?#].*$/, '')
    const stay = (ev: Electron.Event, url: string): void => {
      if (page(url) === page(w.webContents.getURL())) return
      ev.preventDefault()
      if (/^https?:/.test(url)) shell.openExternal(url)
    }
    w.webContents.on('will-navigate', stay)
    w.webContents.on('will-redirect', stay)
    w.webContents.on('render-process-gone', (_e, info) => {
      logError('Zweiter Bildschirm', info.reason)
      if (info.reason !== 'clean-exit' && !w.isDestroyed()) w.reload()
    })
    w.on('closed', () => this.closed(w))
    this.d.load(w)
    this.changed()
    return true
  }

  /** Zweitfenster zu – alle Fenster kommen zurück ins Hauptfenster */
  close(): void {
    const w = this.window()
    if (w) w.close()
    else this.giveBack()
  }

  move(rawId: unknown, to: unknown, url?: unknown): void {
    const item = cleanItem({ id: rawId, url })
    if (!item) return
    if (to === 'second') {
      if (!this.open()) return
      this.items = moveItem(this.items, item, 'second')
      this.changed()
      return
    }
    if ((to !== 'main' && to !== 'closed') || !this.items.some((x) => x.id === item.id)) return
    this.items = moveItem(this.items, item, to)
    this.changed(to === 'main' ? [item] : undefined)
    // leer bleibt nichts auf dem anderen Monitor stehen
    if (!this.items.length) this.window()?.close()
  }

  private closed(w: BrowserWindow): void {
    if (this.win !== w) return
    this.win = null
    if (this.ending) return
    this.giveBack()
  }

  private giveBack(): void {
    const back = this.items
    this.items = []
    this.changed(back)
  }

  private displaysChanged(): void {
    const w = this.window()
    if (w) {
      const mine = screen.getAllDisplays().find((x) => x.id === this.displayId)
      // Monitor abgezogen (oder das Hauptfenster steht jetzt dort): Zweitfenster zu, Fenster zurück
      if (!mine || mine.id === this.mainDisplay()) {
        w.close()
        return
      }
      const b = w.getBounds()
      const a = mine.workArea
      if (b.x !== a.x || b.y !== a.y || b.width !== a.width || b.height !== a.height) w.setBounds(a)
    }
    // Monitor dazu oder weg: Knöpfe erscheinen bzw. verschwinden – sonst bleibt es still
    if (this.state().available !== this.told) this.changed()
  }

  private changed(returned?: ScreenItem[]): void {
    this.save()
    const s = this.state()
    this.told = s.available
    this.toMain('screen:state', returned?.length ? { ...s, returned } : s)
    this.toSecond('screen:state', s)
  }

  private save(): void {
    const panels = persisted(this.items)
    const cur = this.d.settings.get().secondScreen?.panels ?? []
    if (panels.length !== cur.length || panels.some((p, i) => p !== cur[i])) this.d.settings.set({ secondScreen: { panels } })
  }

  private mainDisplay(): number {
    const m = this.d.main()
    return m && !m.isDestroyed() ? screen.getDisplayMatching(m.getBounds()).id : screen.getPrimaryDisplay().id
  }

  private target(): Electron.Display | null {
    return pickDisplay(screen.getAllDisplays(), this.mainDisplay(), this.displayId)
  }

  private isMain(c: WebContents): boolean {
    const m = this.d.main()
    return !!m && !m.isDestroyed() && m.webContents === c
  }

  private isSecond(c: WebContents): boolean {
    return this.window()?.webContents === c
  }

  private toMain(ch: string, ...args: unknown[]): void {
    const m = this.d.main()
    if (m && !m.isDestroyed()) m.webContents.send(ch, ...args)
  }
}

// Tray-Symbol: Punkt in der Farbe der dringendsten Session, Menü mit allen Sessions und offenen Freigaben.
// Dazu ein Punkt am Taskleisten-Symbol, solange jemand wartet.
import { Menu, nativeImage, Tray, type BrowserWindow, type MenuItemConstructorOptions, type NativeImage } from 'electron'
import { t } from '../shared/i18n'
import type { PermissionAsk, PermissionDecision } from '../shared/permissions'
import { cleanTrayList, dotColor, paintDot, trayCounts, trayState, type TraySession } from '../shared/tray'
import type { SessionStatus } from '../shared/types'

interface Deps {
  iconFile: string
  win(): BrowserWindow | null
  /** Fenster nach vorn, optional mit dieser Session oben */
  show(sessionId?: string): void
  answer(id: string, decision: PermissionDecision): void
  quit(): void
}

const LABEL: Record<SessionStatus, string> = {
  waiting: 'wartet auf dich',
  working: 'arbeitet',
  done: 'fertig',
  error: 'Fehler',
  idle: 'bereit'
}
const MARK: Record<SessionStatus, string> = { waiting: '●', working: '◐', done: '✓', error: '✕', idle: '○' }

export class TrayService {
  private tray: Tray | null = null
  private sessions: TraySession[] = []
  private asks: PermissionAsk[] = []
  private base: NativeImage
  private icons = new Map<SessionStatus, NativeImage>()
  private lastBadge: boolean | null = null

  constructor(private d: Deps) {
    this.base = nativeImage.createFromPath(d.iconFile)
  }

  start(): void {
    if (this.tray) return
    this.tray = new Tray(this.icon('idle'))
    this.tray.on('click', () => this.d.show())
    this.render()
  }

  stop(): void {
    this.tray?.destroy()
    this.tray = null
    const w = this.d.win()
    if (w && !w.isDestroyed()) w.setOverlayIcon(null, '')
  }

  /** letzter Stand vom Renderer – auch wenn das Symbol aus ist */
  list(): TraySession[] {
    return this.sessions
  }

  setSessions(list: unknown): void {
    this.sessions = cleanTrayList(list)
    this.render()
  }

  setAsks(list: PermissionAsk[]): void {
    this.asks = list
    this.render()
  }

  /** App-Symbol mit Punkt; ohne Punkt bei „bereit“ */
  private icon(s: SessionStatus, size = 32): NativeImage {
    const hit = size === 32 ? this.icons.get(s) : undefined
    if (hit) return hit
    const img = this.base.isEmpty() ? nativeImage.createEmpty() : this.base.resize({ width: size, height: size, quality: 'best' })
    const rgb = dotColor(s)
    let out = img
    if (rgb) {
      const bmp = img.isEmpty() ? new Uint8Array(size * size * 4) : new Uint8Array(img.toBitmap())
      out = nativeImage.createFromBitmap(Buffer.from(paintDot(bmp, size, rgb)), { width: size, height: size })
    }
    if (size === 32) this.icons.set(s, out)
    return out
  }

  /** nur der Punkt – fürs Taskleisten-Symbol */
  private badge(s: SessionStatus): NativeImage | null {
    const rgb = dotColor(s)
    if (!rgb) return null
    const size = 16
    return nativeImage.createFromBitmap(Buffer.from(paintDot(new Uint8Array(size * size * 4), size, rgb)), { width: size, height: size })
  }

  private render(): void {
    const state = trayState(this.sessions)
    // Taskleiste: nur wer wartet, bekommt einen Punkt – sonst wäre er ständig da
    const w = this.d.win()
    const waiting = state === 'waiting' || this.asks.length > 0
    if (w && !w.isDestroyed() && waiting !== this.lastBadge) {
      w.setOverlayIcon(waiting ? this.badge('waiting') : null, waiting ? t('Claude wartet auf dich') : '')
      this.lastBadge = waiting
    }
    if (!this.tray) return
    this.tray.setImage(this.icon(this.asks.length ? 'waiting' : state))
    this.tray.setToolTip(this.tooltip())
    this.tray.setContextMenu(Menu.buildFromTemplate(this.menu()))
  }

  private tooltip(): string {
    const c = trayCounts(this.sessions)
    const parts: string[] = []
    if (this.asks.length) parts.push(t('{n} Freigaben offen', { n: this.asks.length }))
    if (c.waiting) parts.push(t('{n} wartet auf dich', { n: c.waiting }))
    if (c.working) parts.push(t('{n} arbeitet', { n: c.working }))
    if (c.done) parts.push(t('{n} fertig', { n: c.done }))
    return parts.length ? `VibeDesk – ${parts.join(' · ')}` : 'VibeDesk'
  }

  private menu(): MenuItemConstructorOptions[] {
    const items: MenuItemConstructorOptions[] = []
    const name = (id: string): string => this.sessions.find((s) => s.id === id)?.name ?? 'Claude'
    for (const a of this.asks.slice(0, 5)) {
      items.push({
        label: `${name(a.sessionId)}: ${a.summary}`.slice(0, 90),
        submenu: [
          ...(a.detail ? [{ label: a.detail.slice(0, 120), enabled: false }] : []),
          { type: 'separator' },
          { label: t('Erlauben'), click: () => this.d.answer(a.id, 'allow') },
          ...(a.canAlways ? [{ label: t('Immer erlauben'), click: () => this.d.answer(a.id, 'always') }] : []),
          { label: t('Ablehnen'), click: () => this.d.answer(a.id, 'deny') },
          { type: 'separator' },
          { label: t('In VibeDesk ansehen'), click: () => this.d.show(a.sessionId) }
        ] as MenuItemConstructorOptions[]
      })
    }
    if (items.length) items.push({ type: 'separator' })
    if (!this.sessions.length) items.push({ label: t('Keine Sessions offen'), enabled: false })
    for (const s of this.sessions) items.push({ label: `${MARK[s.status]}  ${s.name} – ${t(LABEL[s.status])}`, click: () => this.d.show(s.id) })
    items.push({ type: 'separator' }, { label: t('VibeDesk zeigen'), click: () => this.d.show() }, { label: t('Beenden'), click: () => this.d.quit() })
    return items
  }
}

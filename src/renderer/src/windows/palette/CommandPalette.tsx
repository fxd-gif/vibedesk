import { addonCommands, runCommand } from '../../addons/runtime'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { api } from '../../api'
import { Icon } from '../../desktop/icons'
import { toggleMusic } from '../../ambience/toggles'
import { openEditor } from '../../store/editorStore'
import { useSettings } from '../../store/settingsStore'
import { kindOf, useSessions } from '../../store/sessionStore'
import { useShells } from '../../store/shellStore'
import { centeredRect, useUi } from '../../store/uiStore'
import type { PanelId, Project } from '../../../../shared/types'
import { INSPECTOR_TABS, useInspector, type InspectorTab } from '../InspectorWindow'
import { useAddonUi } from '../addons/AddonWindow'
import { pickAndInstall } from '../addons/InstallDialog'
import { panelDef } from '../panels'
import { rank } from './fuzzy'
import { showWhatsNew } from '../../changelog/WhatsNew'
import { showWrapped } from '../../wrapped/VibeWrapped'
import { findShareCode } from '../../../../shared/shareCode'
import { openPaste, sharePrompts, startImport } from '../../store/shareStore'
import { redactText, toggleCurtain } from '../../store/streamerStore'
import { t } from '../../../../shared/i18n'

interface Cmd {
  id: string
  label: string
  group: string
  icon: string
  hint?: string
  /** nur bei Suche zeigen (hält die Startliste kurz) */
  searchOnly?: boolean
  run(): void
}

export const usePalette = create<{ open: boolean; show(v: boolean): void }>((set) => ({ open: false, show: (open) => set({ open }) }))

export function openPanel(id: PanelId): void {
  const def = panelDef(id)
  if (!def) return
  const ui = useUi.getState()
  ui.openWin(id, centeredRect(def.w, def.h))
  ui.focus(id)
}

function openInspector(tab: InspectorTab): void {
  useInspector.getState().setTab(tab)
  openPanel('inspector')
}

function buildCommands(projects: Project[]): Cmd[] {
  const s = useSettings.getState().s
  const win = (id: PanelId, hint?: string): Cmd => {
    const d = panelDef(id)!
    return { id: 'win:' + id, label: d.title, group: t('Fenster'), icon: d.icon, hint, run: () => openPanel(id) }
  }
  return [
    win('projects'),
    { id: 'win:editor', label: t('Editor'), group: t('Fenster'), icon: 'code', run: () => void openEditor() },
    win('inspector', t('Status · Feed · Todos · Agents · Stats')),
    ...INSPECTOR_TABS.map(
      (tab): Cmd => ({ id: 'insp:' + tab.id, label: t('Session-Inspector: {tab}', { tab: tab.label }), group: t('Fenster'), icon: 'inspect', searchOnly: true, run: () => openInspector(tab.id) })
    ),
    win('git', t('Änderungen, Commits, Push & Pull, GitHub')),
    win('brain', t('Projektgedächtnis von Claude als Graph')),
    win('prompts'),
    win('skills'),
    win('focus'),
    win('discord'),
    win('addons', t('Eigene Addons bauen, importieren, exportieren')),
    { id: 'act:addonImport', label: t('Addon importieren…'), group: t('Aktionen'), icon: 'puzzle', run: () => void pickAndInstall() },
    { id: 'act:addonMaker', label: t('Neues Addon bauen'), group: t('Aktionen'), icon: 'puzzle', run: () => (useAddonUi.getState().newAddon(), openPanel('addons')) },
    win('lounge', t('Mit Freunden vibecoden – ohne Server')),
    win('streamer', t('Schutz, OBS-Overlay, Twitch-Chat')),
    win('companion', t('Freigaben, Vorschläge und Prompts vom Handy')),
    ...addonCommands().map((c): Cmd => ({ id: 'macro:' + c.name, label: t('Makro: {name}', { name: c.name }), group: t('Makros'), icon: 'puzzle', hint: c.addon, run: () => runCommand(c.name) })),
    ...projects
      .filter((p) => !p.missing)
      .map((p): Cmd => ({ id: 'proj:' + p.id, label: t('Session starten: {name}', { name: p.name }), group: t('Projekte'), icon: 'play', hint: redactText(p.path), run: () => void useSessions.getState().start(p.id) })),
    ...projects
      .filter((p) => !p.missing)
      .map((p): Cmd => ({ id: 'shell:' + p.id, label: t('Shell öffnen: {name}', { name: p.name }), group: t('Projekte'), icon: 'terminal', hint: t('PowerShell im Projektordner'), searchOnly: true, run: () => void useShells.getState().open(p.id) })),
    { id: 'act:paste', label: t('Share-Code einfügen …'), group: t('Teilen'), icon: 'share', hint: t('Prompts, Skills, Atmosphären'), run: openPaste },
    ...(s?.prompts.length ? [{ id: 'act:sharePrompts', label: t('Alle Prompts als Code teilen'), group: t('Teilen'), icon: 'share', searchOnly: true, run: () => sharePrompts(s.prompts) }] : []),
    { id: 'act:curtain', label: t('Vorhang zuziehen'), group: t('Aktionen'), icon: 'eyeoff', hint: t('Strg+Umschalt+H'), searchOnly: true, run: () => toggleCurtain(true) },
    { id: 'act:arrange', label: t('Fenster anordnen'), group: t('Aktionen'), icon: 'grid', run: () => useUi.getState().arrangeAll(kindOf) },
    ...(s ? [{ id: 'act:music', label: s.musicOn ? t('Lofi-Radio aus') : t('Lofi-Radio an'), group: t('Aktionen'), icon: 'music', run: () => useSettings.getState().set(toggleMusic(s)) }] : []),
    { id: 'act:fullscreen', label: t('Vollbild umschalten'), group: t('Aktionen'), icon: 'exit', hint: t('F11 · Esc halten'), run: () => api.app.toggleFullscreen() },
    { id: 'act:quick', label: t('Schnell-Prompt öffnen'), group: t('Aktionen'), icon: 'send', hint: t('Strg+Alt+Leertaste, auch in anderen Apps'), run: () => api.quick.open() },
    { id: 'act:wrapped', label: t('Vibe Wrapped – deine Woche'), group: t('Aktionen'), icon: 'stats', hint: t('Rückblick als teilbares Bild'), run: () => void showWrapped() },
    { id: 'act:news', label: t('Was ist neu?'), group: t('Aktionen'), icon: 'spark', run: showWhatsNew },
    { id: 'act:update', label: t('Nach Updates suchen'), group: t('Aktionen'), icon: 'restart', run: () => void api.update.check() },
    { id: 'act:quit', label: t('VibeDesk beenden'), group: t('Aktionen'), icon: 'exit', run: () => api.app.quit() }
  ]
}

export function CommandPalette(): React.JSX.Element | null {
  const open = usePalette((s) => s.open)
  return open ? <PaletteBox /> : null
}

function PaletteBox(): React.JSX.Element {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const listRef = useRef<HTMLUListElement>(null)
  const close = (): void => usePalette.getState().show(false)

  useEffect(() => {
    api.projects.list().then(setProjects)
  }, [])

  const all = useMemo(() => buildCommands(projects), [projects])
  const items = useMemo(() => {
    // eingefügter Share-Code → direkt öffnen
    const code = findShareCode(q.replace(/\s+/g, ''))
    if (code) return [{ id: 'act:importCode', label: t('Share-Code öffnen'), group: t('Teilen'), icon: 'share', hint: t('Vorschau ansehen'), run: () => void startImport(code) }]
    return q.trim() ? rank(all, q, (c) => `${c.label} ${c.group}`) : all.filter((c) => !c.searchOnly)
  }, [all, q])
  const cur = Math.min(idx, items.length - 1)

  useEffect(() => setIdx(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' })
  }, [cur])

  const run = (c: Cmd | undefined): void => {
    if (!c) return
    close()
    c.run()
  }

  return (
    <div className="pal-backdrop" onPointerDown={(e) => e.target === e.currentTarget && close()}>
      <div className="pal" role="dialog" aria-label={t('Befehle')} data-testid="palette">
        <div className="pal-input">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            placeholder={t('Fenster, Projekt oder Aktion …')}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') close()
              else if (e.key === 'ArrowDown') (e.preventDefault(), setIdx((i) => Math.min(i + 1, items.length - 1)))
              else if (e.key === 'ArrowUp') (e.preventDefault(), setIdx((i) => Math.max(i - 1, 0)))
              else if (e.key === 'Enter') (e.preventDefault(), run(items[cur]))
            }}
            data-testid="palette-input"
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="pal-list" ref={listRef}>
          {!items.length && <li className="pal-empty">{t('Nichts gefunden.')}</li>}
          {items.map((c, i) => (
            <li key={c.id}>
              {(i === 0 || items[i - 1].group !== c.group) && !q.trim() && <div className="pal-group">{c.group}</div>}
              <button className={`pal-item${i === cur ? ' on' : ''}`} onPointerMove={() => i !== cur && setIdx(i)} onClick={() => run(c)} data-testid="palette-item">
                <Icon name={c.icon} size={15} />
                <span className="pal-label">{c.label}</span>
                {c.hint && <span className="pal-hint">{c.hint}</span>}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

let wired = false
export function wirePalette(): void {
  if (wired) return
  wired = true
  window.addEventListener(
    'keydown',
    (e) => {
      const inTerminal = !!(e.target as HTMLElement | null)?.closest?.('.xterm')
      const k = e.key.toLowerCase()
      // Strg+Shift+P überall, Ctrl+K außerhalb der Terminals (dort löscht es in Claude Code bis Zeilenende)
      const hit = e.ctrlKey && !e.altKey && ((e.shiftKey && k === 'p') || (!e.shiftKey && k === 'k' && !inTerminal))
      if (!hit) return
      e.preventDefault()
      e.stopPropagation()
      usePalette.getState().show(!usePalette.getState().open)
    },
    true
  )
}

import { addonCommands, runCommand } from '../../addons/runtime'
import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { api } from '../../api'
import { Icon } from '../../desktop/icons'
import { toggleMusic } from '../../ambience/toggles'
import { openEditor } from '../../store/editorStore'
import { useSettings } from '../../store/settingsStore'
import { kindOf, useSessions } from '../../store/sessionStore'
import { centeredRect, useUi } from '../../store/uiStore'
import type { PanelId, Project } from '../../../../shared/types'
import { INSPECTOR_TABS, useInspector, type InspectorTab } from '../InspectorWindow'
import { useAddonUi } from '../addons/AddonWindow'
import { pickAndInstall } from '../addons/InstallDialog'
import { panelDef } from '../panels'
import { rank } from './fuzzy'
import { showWhatsNew } from '../../changelog/WhatsNew'
import { findShareCode } from '../../../../shared/shareCode'
import { openPaste, sharePrompts, startImport } from '../../store/shareStore'
import { redactText, toggleCurtain } from '../../store/streamerStore'

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

function buildCommands(projects: Project[], onAmbience: () => void): Cmd[] {
  const s = useSettings.getState().s
  const win = (id: PanelId, hint?: string): Cmd => {
    const d = panelDef(id)!
    return { id: 'win:' + id, label: d.title, group: 'Fenster', icon: d.icon, hint, run: () => openPanel(id) }
  }
  return [
    win('projects'),
    { id: 'win:editor', label: 'Editor', group: 'Fenster', icon: 'code', run: () => void openEditor() },
    win('inspector', 'Status · Feed · Todos · Agents · Stats'),
    ...INSPECTOR_TABS.map(
      (t): Cmd => ({ id: 'insp:' + t.id, label: `Session-Inspector: ${t.label}`, group: 'Fenster', icon: 'inspect', searchOnly: true, run: () => openInspector(t.id) })
    ),
    win('git', 'Änderungen, Commits, Push & Pull, GitHub'),
    win('brain', 'Projektgedächtnis von Claude als Graph'),
    win('prompts'),
    win('skills'),
    win('focus'),
    win('discord'),
    win('addons', 'Eigene Addons bauen, importieren, exportieren'),
    { id: 'act:addonImport', label: 'Addon importieren…', group: 'Aktionen', icon: 'puzzle', run: () => void pickAndInstall() },
    { id: 'act:addonMaker', label: 'Neues Addon bauen', group: 'Aktionen', icon: 'puzzle', run: () => (useAddonUi.getState().newAddon(), openPanel('addons')) },
    win('lounge', 'Mit Freunden vibecoden – ohne Server'),
    win('streamer', 'Schutz, OBS-Overlay, Twitch-Chat'),
    ...addonCommands().map((c): Cmd => ({ id: 'macro:' + c.name, label: `Makro: ${c.name}`, group: 'Makros', icon: 'puzzle', hint: c.addon, run: () => runCommand(c.name) })),
    ...projects
      .filter((p) => !p.missing)
      .map((p): Cmd => ({ id: 'proj:' + p.id, label: `Session starten: ${p.name}`, group: 'Projekte', icon: 'play', hint: redactText(p.path), run: () => void useSessions.getState().start(p.id) })),
    { id: 'act:paste', label: 'Share-Code einfügen …', group: 'Teilen', icon: 'share', hint: 'Prompts, Skills, Atmosphären', run: openPaste },
    ...(s?.prompts.length ? [{ id: 'act:sharePrompts', label: 'Alle Prompts als Code teilen', group: 'Teilen', icon: 'share', searchOnly: true, run: () => sharePrompts(s.prompts) }] : []),
    { id: 'act:curtain', label: 'Vorhang zuziehen', group: 'Aktionen', icon: 'eyeoff', hint: 'Strg+Umschalt+H', searchOnly: true, run: () => toggleCurtain(true) },
    { id: 'act:arrange', label: 'Fenster anordnen', group: 'Aktionen', icon: 'grid', run: () => useUi.getState().arrangeAll(kindOf) },
    { id: 'act:ambience', label: 'Atmosphäre & Musik einstellen', group: 'Aktionen', icon: 'rain', run: onAmbience },
    ...(s ? [{ id: 'act:music', label: s.musicOn ? 'Lofi-Radio aus' : 'Lofi-Radio an', group: 'Aktionen', icon: 'music', run: () => useSettings.getState().set(toggleMusic(s)) }] : []),
    { id: 'act:fullscreen', label: 'Vollbild umschalten', group: 'Aktionen', icon: 'exit', hint: 'F11 · Esc halten', run: () => api.app.toggleFullscreen() },
    { id: 'act:news', label: 'Was ist neu?', group: 'Aktionen', icon: 'spark', run: showWhatsNew },
    { id: 'act:update', label: 'Nach Updates suchen', group: 'Aktionen', icon: 'restart', run: () => void api.update.check() },
    { id: 'act:quit', label: 'VibeDesk beenden', group: 'Aktionen', icon: 'exit', run: () => api.app.quit() }
  ]
}

export function CommandPalette({ onAmbience }: { onAmbience(): void }): React.JSX.Element | null {
  const open = usePalette((s) => s.open)
  return open ? <PaletteBox onAmbience={onAmbience} /> : null
}

function PaletteBox({ onAmbience }: { onAmbience(): void }): React.JSX.Element {
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const [projects, setProjects] = useState<Project[]>([])
  const listRef = useRef<HTMLUListElement>(null)
  const close = (): void => usePalette.getState().show(false)

  useEffect(() => {
    api.projects.list().then(setProjects)
  }, [])

  const all = useMemo(() => buildCommands(projects, onAmbience), [projects, onAmbience])
  const items = useMemo(() => {
    // eingefügter Share-Code → direkt öffnen
    const code = findShareCode(q.replace(/\s+/g, ''))
    if (code) return [{ id: 'act:importCode', label: 'Share-Code öffnen', group: 'Teilen', icon: 'share', hint: 'Vorschau ansehen', run: () => void startImport(code) }]
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
      <div className="pal" role="dialog" aria-label="Befehle" data-testid="palette">
        <div className="pal-input">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            placeholder="Fenster, Projekt oder Aktion …"
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
          {!items.length && <li className="pal-empty">Nichts gefunden.</li>}
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

// Werkzeug-Fenster von Claude: Liste, Öffnen und die lesende Datenbrücke (Sessions, Gehirn, Verbrauch, Projekt).
import { create } from 'zustand'
import { api } from '../api'
import { appWin, type AppDataKind, type DeskApp } from '../../../shared/apps'
import { agentOf } from '../../../shared/agents'
import { activeProjectId } from './activeProject'
import { useSessions } from './sessionStore'
import { useStats } from './statsStore'
import { centeredRect, useUi } from './uiStore'
import { useWorkflow } from './workflowStore'
import { doingOf } from './workflowReducer'

export const useApps = create<{ list: DeskApp[] }>(() => ({ list: [] }))

export const appOf = (id: string): DeskApp | undefined => useApps.getState().list.find((a) => a.id === id)

export function openApp(id: string): void {
  const a = appOf(id)
  const ui = useUi.getState()
  ui.openWin(appWin(id), centeredRect(a?.w ?? 560, a?.h ?? 440))
  ui.focus(appWin(id))
}

let wired = false
export function wireApps(): void {
  if (wired) return
  wired = true
  void api.apps.list().then((list) => useApps.setState({ list }))
  api.on.appsChanged((list) => {
    useApps.setState({ list })
    // gelöschte Fenster schließen
    const ui = useUi.getState()
    for (const w of ui.open) if (w.startsWith('app:') && !list.some((a) => appWin(a.id) === w)) ui.closeWin(w)
  })
  api.on.appOpen((id) => {
    // die Liste kommt per appsChanged – kurz warten, falls sie noch unterwegs ist
    if (appOf(id)) openApp(id)
    else void api.apps.list().then((list) => (useApps.setState({ list }), openApp(id)))
  })
  api.on.appRect((req, id) => {
    openApp(id)
    // nach dem Nach-vorn-Holen einen Frame warten, dann die Lage des Inhalts melden
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-app-frame="${CSS.escape(id)}"]`)?.closest('.gwin')
        const r = el?.getBoundingClientRect()
        api.apps.rectResult(req, r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null)
      })
    )
  })
}

// ---------- Datenbrücke: nur lesen, nur das, was VibeDesk ohnehin zeigt ----------

const tokensOf = (u: { input: number; output: number; cacheRead: number; cacheWrite5m: number; cacheWrite1h: number } | undefined): number =>
  u ? u.input + u.output + u.cacheRead + u.cacheWrite5m + u.cacheWrite1h : 0

async function projects(): Promise<{ id: string; name: string }[]> {
  return (await api.projects.list()).map((p) => ({ id: p.id, name: p.name }))
}

export async function appData(what: AppDataKind): Promise<unknown> {
  switch (what) {
    case 'sessions': {
      const names = Object.fromEntries((await projects()).map((p) => [p.id, p.name]))
      const wf = useWorkflow.getState().sessions
      return useSessions.getState().sessions.map((s) => {
        const w = wf[s.id]
        return {
          id: s.id,
          name: s.name,
          project: names[s.projectId] ?? '',
          agent: agentOf(s),
          status: w?.status ?? 'idle',
          doing: doingOf(w),
          waitingSince: w?.waitingSince ?? null,
          todos: (w?.todos ?? []).map((x) => ({ content: x.content, status: x.status })),
          agents: w?.agents.filter((x) => !x.done).length ?? 0,
          lastActivity: w?.lastActivity ?? null
        }
      })
    }
    case 'usage': {
      const st = useStats.getState()
      const days = st.days.slice(-7).map((d) => ({ date: d.date, tokens: d.tokens, costUsd: d.costUsd }))
      const today = days[days.length - 1] ?? { tokens: 0, costUsd: 0 }
      return {
        today: { tokens: today.tokens, costUsd: today.costUsd },
        days,
        sessions: useSessions.getState().sessions.map((s) => {
          const x = st.sessions[s.id]
          return { id: s.id, name: s.name, tokens: tokensOf(x?.total), costUsd: x?.costUsd ?? 0, context: x && x.contextWindow ? x.contextUsed / x.contextWindow : 0 }
        })
      }
    }
    case 'project': {
      const list = await api.projects.list()
      const id = activeProjectId(list)
      const p = list.find((x) => x.id === id)
      return p ? { id: p.id, name: p.name } : null
    }
    case 'brain': {
      const id = activeProjectId(await api.projects.list())
      return id ? api.apps.brain(id) : null
    }
  }
}

/** Ruft fn, wenn sich die Daten dieser Art ändern könnten – gedrosselt vom Aufrufer */
export function onAppData(what: AppDataKind, fn: () => void): () => void {
  switch (what) {
    case 'sessions': {
      const a = useWorkflow.subscribe(fn)
      const b = useSessions.subscribe(fn)
      return () => (a(), b())
    }
    case 'usage': {
      const a = useStats.subscribe(fn)
      const b = useSessions.subscribe(fn)
      return () => (a(), b())
    }
    case 'project':
      return useUi.subscribe((s, p) => s.open !== p.open && fn())
    case 'brain': {
      const a = api.on.brainChanged(() => fn())
      const b = useUi.subscribe((s, p) => s.open !== p.open && fn())
      return () => (a(), b())
    }
  }
}

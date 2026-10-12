import { create } from 'zustand'
import { useSessions } from '../store/sessionStore'
import { useWorkflow } from '../store/workflowStore'
import { StatsPanel } from './StatsPanel'
import { AgentPanel, FeedPanel, StatusPanel, TodoPanel } from './WorkflowPanels'

export const INSPECTOR_TABS = [
  { id: 'status', label: 'Status' },
  { id: 'feed', label: 'Live-Feed' },
  { id: 'todos', label: 'Todos' },
  { id: 'agents', label: 'Agents' },
  { id: 'stats', label: 'Stats' }
] as const

export type InspectorTab = (typeof INSPECTOR_TABS)[number]['id']

const KEY = 'vibedesk.inspectorTab'
const initial = (): InspectorTab => {
  try {
    const v = localStorage.getItem(KEY)
    if (INSPECTOR_TABS.some((t) => t.id === v)) return v as InspectorTab
  } catch {
    // Speicher nicht verfügbar – Standard
  }
  return 'feed'
}

export const useInspector = create<{ tab: InspectorTab; setTab(t: InspectorTab): void }>((set) => ({
  tab: initial(),
  setTab: (tab) => {
    set({ tab })
    try {
      localStorage.setItem(KEY, tab)
    } catch {
      // egal
    }
  }
}))

/** Zähler hinter den Tabs: offene Todos und laufende Agents über alle Sessions. */
function useCounts(): Partial<Record<InspectorTab, number>> {
  const sessions = useSessions((s) => s.sessions)
  const wf = useWorkflow((s) => s.sessions)
  let todos = 0
  let agents = 0
  for (const s of sessions) {
    todos += wf[s.id]?.todos.filter((t) => t.status !== 'completed').length ?? 0
    agents += wf[s.id]?.agents.filter((a) => !a.done).length ?? 0
  }
  return { todos, agents }
}

export function InspectorWindow(): React.JSX.Element {
  const tab = useInspector((s) => s.tab)
  const setTab = useInspector((s) => s.setTab)
  const counts = useCounts()
  return (
    <div className="inspector">
      <div className="row tabs inspector-tabs">
        {INSPECTOR_TABS.map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)} data-testid={`inspector-${t.id}`}>
            {t.label}
            {!!counts[t.id] && <span className="tab-count">{counts[t.id]}</span>}
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {tab === 'status' && <StatusPanel />}
        {tab === 'feed' && <FeedPanel />}
        {tab === 'todos' && <TodoPanel />}
        {tab === 'agents' && <AgentPanel />}
        {tab === 'stats' && <StatsPanel />}
      </div>
    </div>
  )
}

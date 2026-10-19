import { create } from 'zustand'
import { useAllSessions, useSessions } from '../store/sessionStore'
import { useWorkflow } from '../store/workflowStore'
import { StatsPanel } from './StatsPanel'
import { AgentPanel, FeedPanel, StatusPanel, TodoPanel } from './WorkflowPanels'
import { t } from '../../../shared/i18n'
import { useSettings } from '../store/settingsStore'

export const INSPECTOR_TABS = [
  { id: 'status', label: 'Status' },
  {
    id: 'feed',
    // Getter: erst beim Anzeigen übersetzen, nicht beim Import
    get label() {
      return t('Live-Feed')
    }
  },
  { id: 'todos', label: 'Todos' },
  { id: 'agents', label: 'Agents' },
  { id: 'stats', label: 'Stats' }
] as const

export type InspectorTab = (typeof INSPECTOR_TABS)[number]['id']

const KEY = 'vibedesk.inspectorTab'
const initial = (): InspectorTab => {
  try {
    const v = localStorage.getItem(KEY)
    if (INSPECTOR_TABS.some((x) => x.id === v)) return v as InspectorTab
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
  const sessions = useAllSessions()
  const wf = useWorkflow((s) => s.sessions)
  let todos = 0
  let agents = 0
  for (const s of sessions) {
    todos += wf[s.id]?.todos.filter((x) => x.status !== 'completed').length ?? 0
    agents += wf[s.id]?.agents.filter((a) => !a.done).length ?? 0
  }
  return { todos, agents }
}

export function InspectorWindow(): React.JSX.Element {
  const off = useSettings((s) => s.s?.inspectorTabsOff ?? [])
  const tabs = INSPECTOR_TABS.filter((x) => !off.includes(x.id))
  const wanted = useInspector((s) => s.tab)
  // ausgeblendeter Tab gewählt → erster sichtbarer
  const tab = tabs.some((x) => x.id === wanted) ? wanted : (tabs[0]?.id ?? wanted)
  const setTab = useInspector((s) => s.setTab)
  const counts = useCounts()
  return (
    <div className="inspector">
      <div className="row tabs inspector-tabs">
        {tabs.map((x) => (
          <button key={x.id} className={`tab${tab === x.id ? ' on' : ''}`} onClick={() => setTab(x.id)} data-testid={`inspector-${x.id}`}>
            {x.label}
            {!!counts[x.id] && <span className="tab-count">{counts[x.id]}</span>}
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

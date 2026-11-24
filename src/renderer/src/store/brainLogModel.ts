// Protokoll fürs Gehirn-Fenster – reine Logik ohne Fenster-Abhängigkeiten (testbar).
import type { BrainPulse } from '../../../shared/brain'

export type NoteMark = 'read' | 'new' | 'updated'

export interface BrainLogEntry {
  ts: number
  kind: 'read' | 'learn'
  /** Titel bzw. Notiz-IDs (n:…) beim Lesen */
  items: string[]
  /** beim Festhalten: Notiz neu angelegt */
  created?: boolean
}

export interface BrainLogState {
  entries: Record<string, BrainLogEntry[]>
  /** Markierung je Notiz-ID im Dateibaum */
  marks: Record<string, Record<string, NoteMark>>
}

/** Lesen in kurzer Folge wird eine Zeile („gelesen: A, B, C“) */
const GROUP_MS = 2500
const MAX_ENTRIES = 40

/** reine Logik, testbar: einen Puls ins Protokoll eines Projekts einsortieren */
export function addPulse(state: BrainLogState, p: BrainPulse, now: number): BrainLogState {
  if (!p.id.startsWith('n:') || p.kind === 'edit') return state
  const list = state.entries[p.projectId] ?? []
  const marks = { ...(state.marks[p.projectId] ?? {}) }
  let next: BrainLogEntry[]
  if (p.kind === 'read') {
    const last = list[list.length - 1]
    if (last && last.kind === 'read' && now - last.ts < GROUP_MS) {
      if (last.items.includes(p.id)) return state
      next = [...list.slice(0, -1), { ...last, ts: now, items: [...last.items, p.id] }]
    } else next = [...list, { ts: now, kind: 'read', items: [p.id] }]
    // eine Notiz, die in dieser Sitzung festgehalten wurde, bleibt als solche markiert
    if (!marks[p.id]) marks[p.id] = 'read'
  } else {
    const title = p.title ?? p.id.slice(2)
    next = [...list, { ts: now, kind: 'learn', items: [title], created: !!p.created }]
    marks[p.id] = p.created ? 'new' : 'updated'
  }
  return {
    entries: { ...state.entries, [p.projectId]: next.slice(-MAX_ENTRIES) },
    marks: { ...state.marks, [p.projectId]: marks }
  }
}

// „Frage mit Knöpfen“ aus Addons: eine Karte über dem Dock, eine Frage nach der anderen.
import { useEffect } from 'react'
import { create } from 'zustand'

export const ASK_TIMEOUT_MS = 60_000

interface Ask {
  id: number
  addonId: string
  addonName: string
  text: string
  yes: string
  no: string
  resolve(ok: boolean): void
}

const useAsk = create<{ queue: Ask[] }>(() => ({ queue: [] }))
let seq = 0

/** Zeigt die Frage an; nach ASK_TIMEOUT_MS ohne Antwort zählt sie als „Nein“. Pro Addon warten höchstens 2 gleichzeitig. */
export function askUser(addonId: string, addonName: string, text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (useAsk.getState().queue.filter((a) => a.addonId === addonId).length >= 2) return resolve(false)
    const ask: Ask = { id: ++seq, addonId, addonName, text, yes, no, resolve }
    useAsk.setState((s) => ({ queue: [...s.queue, ask] }))
  })
}

/** Offene Fragen eines gestoppten Addons verwerfen (zählen als „Nein“). */
export function dismissAsks(addonId: string): void {
  const mine = useAsk.getState().queue.filter((a) => a.addonId === addonId)
  if (!mine.length) return
  useAsk.setState((s) => ({ queue: s.queue.filter((a) => a.addonId !== addonId) }))
  for (const a of mine) a.resolve(false)
}

function answer(a: Ask, ok: boolean): void {
  useAsk.setState((s) => ({ queue: s.queue.filter((x) => x.id !== a.id) }))
  a.resolve(ok)
}

export function AskToast(): React.JSX.Element | null {
  const current = useAsk((s) => s.queue[0])
  useEffect(() => {
    if (!current) return
    const t = setTimeout(() => answer(current, false), ASK_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [current])
  if (!current) return null
  return (
    <div className="ask-toast" role="dialog" data-testid="ask-toast" key={current.id}>
      <div className="ask-from">Addon „{current.addonName}“ fragt</div>
      <div className="ask-text">{current.text}</div>
      <div className="ask-actions">
        <button className="ask-btn" onClick={() => answer(current, false)} data-testid="ask-no">
          {current.no}
        </button>
        <button className="ask-btn primary" onClick={() => answer(current, true)} data-testid="ask-yes">
          {current.yes}
        </button>
      </div>
      <i className="ask-timer" style={{ animationDuration: `${ASK_TIMEOUT_MS}ms` }} />
    </div>
  )
}

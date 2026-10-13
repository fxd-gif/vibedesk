// „Frage mit Knöpfen“ aus Addons: eine Karte über dem Dock, eine Frage nach der anderen.
import { useEffect } from 'react'
import { create } from 'zustand'

export const ASK_TIMEOUT_MS = 60_000

interface Ask {
  id: number
  text: string
  yes: string
  no: string
  resolve(ok: boolean): void
}

const useAsk = create<{ queue: Ask[] }>(() => ({ queue: [] }))
let seq = 0

/** Zeigt die Frage an; nach ASK_TIMEOUT_MS ohne Antwort zählt sie als „Nein“. Höchstens 3 warten gleichzeitig. */
export function askUser(text: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (useAsk.getState().queue.length >= 3) return resolve(false)
    const ask: Ask = { id: ++seq, text, yes, no, resolve }
    useAsk.setState((s) => ({ queue: [...s.queue, ask] }))
  })
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

// Lebende Szene hinter dem Desktop: Claudes Szenen-Skript im Sandbox-iframe (kein Zugriff auf VibeDesk).
// Die Maus kommt per postMessage dazu, auch wenn sie über einem Fenster ist – Schnee weicht dem Zeiger aus.
import { useEffect, useRef } from 'react'
import { create } from 'zustand'
import { t } from '../../../shared/i18n'
import type { LivingScene } from '../../../shared/living'
import { api } from '../api'
import { inform } from '../store/notifyStore'
import { useSettings } from '../store/settingsStore'
import { frameInterval, saverActive } from './framePolicy'
import { useOnBattery } from './RainCanvas'

export const useLiving = create<{ list: LivingScene[]; loaded: boolean }>(() => ({ list: [], loaded: false }))

let wired = false
export function wireLiving(): void {
  if (wired) return
  wired = true
  void api.living.list().then((list) => useLiving.setState({ list, loaded: true }))
  api.on.livingChanged((list) => useLiving.setState({ list, loaded: true }))
}

export function LivingSceneView({ scene, paused }: { scene: LivingScene; paused?: boolean }): React.JSX.Element {
  const ref = useRef<HTMLIFrameElement>(null)
  const mode = useSettings((x) => x.s?.energySaver)
  const saver = saverActive(mode, useOnBattery())
  const src = `vibedesk-scene://living/${encodeURIComponent(scene.id)}/index.html?rev=${scene.rev}`

  // Nachrichten an die Szene
  const post = (msg: Record<string, unknown>): void => ref.current?.contentWindow?.postMessage(msg, '*')

  useEffect(() => {
    const onMsg = (e: MessageEvent): void => {
      if (e.source !== ref.current?.contentWindow) return
      const m = e.data as { vdLiving?: boolean; type?: string; ok?: boolean; error?: string; req?: string; data?: string }
      if (!m || !m.vdLiving) return
      if (m.type === 'status') {
        api.living.status({ id: scene.id, rev: scene.rev, ok: !!m.ok, error: m.error })
        if (!m.ok) inform(t('Die Szene „{name}“ hat einen Fehler', { name: scene.name }), m.error, undefined, `living:${scene.id}`)
      } else if (m.type === 'snapshot' && typeof m.req === 'string') api.living.snapshotResult(m.req, m.data ?? null, m.error)
    }
    window.addEventListener('message', onMsg)
    const offSnap = api.on.livingSnapshot((req) => post({ type: 'snapshot', req }))
    // Zeiger überall weitergeben – Fenster liegen davor, die Szene reagiert trotzdem
    let down = false
    const pointer = (e: PointerEvent): void => {
      if (e.type === 'pointerdown') down = true
      if (e.type === 'pointerup') down = false
      post({ type: 'pointer', x: e.clientX, y: e.clientY, down })
    }
    const leave = (): void => post({ type: 'pointer', x: -1e4, y: -1e4, down: false, leave: true })
    // Klick auf den freien Desktop (nicht in ein Fenster) – für Effekte wie Blitz auf Klick
    const click = (e: MouseEvent): void => {
      const el = e.target as HTMLElement | null
      if (el && (el.classList.contains('app') || el.classList.contains('living-scene'))) post({ type: 'click', x: e.clientX, y: e.clientY })
    }
    window.addEventListener('pointermove', pointer, { passive: true, capture: true })
    window.addEventListener('pointerdown', pointer, { passive: true, capture: true })
    window.addEventListener('pointerup', pointer, { passive: true, capture: true })
    document.documentElement.addEventListener('mouseleave', leave)
    window.addEventListener('click', click, { capture: true })
    return () => {
      window.removeEventListener('message', onMsg)
      offSnap()
      window.removeEventListener('pointermove', pointer, { capture: true })
      window.removeEventListener('pointerdown', pointer, { capture: true })
      window.removeEventListener('pointerup', pointer, { capture: true })
      document.documentElement.removeEventListener('mouseleave', leave)
      window.removeEventListener('click', click, { capture: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene.id, scene.rev])

  // Bildrate wie beim Regen: im Sparmodus und ohne Fokus weniger, pausiert gar nicht
  useEffect(() => {
    const apply = (): void => {
      const iv = frameInterval({ paused: !!paused, idle: document.hidden || !document.hasFocus(), saver })
      post(iv === null ? { type: 'pause', paused: true } : { type: 'pause', paused: false })
      if (iv !== null) post({ type: 'fps', fps: Math.round(1000 / iv) })
    }
    apply()
    window.addEventListener('focus', apply)
    window.addEventListener('blur', apply)
    document.addEventListener('visibilitychange', apply)
    const frame = ref.current
    frame?.addEventListener('load', apply)
    return () => {
      window.removeEventListener('focus', apply)
      window.removeEventListener('blur', apply)
      document.removeEventListener('visibilitychange', apply)
      frame?.removeEventListener('load', apply)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, saver, src])

  return <iframe ref={ref} className="living-scene" src={src} sandbox="allow-scripts" title={scene.name} tabIndex={-1} aria-hidden="true" data-testid="living-scene" />
}

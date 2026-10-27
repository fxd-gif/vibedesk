// Leiser Farbschleier über der Regenszene, der der echten Uhrzeit folgt – einmal pro Minute nachgeführt.
import { useEffect, useState } from 'react'
import { daylightAt, hourOf } from '../../../shared/daylight'

export function DaylightTint(): React.JSX.Element {
  const [d, setD] = useState(() => daylightAt(hourOf(new Date())))
  useEffect(() => {
    const iv = setInterval(() => setD(daylightAt(hourOf(new Date()))), 60_000)
    return () => clearInterval(iv)
  }, [])
  return <div className="daylight-tint" style={{ background: d.color, opacity: d.opacity }} data-testid="daylight" aria-hidden />
}

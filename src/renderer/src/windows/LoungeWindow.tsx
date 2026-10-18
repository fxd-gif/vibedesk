import { useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { Icon } from '../desktop/icons'
import { AVATARS, REACTIONS, statusLabel, type LoungePresence } from '../../../shared/lounge'
import { findShareCode } from '../../../shared/shareCode'
import { fmtClock } from '../store/focusStore'
import { acceptInvite, buildPresence, inviteFocus, joinLounge, leaveLounge, randomCode, sendChat, sendReaction, useLounge, type LoungeMsg } from '../store/loungeStore'
import { useSettings } from '../store/settingsStore'
import { startImport } from '../store/shareStore'
import { Toggle } from './AmbienceMenu'
import { locale, t } from '../../../shared/i18n'

const PHASE = (p: 'work' | 'short' | 'long'): string => (p === 'work' ? t('Fokus') : p === 'short' ? t('Pause') : t('Lange Pause'))

function useTick(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(iv)
  }, [ms])
  return now
}

export function LoungeWindow(): React.JSX.Element {
  const state = useLounge((s) => s.state)
  return <div className="panel lounge">{state === 'off' ? <Lobby /> : <Room />}</div>
}

function Profile(): React.JSX.Element {
  const s = useSettings((x) => x.s)!
  const set = useSettings((x) => x.set)
  const l = s.lounge
  return (
    <div className="lounge-profile">
      <div className="row">
        <input
          className="field small"
          placeholder={t('Dein Name in der Lounge')}
          maxLength={24}
          value={l.name}
          onChange={(e) => set({ lounge: { ...l, name: e.target.value } })}
          data-testid="lounge-name"
        />
      </div>
      <div className="row chips avatars">
        {AVATARS.map((a) => (
          <button key={a} className={`chip avatar${l.emoji === a ? ' on' : ''}`} onClick={() => set({ lounge: { ...l, emoji: a } })}>
            {a}
          </button>
        ))}
      </div>
      <div className="row between">
        <span className="small">{t('Projektnamen zeigen')} {s.streamer.enabled && <span className="dim">{t('(im Streamer-Modus aus)')}</span>}</span>
        <Toggle label={t('Projektnamen zeigen')} on={l.showProject} onChange={(v) => set({ lounge: { ...l, showProject: v } })} />
      </div>
    </div>
  )
}

function Lobby(): React.JSX.Element {
  const s = useSettings((x) => x.s)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  if (!s) return <></>
  const named = !!s.lounge.name.trim()
  const join = async (c: string): Promise<void> => {
    setErr('')
    const e = await joinLounge(c)
    if (e) setErr(e)
  }
  return (
    <>
      <p className="lounge-intro">
        {t('Vibecode mit Freunden im selben Raum: Ihr seht, wer gerade baut, startet Fokus-Runden zusammen, schickt Reaktionen und teilt Prompts & Skills per Code.')}
      </p>
      <Profile />
      <div className="lounge-actions">
        <button className="btn primary" disabled={!named} onClick={() => join(randomCode())} data-testid="lounge-create">
          <Icon name="plus" size={14} /> {t('Neuen Raum öffnen')}
        </button>
        <div className="row">
          <input
            className="field small mono"
            placeholder={t('Raumcode, z. B. abcd-efgh-jkmn')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && named && code.trim() && join(code)}
            data-testid="lounge-code"
          />
          <button className="btn" disabled={!named || !code.trim()} onClick={() => join(code)}>
            {t('Beitreten')}
          </button>
        </div>
        {s.lounge.lastRoom && (
          <button className="linkish small" disabled={!named} onClick={() => join(s.lounge.lastRoom)}>
            {t('Zurück in den letzten Raum')}
          </button>
        )}
        {!named && <div className="dim small">{t('Gib dir zuerst einen Namen.')}</div>}
        {err && <div className="warn small">{err}</div>}
      </div>
      <div className="lounge-privacy">
        <b>{t('Ohne Server, direkt zwischen euch.')}</b>{' '}
        {t(
          'Geteilt werden nur Name, Status, Fokus-Timer, Chat und Reaktionen – nie Code, Dateien oder Terminal-Inhalte. Die Verbindung ist verschlüsselt, aber wer im Raum ist, kann deine IP-Adresse sehen. Gib den Raumcode deshalb nur Leuten, denen du vertraust.'
        )}
      </div>
    </>
  )
}

function PeerCard({ p, at, self, now }: { p: LoungePresence; at: number; self?: boolean; now: number }): React.JSX.Element {
  const left = p.focus ? Math.max(0, p.focus.leftMs - (now - at)) : 0
  return (
    <li className={`peer ${p.status}`}>
      <span className="peer-emoji">{p.emoji}</span>
      <div className="peer-info">
        <div className="peer-name">
          {p.name}
          {self && <span className="dim small"> {t('(du)')}</span>}
          {p.streaming && <span className="live-tag">LIVE</span>}
        </div>
        <div className="peer-status">
          <span className={`dot ${p.status}`} /> {p.sessions ? statusLabel(p.status) : t('keine Session')}
          {p.project && <span className="dim"> · {p.project}</span>}
        </div>
      </div>
      <div className="peer-extra">
        {p.focus && (
          <span className={`peer-focus ${p.focus.phase}`} title={PHASE(p.focus.phase)}>
            {PHASE(p.focus.phase)} {fmtClock(left)}
          </span>
        )}
        {p.music && <span title={t('hört Lofi')}>🎵</span>}
      </div>
    </li>
  )
}

function ChatLine({ m }: { m: LoungeMsg }): React.JSX.Element {
  const code = m.kind === 'chat' ? findShareCode(m.text) : null
  const time = new Date(m.ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })
  if (m.kind === 'system')
    return (
      <li className="chat-sys">
        <span className="dim small">{time}</span> {m.emoji} <b>{m.name}</b> {m.text}
      </li>
    )
  return (
    <li className={`chat-msg${m.self ? ' self' : ''}`}>
      <span className="dim small">{time}</span> {m.emoji} <b>{m.name}</b>{' '}
      <span className="chat-text">{code ? m.text.replace(code, code.slice(0, 18) + '…') : m.text}</span>
      {code && (
        <button className="btn small" onClick={() => startImport(code)}>
          <Icon name="share" size={12} /> {t('Code ansehen')}
        </button>
      )}
    </li>
  )
}

function Room(): React.JSX.Element {
  const room = useLounge((s) => s.room)!
  const peers = useLounge((s) => s.peers)
  const chat = useLounge((s) => s.chat)
  const invite = useLounge((s) => s.invite)
  const streaming = useSettings((x) => !!x.s?.streamer.enabled)
  const [text, setText] = useState('')
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)
  const now = useTick()
  const logRef = useRef<HTMLUListElement>(null)
  const self = buildPresence()
  const list = Object.values(peers).sort((a, b) => a.p.name.localeCompare(b.p.name))
  const hidden = streaming && !reveal

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [chat.length])

  const send = (): void => {
    if (!text.trim()) return
    sendChat(text)
    setText('')
  }

  return (
    <>
      <div className="row lounge-head">
        <span className="dim small">{t('Raum')}</span>
        <code className={`room-code${hidden ? ' masked' : ''}`} data-testid="lounge-room">
          {hidden ? '••••-••••-••••' : room}
        </code>
        {streaming && (
          <button className="btn small ghost" onClick={() => setReveal(!reveal)} title={t('Im Streamer-Modus verborgen')}>
            {reveal ? t('verbergen') : t('zeigen')}
          </button>
        )}
        <button
          className="btn small ghost"
          title={t('Raumcode kopieren')}
          onClick={() => {
            api.clipboard.write(room)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          <Icon name="copy" size={13} /> {copied ? t('kopiert') : t('Code')}
        </button>
        <span style={{ flex: 1 }} />
        <span className="dim small">{t('{n} online', { n: list.length + 1 })}</span>
        <button className="btn small ghost" onClick={() => void leaveLounge()} data-testid="lounge-leave">
          {t('Verlassen')}
        </button>
      </div>

      {invite && Date.now() - invite.ts < 120_000 && (
        <div className="lounge-invite">
          ⏱ <b>{invite.name}</b> {t('startet eine Fokus-Runde ({n} Min.)', { n: invite.minutes })}
          <span style={{ flex: 1 }} />
          <button className="btn small primary" onClick={acceptInvite}>
            {t('Mitmachen')}
          </button>
          <button className="btn small ghost" onClick={() => useLounge.setState({ invite: null })}>
            {t('Nein')}
          </button>
        </div>
      )}

      <ul className="peers">
        <PeerCard p={self} at={now} self now={now} />
        {list.map((p) => (
          <PeerCard key={p.id} p={p.p} at={p.at} now={now} />
        ))}
        {!list.length && <li className="dim small peer-wait">{t('Warte auf Freunde … schick ihnen den Raumcode.')}</li>}
      </ul>

      <div className="row lounge-react">
        {REACTIONS.map((r) => (
          <button key={r} className="btn small ghost react-btn" onClick={() => sendReaction(r)} title={t('An alle senden')}>
            {r}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="btn small" onClick={inviteFocus} title={t('Startet deinen Fokus-Timer und lädt alle ein')}>
          <Icon name="timer" size={13} /> {t('Fokus für alle')}
        </button>
      </div>

      <ul className="lounge-chat" ref={logRef}>
        {chat.map((m) => (
          <ChatLine key={m.id} m={m} />
        ))}
      </ul>
      <div className="row">
        <input
          className="field small"
          placeholder={t('Nachricht oder Share-Code …')}
          maxLength={500}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          data-testid="lounge-input"
        />
        <button className="btn small primary" disabled={!text.trim()} onClick={send}>
          <Icon name="send" size={13} />
        </button>
      </div>
    </>
  )
}

/** Fliegende Reaktionen über dem Desktop. */
export function LoungeFloaters(): React.JSX.Element | null {
  const floaters = useLounge((s) => s.floaters)
  if (!floaters.length) return null
  return (
    <div className="floaters" aria-hidden>
      {floaters.map((f) => (
        <div key={f.id} className="floater" style={{ left: `${f.x}%` }}>
          <span>{f.emoji}</span>
          <small>{f.name}</small>
        </div>
      ))}
    </div>
  )
}

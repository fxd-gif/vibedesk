import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, errorText } from '../api'
import { Icon } from '../desktop/icons'
import { alert, confirm } from '../store/dialogStore'
import type { Project, SkillCandidateSummary, SkillInfo, SkillTarget } from '../../../shared/types'
import { openPaste, shareSkill } from '../store/shareStore'
import { t, tn } from '../../../shared/i18n'

export function SkillsWindow(): React.JSX.Element {
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [query, setQuery] = useState('')
  const [url, setUrl] = useState('')
  const [target, setTarget] = useState<string>('global')
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const [pending, setPending] = useState<SkillCandidateSummary[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [done, setDone] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const [s, p] = await Promise.all([api.skills.list(), api.projects.list()])
    setSkills(s)
    setProjects(p)
  }, [])
  useEffect(() => {
    reload()
  }, [reload])

  const tgt = (): SkillTarget => (target === 'global' ? { kind: 'global' } : { kind: 'project', projectId: target })

  const install = async (tokens: string[]): Promise<void> => {
    try {
      await api.skills.install(tokens, tgt(), false)
    } catch (err) {
      if (!errorText(err).includes('SKILL_EXISTS')) throw err
      const ok = await confirm({
        title: t('Skill existiert bereits'),
        message: t('Ein Skill mit diesem Namen ist am Ziel schon vorhanden. Ersetzen? Der alte Ordner wandert in den Papierkorb.'),
        confirmLabel: t('Ersetzen'),
        danger: true
      })
      if (!ok) return
      await api.skills.install(tokens, tgt(), true)
    }
    setDone(tn(tokens.length, 'Skill installiert – gilt für neu gestartete Sessions.', '{n} Skills installiert – gilt für neu gestartete Sessions.'))
    setPending(null)
    reload()
  }

  const handle = async (load: () => Promise<SkillCandidateSummary[]>): Promise<void> => {
    setBusy(true)
    setDone(null)
    try {
      const cands = await load()
      if (cands.length === 1) await install([cands[0].token])
      else {
        setPending(cands)
        setPicked(new Set())
      }
    } catch (err) {
      await alert(t('Import fehlgeschlagen'), errorText(err))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (s: SkillInfo): Promise<void> => {
    if (!(await confirm({ title: t('Skill „{name}“ entfernen?', { name: s.name }), message: t('Der Ordner wird in den Papierkorb verschoben.'), confirmLabel: t('Entfernen'), danger: true }))) return
    try {
      await api.skills.remove(s.dir)
    } catch (err) {
      await alert(t('Entfernen fehlgeschlagen'), errorText(err))
    }
    reload()
  }

  const groups = useMemo(() => {
    const q = query.toLowerCase()
    const f = skills.filter((s) => !q || s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q))
    const names: Record<string, string> = { global: 'Global' }
    projects.forEach((p) => (names[p.id] = p.name))
    const m = new Map<string, SkillInfo[]>()
    f.forEach((s) => m.set(s.scope, [...(m.get(s.scope) ?? []), s]))
    return [...m.entries()].map(([scope, list]) => ({ scope, label: names[scope] ?? scope, list }))
  }, [skills, projects, query])

  return (
    <div className="panel skills">
      <div
        className={`dropzone${over ? ' over' : ''}${busy ? ' busy' : ''}`}
        onDragOver={(e) => (e.preventDefault(), setOver(true))}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          const paths = [...e.dataTransfer.files].map((f) => api.fs.pathForFile(f)).filter(Boolean)
          if (paths.length) handle(() => api.skills.importPaths(paths))
        }}
        data-testid="skill-drop"
      >
        <Icon name="spark" size={20} />
        <div>{busy ? t('Importiere …') : t('Ordner, .zip oder SKILL.md hierher ziehen')}</div>
      </div>
      <div className="row">
        <input
          className="field small"
          placeholder={t('GitHub-URL, z. B. https://github.com/owner/repo/tree/main/skills/x')}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && url.trim() && handle(() => api.skills.importGithub(url.trim()))}
        />
        <button className="btn small primary" disabled={!url.trim() || busy} onClick={() => handle(() => api.skills.importGithub(url.trim()))}>
          <Icon name="github" size={14} /> {t('Laden')}
        </button>
        <button className="btn small ghost" title={t('Share-Code einfügen')} onClick={openPaste}>
          <Icon name="share" size={14} /> {t('Code')}
        </button>
      </div>
      <div className="row">
        <span className="dim">{t('Installieren nach')}</span>
        <div className="row chips">
          {[{ id: 'global', name: 'Global' }, ...projects].map((p) => (
            <button key={p.id} className={`chip${target === p.id ? ' on' : ''}`} onClick={() => setTarget(p.id)}>
              {p.name}
            </button>
          ))}
        </div>
      </div>
      {done && <div className="notice">{done}</div>}

      {pending && (
        <div className="pick">
          <div className="row">
            <b>{t('{n} Skills gefunden', { n: pending.length })}</b>
            <button className="btn small ghost" style={{ marginLeft: 'auto' }} onClick={() => setPicked(picked.size === pending.length ? new Set() : new Set(pending.map((c) => c.token)))}>
              {picked.size === pending.length ? t('Keine') : t('Alle')}
            </button>
            <button className="btn small ghost" onClick={() => setPending(null)}>
              {t('Abbrechen')}
            </button>
          </div>
          <ul>
            {pending.map((c) => (
              <li key={c.token}>
                <label className="check" style={{ marginTop: 0 }}>
                  <input
                    type="checkbox"
                    checked={picked.has(c.token)}
                    onChange={(e) => {
                      const n = new Set(picked)
                      if (e.target.checked) n.add(c.token)
                      else n.delete(c.token)
                      setPicked(n)
                    }}
                  />
                  <span className="check-box accent" />
                  <span>
                    <span className="pick-text"><b>{c.name}</b> <span className="dim">– {c.description}</span></span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button className="btn primary small" disabled={!picked.size} onClick={() => install([...picked]).catch((err) => alert(t('Import fehlgeschlagen'), errorText(err)))}>
            {picked.size ? t('{n} installieren', { n: picked.size }) : t('Skills auswählen')}
          </button>
        </div>
      )}

      <input className="field small" placeholder={t('Skills durchsuchen …')} value={query} onChange={(e) => setQuery(e.target.value)} />
      {groups.length === 0 && <div className="panel-empty">{t('Noch keine Skills installiert.')}</div>}
      {groups.map((g) => (
        <section key={g.scope} className="skill-group">
          <h4>
            {g.label} <span className="dim">· {g.list.length}</span>
          </h4>
          <ul className="plist">
            {g.list.map((s) => (
              <li key={s.dir} className="pitem">
                <div className="pinfo">
                  <div className="pname">{s.name}</div>
                  <div className="skill-desc" title={s.description}>
                    {s.description}
                  </div>
                </div>
                <div className="pactions">
                  <button className="btn small ghost" title={t('Als Code teilen')} onClick={() => void shareSkill(s.dir, s.name)}>
                    <Icon name="share" size={14} />
                  </button>
                  <button className="btn small ghost" title={t('Entfernen')} onClick={() => remove(s)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

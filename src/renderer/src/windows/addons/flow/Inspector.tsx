import { useEffect, useRef, useState } from 'react'
import { BLOCKS } from '../../../../../shared/addonBlocks'
import { KINDS, type Cond, type FlowNode, type FlowNodeData, type Val, type ValueSetting } from '../../../addons/flowModel'
import { APP_VALUES, OPS, optionLabel, valLabel } from '../../../addons/flowLabels'
import { FlowIcon } from './FlowIcon'

export interface InspectorContext {
  images: string[]
  sounds: string[]
  prompts: string[]
  variables: string[]
}

const pad = (n: number): string => String(n).padStart(2, '0')

function Select({ value, options, onChange, testId }: { value: string; options: [string, string][]; onChange(v: string): void; testId?: string }): React.JSX.Element {
  return (
    <div className="fsel">
      <select value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      <FlowIcon name="chevron" size={14} />
    </div>
  )
}

/** Eingabe mit fx-Knopf: fester Wert oder Quelle (Variable, App-Wert, Prompt-Vorlage, Zufall). */
function ValueInput({ value, type, ctx, onChange, unit, testId }: { value: Val; type: ValueSetting['type']; ctx: InspectorContext; onChange(v: Val): void; unit?: string; testId?: string }): React.JSX.Element {
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: PointerEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false)
    }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [menu])
  const literal = value.k === 'num' || value.k === 'text'
  const pick = (v: Val): void => {
    onChange(v)
    setMenu(false)
  }
  return (
    <div className="fval" ref={ref}>
      {literal ? (
        type === 'num' ? (
          <input type="number" value={value.k === 'num' ? value.v : 0} onChange={(e) => onChange({ k: 'num', v: Number(e.target.value) || 0 })} data-testid={testId} />
        ) : (
          <textarea rows={2} value={value.k === 'text' ? value.v : ''} maxLength={5000} onChange={(e) => onChange({ k: 'text', v: e.target.value })} data-testid={testId} />
        )
      ) : value.k === 'random' ? (
        <div className="fval-random">
          Zufall
          <input type="number" value={value.min} onChange={(e) => onChange({ ...value, min: Number(e.target.value) || 0 })} />
          bis
          <input type="number" value={value.max} onChange={(e) => onChange({ ...value, max: Number(e.target.value) || 0 })} />
        </div>
      ) : (
        <div className="fval-chip">
          <span>{valLabel(value)}</span>
          <button title="Fester Wert" onClick={() => onChange(type === 'num' ? { k: 'num', v: 0 } : { k: 'text', v: '' })}>
            <FlowIcon name="x" size={12} />
          </button>
        </div>
      )}
      {unit && literal && <span className="fval-unit">{unit}</span>}
      <button className={`fval-fx${menu ? ' on' : ''}`} onClick={() => setMenu((m) => !m)} title="Wert aus einer Quelle">
        <i>fx</i>
      </button>
      {menu && (
        <div className="fval-menu">
          <button onClick={() => pick(type === 'num' ? { k: 'num', v: 0 } : { k: 'text', v: '' })}>Fester Wert</button>
          {type === 'num' && <button onClick={() => pick({ k: 'random', min: 1, max: 10 })}>Zufallszahl</button>}
          {ctx.variables.length > 0 && <div className="fval-menu-head">Variablen</div>}
          {ctx.variables.map((n) => (
            <button key={'v' + n} onClick={() => pick({ k: 'var', name: n })}>
              {n}
            </button>
          ))}
          <div className="fval-menu-head">App-Werte</div>
          {Object.entries(APP_VALUES).map(([k, l]) => (
            <button key={k} onClick={() => pick({ k: 'app', what: k })}>
              {l}
            </button>
          ))}
          {type === 'text' && ctx.prompts.length > 0 && <div className="fval-menu-head">Prompt-Vorlagen</div>}
          {type === 'text' &&
            ctx.prompts.map((p) => (
              <button key={'p' + p} onClick={() => pick({ k: 'prompt', name: p })}>
                {p}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }): React.JSX.Element {
  return (
    <label className="ffield">
      <span className="ffield-label">{label}</span>
      {children}
      {hint && <span className="ffield-hint">{hint}</span>}
    </label>
  )
}

const FIELD_NAMES: Record<string, string> = { PHASE: 'Wann', KEY: 'Taste', MINUTES: 'Alle … Minuten', SCENE: 'Szene', CHANNEL: 'Kanal', SOUND: 'Ton', CMD: 'Aktion', ON: 'Musik' }

export function NodeInspector({ node, ctx, onChange, onDelete, onDuplicate }: { node: FlowNode; ctx: InspectorContext; onChange(patch: Partial<FlowNodeData>): void; onDelete(): void; onDuplicate(): void }): React.JSX.Element {
  const d = node.data
  const kind = KINDS[d.type]
  const spec = BLOCKS[d.type]
  const setField = (k: string, v: string | number): void => onChange({ fields: { ...d.fields, [k]: v } })
  const setVal = (k: string, v: Val): void => onChange({ values: { ...d.values, [k]: v } })
  const setCond = (patch: Partial<Cond>): void => onChange({ cond: { ...d.cond!, ...patch } })

  const fieldControl = (key: string): React.ReactNode => {
    const f = spec.fields[key]
    const value = String(d.fields[key] ?? '')
    if (d.type === 'vd_on_time' && key === 'MINUTE') return null
    if (d.type === 'vd_on_time' && key === 'HOUR')
      return (
        <Field key="time" label="Uhrzeit">
          <input
            type="time"
            className="finput"
            value={`${pad(Number(d.fields.HOUR))}:${pad(Number(d.fields.MINUTE))}`}
            onChange={(e) => {
              const [h, m] = e.target.value.split(':').map(Number)
              if (Number.isFinite(h) && Number.isFinite(m)) onChange({ fields: { ...d.fields, HOUR: h, MINUTE: m } })
            }}
          />
        </Field>
      )
    if (f.kind === 'int')
      return (
        <Field key={key} label={FIELD_NAMES[key] ?? key}>
          <input type="number" className="finput" min={f.min} max={f.max} value={value} onChange={(e) => setField(key, Math.min(f.max, Math.max(f.min, Math.round(Number(e.target.value) || f.min))))} />
        </Field>
      )
    if (f.kind === 'enum' || f.kind === 'bool') {
      const opts = f.kind === 'bool' ? ['TRUE', 'FALSE'] : f.options
      return (
        <Field key={key} label={FIELD_NAMES[key] ?? key}>
          <Select value={value} options={opts.map((o) => [o, key === 'KEY' ? `Strg + Alt + ${o}` : optionLabel(key, o)])} onChange={(v) => setField(key, v)} testId={`fi-${key}`} />
        </Field>
      )
    }
    if (f.kind === 'asset') {
      const list = f.assetKind === 'image' ? ctx.images : ctx.sounds
      const opts: [string, string][] = [...f.builtins.map((b): [string, string] => [b, optionLabel(key, b)]), ...list.map((a): [string, string] => [`asset:${a}`, optionLabel(key, `asset:${a}`)])]
      return (
        <Field key={key} label={FIELD_NAMES[key] ?? key} hint={list.length ? undefined : `Eigene ${f.assetKind === 'image' ? 'Bilder' : 'Töne'} fügst du rechts unter „Inhalte“ hinzu (Auswahl aufheben).`}>
          <Select value={value} options={opts} onChange={(v) => setField(key, v)} testId={`fi-${key}`} />
        </Field>
      )
    }
    return null
  }

  return (
    <div className="finsp">
      <div className={`finsp-head cat-${kind.category}`}>
        <div className="fnode-icon big">
          <FlowIcon name={kind.icon} size={22} />
        </div>
        <div>
          <div className="finsp-title">{kind.label}</div>
          <div className="finsp-desc">{kind.desc}</div>
        </div>
      </div>
      <div className="finsp-section">
        <h4>Einstellungen</h4>
        {Object.keys(spec.fields)
          .filter((k) => k !== 'VAR')
          .map(fieldControl)}
        {d.varName !== undefined && (
          <Field label="Variable">
            <input className="finput" list="flow-vars" value={d.varName} maxLength={40} onChange={(e) => onChange({ varName: e.target.value.replace(/[{}]/g, '') })} />
            <datalist id="flow-vars">
              {ctx.variables.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </Field>
        )}
        {d.cond && (
          <Field label="Bedingung">
            <div className="fcond">
              <ValueInput value={d.cond.a} type="num" ctx={ctx} onChange={(a) => setCond({ a })} />
              <Select value={d.cond.op} options={OPS} onChange={(op) => setCond({ op })} />
              <ValueInput value={d.cond.b} type="num" ctx={ctx} onChange={(b) => setCond({ b })} />
            </div>
          </Field>
        )}
        {kind.values.map((vs) => (
          <Field key={vs.key} label={vs.label} hint={vs.type === 'text' ? 'Tipp: {Variablenname} im Text wird beim Ausführen ersetzt.' : undefined}>
            <ValueInput value={d.values[vs.key]} type={vs.type} unit={vs.unit} ctx={ctx} onChange={(v) => setVal(vs.key, v)} testId={`fv-${vs.key}`} />
          </Field>
        ))}
        {kind.category === 'trigger' && Object.keys(spec.fields).length === 0 && <p className="finsp-empty">Keine Einstellungen nötig.</p>}
      </div>
      <div className="finsp-foot">
        <button className="ficon-btn" onClick={onDuplicate} title="Duplizieren">
          <FlowIcon name="copy" size={16} />
        </button>
        <button className="ficon-btn danger" onClick={onDelete} title="Löschen (Entf)" data-testid="fnode-delete">
          <FlowIcon name="trash" size={16} />
        </button>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { BLOCKS } from '../../../../../shared/addonBlocks'
import { KINDS, type Cmp, type Cond, type FlowNode, type FlowNodeData, type Val, type ValueSetting } from '../../../addons/flowModel'
import { APP_GROUPS, CALC, LIST_OPS, OPS, optionLabel, valLabel } from '../../../addons/flowLabels'
import { FlowIcon } from './FlowIcon'

export interface InspectorContext {
  images: string[]
  sounds: string[]
  prompts: string[]
  variables: string[]
  lists: string[]
  storeKeys: string[]
  signals: string[]
}

type VType = ValueSetting['type']
const MAX_DEPTH = 3
const pad = (n: number): string => String(n).padStart(2, '0')

function Select({ value, options, onChange, testId, small }: { value: string; options: [string, string][]; onChange(v: string): void; testId?: string; small?: boolean }): React.JSX.Element {
  return (
    <div className={`fsel${small ? ' small' : ''}`}>
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

const literalOf = (type: VType): Val => (type === 'num' ? { k: 'num', v: 0 } : { k: 'text', v: '' })

/** Unter-Editor für Werte, die selbst Werte enthalten (Berechnung, Liste, Gemerkt, Zufall). */
function Compound({ value, ctx, onChange, depth }: { value: Val; ctx: InspectorContext; onChange(v: Val): void; depth: number }): React.JSX.Element | null {
  if (value.k === 'calc') {
    const c = CALC.find((x) => x.op === value.op) ?? CALC[0]
    return (
      <div className="fcompound">
        <div className="fcompound-head">
          <FlowIcon name="calc" size={13} /> Berechnung
        </div>
        <ValueInput value={value.a} type="any" ctx={ctx} depth={depth + 1} onChange={(a) => onChange({ ...value, a })} />
        <Select small value={value.op} options={CALC.map((x) => [x.op, x.label])} onChange={(op) => onChange({ ...value, op, b: CALC.find((x) => x.op === op)?.binary ? (value.b ?? { k: 'num', v: 1 }) : undefined })} />
        {c.binary && <ValueInput value={value.b ?? { k: 'num', v: 1 }} type="any" ctx={ctx} depth={depth + 1} onChange={(b) => onChange({ ...value, b })} />}
      </div>
    )
  }
  if (value.k === 'list') {
    const op = LIST_OPS.find((x) => x.op === value.op) ?? LIST_OPS[0]
    return (
      <div className="fcompound">
        <div className="fcompound-head">
          <FlowIcon name="list" size={13} /> Liste
        </div>
        <input className="finput small" list="flow-lists" value={value.name} maxLength={40} placeholder="Name der Liste" onChange={(e) => onChange({ ...value, name: e.target.value.replace(/[{}]/g, '') })} />
        <Select small value={value.op} options={LIST_OPS.map((x) => [x.op, x.label])} onChange={(o) => onChange({ ...value, op: o, arg: LIST_OPS.find((x) => x.op === o)?.arg ? (value.arg ?? { k: 'num', v: 1 }) : undefined })} />
        {op.arg && <ValueInput value={value.arg ?? { k: 'num', v: 1 }} type="any" ctx={ctx} depth={depth + 1} onChange={(arg) => onChange({ ...value, arg })} />}
      </div>
    )
  }
  return null
}

/** Eingabe mit fx-Knopf: fester Wert oder Quelle (Variable, App-Wert, Gemerkt, Prompt, Zufall, Berechnung, Liste). */
function ValueInput({ value, type, ctx, onChange, unit, testId, depth = 0 }: { value: Val; type: VType; ctx: InspectorContext; onChange(v: Val): void; unit?: string; testId?: string; depth?: number }): React.JSX.Element {
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
  const pick = (v: Val): void => {
    onChange(v)
    setMenu(false)
  }
  const compound = value.k === 'calc' || value.k === 'list'
  const literalNum = value.k === 'num' && type !== 'text'
  const literalText = value.k === 'text' || (value.k === 'num' && type === 'text')

  return (
    <div className={`fval-wrap${compound ? ' compound' : ''}`}>
      <div className="fval" ref={ref}>
        {literalNum ? (
          <input type="number" value={value.k === 'num' ? value.v : 0} onChange={(e) => onChange({ k: 'num', v: Number(e.target.value) || 0 })} data-testid={testId} />
        ) : literalText ? (
          type === 'text' ? (
            <textarea rows={2} value={value.k === 'text' ? value.v : ''} maxLength={5000} onChange={(e) => onChange({ k: 'text', v: e.target.value })} data-testid={testId} />
          ) : (
            <input value={value.k === 'text' ? value.v : ''} maxLength={500} placeholder="Text oder Zahl" onChange={(e) => onChange({ k: 'text', v: e.target.value })} data-testid={testId} />
          )
        ) : value.k === 'random' ? (
          <div className="fval-random">
            Zufall
            <input type="number" value={value.min} onChange={(e) => onChange({ ...value, min: Number(e.target.value) || 0 })} />
            bis
            <input type="number" value={value.max} onChange={(e) => onChange({ ...value, max: Number(e.target.value) || 0 })} />
          </div>
        ) : value.k === 'store' ? (
          <div className="fval-random">
            <FlowIcon name="database" size={13} />
            gemerkt
            <input className="wide" list="flow-store" value={value.key} maxLength={40} onChange={(e) => onChange({ k: 'store', key: e.target.value })} />
          </div>
        ) : (
          <div className="fval-chip">
            <span>{valLabel(value)}</span>
            <button title="Fester Wert" onClick={() => onChange(literalOf(type))}>
              <FlowIcon name="x" size={12} />
            </button>
          </div>
        )}
        {unit && (literalNum || literalText) && <span className="fval-unit">{unit}</span>}
        <button className={`fval-fx${menu ? ' on' : ''}`} onClick={() => setMenu((m) => !m)} title="Wert aus einer Quelle">
          <i>fx</i>
        </button>
        {menu && (
          <div className="fval-menu">
            <button onClick={() => pick(literalOf(type))}>Fester Wert</button>
            <button onClick={() => pick({ k: 'random', min: 1, max: 10 })}>Zufallszahl</button>
            <button onClick={() => pick({ k: 'store', key: ctx.storeKeys[0] ?? 'zähler' })}>Dauerhaft gemerkter Wert</button>
            {depth < MAX_DEPTH && (
              <>
                <button onClick={() => pick({ k: 'calc', op: type === 'text' ? 'join' : 'add', a: value.k === 'calc' || value.k === 'list' ? { k: 'num', v: 0 } : value, b: { k: 'num', v: 1 } })}>Berechnung …</button>
                <button onClick={() => pick({ k: 'list', name: ctx.lists[0] ?? 'liste', op: 'length' })}>Aus einer Liste …</button>
              </>
            )}
            {ctx.variables.length > 0 && <div className="fval-menu-head">Variablen</div>}
            {ctx.variables.map((n) => (
              <button key={'v' + n} onClick={() => pick({ k: 'var', name: n })}>
                {n}
              </button>
            ))}
            {APP_GROUPS.map((g) => (
              <div key={g.label}>
                <div className="fval-menu-head">{g.label}</div>
                {g.items.map(([k, l]) => (
                  <button key={k} onClick={() => pick({ k: 'app', what: k })}>
                    {l}
                  </button>
                ))}
              </div>
            ))}
            {type !== 'num' && ctx.prompts.length > 0 && <div className="fval-menu-head">Prompt-Vorlagen</div>}
            {type !== 'num' &&
              ctx.prompts.map((p) => (
                <button key={'p' + p} onClick={() => pick({ k: 'prompt', name: p })}>
                  {p}
                </button>
              ))}
          </div>
        )}
      </div>
      {compound && <Compound value={value} ctx={ctx} onChange={onChange} depth={depth} />}
    </div>
  )
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }): React.JSX.Element {
  return (
    <div className="ffield">
      <span className="ffield-label">{label}</span>
      {children}
      {hint && <span className="ffield-hint">{hint}</span>}
    </div>
  )
}

/** Mehrere Vergleiche, verknüpft mit Und/Oder. */
function CondEditor({ cond, ctx, onChange }: { cond: Cond; ctx: InspectorContext; onChange(c: Cond): void }): React.JSX.Element {
  const set = (i: number, patch: Partial<Cmp>): void => onChange({ ...cond, items: cond.items.map((x, j) => (j === i ? { ...x, ...patch } : x)) })
  return (
    <div className="fcond">
      {cond.items.length > 1 && (
        <div className="fseg">
          <button className={cond.join === 'AND' ? 'on' : ''} onClick={() => onChange({ ...cond, join: 'AND' })}>
            Alle müssen stimmen
          </button>
          <button className={cond.join === 'OR' ? 'on' : ''} onClick={() => onChange({ ...cond, join: 'OR' })}>
            Eine reicht
          </button>
        </div>
      )}
      {cond.items.map((c, i) => (
        <div className="fcond-item" key={i}>
          {i > 0 && <span className="fcond-join">{cond.join === 'AND' ? 'und' : 'oder'}</span>}
          <ValueInput value={c.a} type="any" ctx={ctx} onChange={(a) => set(i, { a })} />
          <div className="fcond-row">
            <Select value={c.op} options={OPS} onChange={(op) => set(i, { op })} />
            {cond.items.length > 1 && (
              <button className="ficon-btn" title="Vergleich entfernen" onClick={() => onChange({ ...cond, items: cond.items.filter((_, j) => j !== i) })}>
                <FlowIcon name="trash" size={14} />
              </button>
            )}
          </div>
          <ValueInput value={c.b} type="any" ctx={ctx} onChange={(b) => set(i, { b })} />
        </div>
      ))}
      {cond.items.length < 8 && (
        <button className="fbtn ghost" onClick={() => onChange({ ...cond, items: [...cond.items, { a: { k: 'app', what: 'hour' }, op: 'EQ', b: { k: 'num', v: 0 } }] })} data-testid="cond-add">
          <FlowIcon name="plus" size={14} /> Vergleich hinzufügen
        </button>
      )}
    </div>
  )
}

const FIELD_NAMES: Record<string, string> = {
  PHASE: 'Wann',
  KEY: 'Taste / Name',
  MINUTES: 'Alle … Minuten',
  SCENE: 'Szene',
  CHANNEL: 'Kanal',
  SOUND: 'Ton',
  CMD: 'Aktion',
  ON: 'Musik',
  NAME: 'Signal-Name',
  WAIT: 'Auf Empfänger warten?',
  YES_LABEL: 'Text Knopf 1',
  NO_LABEL: 'Text Knopf 2'
}

export function NodeInspector({
  node,
  ctx,
  onChange,
  onRemoveCase,
  onDelete,
  onDuplicate
}: {
  node: FlowNode
  ctx: InspectorContext
  onChange(patch: Partial<FlowNodeData>): void
  onRemoveCase(index: number): void
  onDelete(): void
  onDuplicate(): void
}): React.JSX.Element {
  const d = node.data
  const kind = KINDS[d.type]
  const spec = BLOCKS[d.type]
  const setField = (k: string, v: string | number): void => onChange({ fields: { ...d.fields, [k]: v } })
  const setVal = (k: string, v: Val): void => onChange({ values: { ...d.values, [k]: v } })

  const fieldControl = (key: string): React.ReactNode => {
    const f = spec.fields[key]
    const value = String(d.fields[key] ?? '')
    const label = d.type === 'vd_store_set' && key === 'KEY' ? 'Name des Werts' : (FIELD_NAMES[key] ?? key)
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
    switch (f.kind) {
      case 'int':
        return (
          <Field key={key} label={label}>
            <input type="number" className="finput" min={f.min} max={f.max} value={value} onChange={(e) => setField(key, Math.min(f.max, Math.max(f.min, Math.round(Number(e.target.value) || f.min))))} />
          </Field>
        )
      case 'enum':
      case 'bool': {
        const opts = f.kind === 'bool' ? ['TRUE', 'FALSE'] : f.options
        return (
          <Field key={key} label={label}>
            <Select value={value} options={opts.map((o) => [o, key === 'KEY' ? `Strg + Alt + ${o}` : optionLabel(key, o)])} onChange={(v) => setField(key, v)} testId={`fi-${key}`} />
          </Field>
        )
      }
      case 'text':
        return (
          <Field key={key} label={label} hint={key === 'NAME' ? 'Sender und Empfänger brauchen denselben Namen.' : undefined}>
            <input className="finput" list={key === 'NAME' ? 'flow-signals' : key === 'KEY' ? 'flow-store' : undefined} maxLength={f.maxLen} value={value} onChange={(e) => setField(key, e.target.value)} data-testid={`fi-${key}`} />
          </Field>
        )
      case 'asset': {
        const list = f.assetKind === 'image' ? ctx.images : ctx.sounds
        const opts: [string, string][] = [...f.builtins.map((b): [string, string] => [b, optionLabel(key, b)]), ...list.map((a): [string, string] => [`asset:${a}`, optionLabel(key, `asset:${a}`)])]
        return (
          <Field key={key} label={label} hint={list.length ? undefined : `Eigene ${f.assetKind === 'image' ? 'Bilder' : 'Töne'} fügst du rechts unter „Inhalte“ hinzu (Auswahl aufheben).`}>
            <Select value={value} options={opts} onChange={(v) => setField(key, v)} testId={`fi-${key}`} />
          </Field>
        )
      }
      default:
        return null
    }
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
          .filter((k) => k !== 'VAR' && !k.endsWith('*'))
          .map(fieldControl)}
        {d.varName !== undefined && (
          <Field label={d.type.startsWith('vd_list') ? 'Liste' : 'Variable'}>
            <input className="finput" list={d.type.startsWith('vd_list') ? 'flow-lists' : 'flow-vars'} value={d.varName} maxLength={40} onChange={(e) => onChange({ varName: e.target.value.replace(/[{}]/g, '') })} />
          </Field>
        )}
        {kind.values.map((vs) => (
          <Field key={vs.key} label={vs.label} hint={vs.type === 'text' ? 'Tipp: {Variablenname} im Text wird beim Ausführen ersetzt.' : undefined}>
            <ValueInput value={d.values[vs.key]} type={vs.type} unit={vs.unit} ctx={ctx} onChange={(v) => setVal(vs.key, v)} testId={`fv-${vs.key}`} />
          </Field>
        ))}
        {d.cond && (
          <Field label={d.type === 'vd_wait_until' ? 'Warten, bis …' : 'Bedingung'}>
            <CondEditor cond={d.cond} ctx={ctx} onChange={(cond) => onChange({ cond })} />
          </Field>
        )}
        {d.cases && (
          <Field label="Fälle" hint="Ein Ausgang pro Fall. Passt keiner, geht es bei „Sonst“ weiter.">
            <div className="fcases">
              {d.cases.map((c, i) => (
                <div className="fcases-row" key={i}>
                  <span className="fcases-n">{i + 1}</span>
                  <input className="finput" value={c} maxLength={100} onChange={(e) => onChange({ cases: d.cases!.map((x, j) => (j === i ? e.target.value : x)) })} data-testid={`case-${i}`} />
                  <button className="ficon-btn" title="Fall entfernen" onClick={() => onRemoveCase(i)}>
                    <FlowIcon name="trash" size={14} />
                  </button>
                </div>
              ))}
              {d.cases.length < 20 && (
                <button className="fbtn ghost" onClick={() => onChange({ cases: [...d.cases!, ''] })} data-testid="case-add">
                  <FlowIcon name="plus" size={14} /> Fall hinzufügen
                </button>
              )}
            </div>
          </Field>
        )}
        {isEmpty(d) && <p className="finsp-empty">Keine Einstellungen nötig.</p>}
      </div>
      <div className="finsp-foot">
        <button className="ficon-btn" onClick={onDuplicate} title="Duplizieren">
          <FlowIcon name="copy" size={16} />
        </button>
        <button className="ficon-btn danger" onClick={onDelete} title="Löschen (Entf)" data-testid="fnode-delete">
          <FlowIcon name="trash" size={16} />
        </button>
      </div>
      <datalist id="flow-vars">
        {ctx.variables.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="flow-lists">
        {ctx.lists.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="flow-signals">
        {ctx.signals.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="flow-store">
        {ctx.storeKeys.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
    </div>
  )
}

function isEmpty(d: FlowNodeData): boolean {
  const spec = BLOCKS[d.type]
  return Object.keys(spec.fields).filter((k) => k !== 'VAR').length === 0 && !KINDS[d.type].values.length && !d.cond && !d.cases && d.varName === undefined
}

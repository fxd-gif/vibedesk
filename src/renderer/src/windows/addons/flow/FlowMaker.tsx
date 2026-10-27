import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { api, errorText } from '../../../api'
import { ADDON_SCHEME, type AddonPackage } from '../../../../../shared/addonFormat'
import { sniffAsset } from '../../../../../shared/addonValidate'
import { useAddons } from '../../../store/addonStore'
import { alert } from '../../../store/dialogStore'
import { canConnect, graphToProgram, isTrigger, KINDS, newNode, outputsOf, programToGraph, unreachable, type FlowEdge, type FlowNode, type FlowNodeData, type Handle, type Val } from '../../../addons/flowModel'
import { AddonRunner, realClock, type TraceHook } from '../../../addons/interpreter'
import { applyStep, emptyDebug, expireDebug, sampleEvent, type DebugGraph } from '../../../addons/flowDebug'
import { useSessions } from '../../../store/sessionStore'
import { createActions } from '../../../addons/actions'
import { addonStorage, pauseForTest, setTestRunner } from '../../../addons/runtime'
import { NodeCard } from './NodeCard'
import { Palette, DRAG_TYPE } from './Palette'
import { NodeInspector, type InspectorContext } from './Inspector'
import { AddonMeta, type Meta } from './AddonMeta'
import { FlowIcon } from './FlowIcon'
import { DebugLog, FlowTest } from './DebugLog'
import { TEMPLATES, templateGraph } from '../../../addons/templates'
import { t } from '../../../../../shared/i18n'
import './flow.css'

type RFNode = Node<FlowNodeData, 'card'>
type Snap = { nodes: RFNode[]; edges: Edge[] }

const NODE_TYPES = { card: NodeCard }
const NODE_W = 230
const CAT_COLOR = { trigger: '#8b7cf6', claude: '#f59e6b', action: '#5b8cff', logic: '#8a97b3', tool: '#34d399', advanced: '#f472b6' }
const HANDLE_COLOR: Record<string, string> = { yes: '#34d399', no: '#f87171', default: '#8a97b3' }

const toRF = (n: FlowNode): RFNode => ({ id: n.id, type: 'card', position: n.position, data: n.data })
const fromRF = (n: RFNode): FlowNode => ({ id: n.id, position: n.position, data: n.data })
const toFlowEdges = (es: Edge[]): FlowEdge[] => es.map((e) => ({ id: e.id, source: e.source, sourceHandle: (e.sourceHandle ?? 'next') as Handle, target: e.target }))
const edgeOf = (source: string, sourceHandle: string, target: string): Edge => ({ id: `${source}-${sourceHandle}-${target}`, source, sourceHandle, target })

function starter(): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const trig = newNode('vd_on_session_done', { x: 80, y: 60 })
  const a = newNode('vd_play_sound', { x: 80, y: 200 })
  return { nodes: [trig, a], edges: [{ id: `${trig.id}-next-${a.id}`, source: trig.id, sourceHandle: 'next', target: a.id }] }
}

function ZoomBar({ onUndo, onRedo, canUndo, canRedo }: { onUndo(): void; onRedo(): void; canUndo: boolean; canRedo: boolean }): React.JSX.Element {
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  return (
    <div className="fzoom">
      <button onClick={() => void zoomOut({ duration: 150 })} title={t('Verkleinern')}>
        <FlowIcon name="minus" size={15} />
      </button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onClick={() => void zoomIn({ duration: 150 })} title={t('Vergrößern')}>
        <FlowIcon name="plus" size={15} />
      </button>
      <i />
      <button onClick={() => void fitView({ padding: 0.25, duration: 200, maxZoom: 1.1 })} title={t('Alles zeigen')}>
        <FlowIcon name="fit" size={15} />
      </button>
      <i />
      <button onClick={onUndo} disabled={!canUndo} title={t('Rückgängig (Strg+Z)')}>
        <FlowIcon name="undo" size={15} />
      </button>
      <button onClick={onRedo} disabled={!canRedo} title={t('Wiederholen (Strg+Y)')}>
        <FlowIcon name="redo" size={15} />
      </button>
    </div>
  )
}

function Editor({ editId, templateId, onBack }: { editId: string | null; templateId: string | null; onBack(): void }): React.JSX.Element {
  const [id] = useState(() => editId ?? crypto.randomUUID())
  const [nodes, setNodes, onNodesChange] = useNodesState<RFNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [meta, setMeta] = useState<Meta>({ name: '', author: '', description: '', version: 1, prompts: [], assets: {} })
  const [loaded, setLoaded] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ kind: 'saved' | 'dirty' | 'saving' | 'error'; text: string }>({ kind: 'saved', text: t('Gespeichert') })
  const [dirty, setDirty] = useState(0)
  const { screenToFlowPosition, setCenter, getZoom } = useReactFlow()
  const canvas = useRef<HTMLDivElement>(null)

  // ---------- Testmodus: Ablauf sichtbar machen ----------
  const runner = useRef<AddonRunner | null>(null)
  const debug = useRef(emptyDebug())
  const [debugRev, setDebugRev] = useState(0)
  const frame = useRef(0)
  /** höchstens ein Neuzeichnen pro Bild, auch wenn der Ablauf viele Schritte macht */
  const redraw = useCallback(() => {
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      setDebugRev((r) => r + 1)
    })
  }, [])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const latest = useRef({ nodes, edges, meta })
  latest.current = { nodes, edges, meta }

  // ---------- Verlauf (Rückgängig/Wiederholen) ----------
  const hist = useRef<{ past: Snap[]; future: Snap[]; base: Snap | null }>({ past: [], future: [], base: null })
  const [histRev, setHistRev] = useState(0)
  const commitTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clean = (n: RFNode[]): RFNode[] => n.map((x) => ({ ...x, selected: false, dragging: false }))
  const commit = useCallback((delay = 0) => {
    clearTimeout(commitTimer.current)
    commitTimer.current = setTimeout(() => {
      const h = hist.current
      const now = { nodes: clean(latest.current.nodes), edges: latest.current.edges }
      if (h.base) h.past = [...h.past.slice(-99), h.base]
      h.base = now
      h.future = []
      setHistRev((r) => r + 1)
      setDirty((d) => d + 1)
    }, delay)
  }, [])
  const restore = (dir: 'undo' | 'redo'): void => {
    const h = hist.current
    const from = dir === 'undo' ? h.past : h.future
    const snap = from.pop()
    if (!snap) return
    if (h.base) (dir === 'undo' ? h.future : h.past).push(h.base)
    h.base = snap
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setHistRev((r) => r + 1)
    setDirty((d) => d + 1)
  }

  // ---------- Laden ----------
  useEffect(() => {
    let cancelled = false
    const existing = editId ? useAddons.getState().list.find((a) => a.manifest.id === editId) : undefined
    void (async () => {
      let graph = starter()
      if (existing) {
        const m = existing.manifest
        const assets: Record<string, Uint8Array> = {}
        for (const n of existing.assetNames) {
          const res = await fetch(`${ADDON_SCHEME}://${m.id}/${encodeURIComponent(n)}`)
          assets[n] = new Uint8Array(await res.arrayBuffer())
        }
        if (cancelled) return
        setMeta({ name: m.name, author: m.author, description: m.description, version: m.version, prompts: Object.entries(m.prompts ?? {}).map(([n, text], i) => ({ key: i, name: n, text })), assets })
        graph = programToGraph(existing.program)
      } else if (templateId) {
        const tpl = TEMPLATES.find((x) => x.id === templateId)
        if (tpl) {
          graph = templateGraph(tpl)
          setMeta((m) => ({ ...m, name: tpl.name, description: tpl.description, prompts: Object.entries(tpl.prompts ?? {}).map(([n, text], i) => ({ key: i, name: n, text })) }))
        }
      }
      const ns = graph.nodes.map(toRF)
      const es = graph.edges.map((e) => edgeOf(e.source, e.sourceHandle, e.target))
      setNodes(ns)
      setEdges(es)
      hist.current = { past: [], future: [], base: { nodes: ns, edges: es } }
      setLoaded(true)
      setStatus(existing ? { kind: 'saved', text: t('Gespeichert') } : { kind: 'dirty', text: t('Noch nicht gespeichert') })
    })()
    return () => {
      cancelled = true
      runner.current = null
      setTestRunner(null)
    }
  }, [editId, templateId, setNodes, setEdges])

  // ---------- Kontext für das Einstellungs-Panel ----------
  const ctx: InspectorContext = useMemo(() => {
    const kinds = Object.entries(meta.assets).map(([n, b]) => [n, sniffAsset(b)?.kind] as const)
    const vars = new Set<string>()
    const lists = new Set<string>()
    const keys = new Set<string>()
    const signals = new Set<string>()
    const walk = (v: Val | undefined): void => {
      if (!v) return
      if (v.k === 'var') vars.add(v.name)
      if (v.k === 'list') lists.add(v.name)
      if (v.k === 'store') keys.add(v.key)
      if (v.k === 'calc') (walk(v.a), walk(v.b))
      if (v.k === 'list') walk(v.arg)
    }
    for (const n of nodes) {
      const d = n.data
      if (d.varName) (d.type.startsWith('vd_list') ? lists : vars).add(d.varName)
      if (d.type === 'vd_store_set') keys.add(String(d.fields.KEY))
      if (d.type === 'vd_emit' || d.type === 'vd_on_signal') signals.add(String(d.fields.NAME))
      Object.values(d.values).forEach(walk)
      d.cond?.items.forEach((c) => (walk(c.a), walk(c.b)))
    }
    return {
      images: kinds.filter(([, k]) => k === 'image').map(([n]) => n),
      sounds: kinds.filter(([, k]) => k === 'sound').map(([n]) => n),
      prompts: meta.prompts.map((p) => p.name.trim()).filter(Boolean),
      variables: [...vars].sort(),
      lists: [...lists].sort(),
      storeKeys: [...keys].filter(Boolean).sort(),
      signals: [...signals].filter(Boolean).sort()
    }
  }, [nodes, meta])

  // ---------- Bearbeiten ----------
  const flowNodes = (): FlowNode[] => latest.current.nodes.map(fromRF)

  const addNode = (type: string, at?: { x: number; y: number }): void => {
    const all = flowNodes()
    const fe = toFlowEdges(latest.current.edges)
    const sel = latest.current.nodes.find((n) => n.selected)
    let position = at
    let edge: Edge | null = null
    if (!position && sel) {
      const n0 = newNode(type, { x: 0, y: 0 }, '__probe')
      const outs = outputsOf(sel.data)
      const handle = outs.find((h) => canConnect([...all, n0], fe, { source: sel.id, sourceHandle: h, target: n0.id }))
      const side = handle === 'body' || (handle === 'next' && outs.length > 1 && !outs.includes('body'))
      const branch = outs.filter((h) => h !== 'next' && h !== 'body')
      const bi = handle ? branch.indexOf(handle) : -1
      const dx = side ? 300 : bi >= 0 ? (bi - (branch.length - 1) / 2) * 260 : 0
      const dy = side ? 90 : 150
      position = { x: sel.position.x + dx, y: sel.position.y + dy }
      if (handle) edge = edgeOf(sel.id, handle, '')
    }
    if (!position) {
      const r = canvas.current?.getBoundingClientRect()
      const c = r ? screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 3 }) : { x: 0, y: 0 }
      position = { x: c.x - NODE_W / 2, y: c.y }
    }
    const n = newNode(type, position)
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...toRF(n), selected: true }])
    if (edge) setEdges((es) => [...es, edgeOf(edge!.source, edge!.sourceHandle!, n.id)])
    commit()
  }

  const updateData = (nodeId: string, patch: Partial<FlowNodeData>): void => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)))
    commit(400)
  }

  /** Fall bei „Je nach Wert“ entfernen: Verbindung des Falls weg, spätere Fälle rücken nach. */
  const removeCase = (nodeId: string, idx: number): void => {
    setNodes((ns) => ns.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, cases: (n.data.cases ?? []).filter((_, i) => i !== idx) } } : n)))
    setEdges((es) =>
      es.flatMap((e) => {
        const m = e.source === nodeId ? /^case(\d+)$/.exec(e.sourceHandle ?? '') : null
        if (!m) return [e]
        const j = Number(m[1])
        if (j === idx) return []
        return [j > idx ? edgeOf(e.source, `case${j - 1}`, e.target) : e]
      })
    )
    commit()
  }

  const removeNode = (nodeId: string): void => {
    setNodes((ns) => ns.filter((n) => n.id !== nodeId))
    setEdges((es) => es.filter((e) => e.source !== nodeId && e.target !== nodeId))
    commit()
  }

  const duplicate = (nodeId: string): void => {
    const src = latest.current.nodes.find((n) => n.id === nodeId)
    if (!src) return
    const n = newNode(src.data.type, { x: src.position.x + 40, y: src.position.y + 40 })
    n.data = structuredClone(src.data)
    setNodes((ns) => [...ns.map((x) => ({ ...x, selected: false })), { ...toRF(n), selected: true }])
    commit()
  }

  const isValidConnection = useCallback(
    (c: Connection | Edge) => canConnect(latest.current.nodes.map(fromRF), toFlowEdges(latest.current.edges), { source: c.source, sourceHandle: c.sourceHandle ?? null, target: c.target }),
    []
  )
  const onConnect = useCallback(
    (c: Connection) => {
      if (!isValidConnection(c)) return
      setEdges((es) => [...es, edgeOf(c.source, c.sourceHandle ?? 'next', c.target)])
      commit()
    },
    [isValidConnection, setEdges, commit]
  )

  // ---------- Speichern / Testen / Export ----------
  const build = useCallback(
    async (bumpVersion = false): Promise<AddonPackage | null> => {
      const { meta: m, nodes: ns, edges: es } = latest.current
      if (!m.name.trim()) return null
      const promptMap: Record<string, string> = {}
      for (const p of m.prompts) if (p.name.trim()) promptMap[p.name.trim().slice(0, 60)] = p.text
      const version = bumpVersion ? m.version + 1 : m.version
      if (bumpVersion) setMeta((x) => ({ ...x, version }))
      return {
        manifest: {
          id,
          name: m.name.trim().slice(0, 60),
          author: m.author.trim().slice(0, 60),
          description: m.description.slice(0, 500),
          version,
          formatVersion: 1,
          createdWith: await api.update.version(),
          capabilities: [],
          prompts: promptMap
        },
        program: graphToProgram(ns.map(fromRF), toFlowEdges(es)),
        assets: m.assets
      }
    },
    [id]
  )

  const save = useCallback(
    async (opts: { bumpVersion?: boolean; quiet?: boolean } = {}): Promise<boolean> => {
      const p = await build(opts.bumpVersion)
      if (!p) {
        setStatus({ kind: 'error', text: t('Name fehlt') })
        if (!opts.quiet) await alert(t('Bitte gib deinem Addon zuerst einen Namen.'))
        return false
      }
      setStatus({ kind: 'saving', text: t('Speichert …') })
      try {
        await api.addons.saveDraft(p)
        await useAddons.getState().reload()
        setStatus({ kind: 'saved', text: t('Gespeichert') })
        return true
      } catch (err) {
        setStatus({ kind: 'error', text: t('Nicht gespeichert') })
        if (!opts.quiet) await alert(t('Speichern fehlgeschlagen'), errorText(err))
        return false
      }
    },
    [build]
  )

  // automatisch speichern, 3 s nach der letzten Änderung – nur mit Namen
  useEffect(() => {
    if (!dirty) return
    setStatus(meta.name.trim() ? { kind: 'dirty', text: t('Ungespeichert') } : { kind: 'error', text: t('Name fehlt') })
    if (!meta.name.trim() || testing) return
    const timer = setTimeout(() => void save({ quiet: true }), 3000)
    return () => clearTimeout(timer)
  }, [dirty, meta, testing, save])

  const setMetaDirty = (patch: Partial<Meta>): void => {
    setMeta((m) => ({ ...m, ...patch }))
    setDirty((d) => d + 1)
  }

  const stopDebug = (): void => {
    runner.current = null
    const s = debug.current
    s.active.clear()
    s.recent.clear()
    s.hot.clear()
    redraw()
  }

  const toggleTest = async (): Promise<void> => {
    if (testing) {
      stopDebug()
      setTestRunner(null)
      setTesting(false)
      return
    }
    if (!latest.current.meta.name.trim()) return void (await alert(t('Bitte gib deinem Addon zuerst einen Namen.')))
    pauseForTest(id)
    if (!(await save())) return void setTestRunner(null)
    const p = await build()
    if (!p) return void setTestRunner(null)
    debug.current = emptyDebug()
    const graph: DebugGraph = {
      node: (nid) => latest.current.nodes.find((n) => n.id === nid)?.data,
      inEdge: (nid) => latest.current.edges.find((e) => e.target === nid)?.id
    }
    let self: AddonRunner | null = null
    // Schritte eines alten Test-Runners (nach Stopp oder Neustart) zählen nicht mehr
    const onStep: TraceHook = (nid, phase, info) => {
      if (!self || runner.current !== self) return
      applyStep(debug.current, graph, nid, phase, info, Date.now())
      redraw()
    }
    const r = new AddonRunner({ program: p.program, prompts: p.manifest.prompts, actions: createActions(id, p.manifest.name), clock: realClock, storage: addonStorage(id), onError: (m) => setStatus({ kind: 'error', text: t('Fehler: {error}', { error: m }) }), onStep })
    self = r
    runner.current = r
    setTestRunner(r, id)
    setTesting(true)
    redraw()
  }

  /** „▶ Auslösen“: Beispiel-Ereignis an genau diesen Auslöser im laufenden Test */
  const fire = useCallback((nodeId: string) => {
    const n = latest.current.nodes.find((x) => x.id === nodeId)
    const r = runner.current
    if (!n || !r) return
    const e = sampleEvent(n.data, { project: useSessions.getState().sessions[0]?.name })
    if (!e) return
    if (!r.fire(nodeId, e)) setStatus({ kind: 'dirty', text: t('Neuer Auslöser – starte den Test neu, damit er mitläuft') })
  }, [])
  const testCtx = useMemo(() => (testing ? { fire } : null), [testing, fire])

  // Nachglimmen auslaufen lassen
  useEffect(() => {
    const timer = setInterval(() => {
      if (expireDebug(debug.current, Date.now())) setDebugRev((r) => r + 1)
    }, 200)
    return () => clearInterval(timer)
  }, [])

  /** Klick im Protokoll: Knoten auswählen und in die Mitte holen */
  const pickNode = (nodeId: string): void => {
    const n = latest.current.nodes.find((x) => x.id === nodeId)
    if (!n) return
    setNodes((ns) => ns.map((x) => ({ ...x, selected: x.id === nodeId })))
    void setCenter(n.position.x + (n.measured?.width ?? NODE_W) / 2, n.position.y + (n.measured?.height ?? 70) / 2, { duration: 250, zoom: Math.max(0.8, getZoom()) })
  }

  const exportFile = async (): Promise<void> => {
    if (!(await save({ bumpVersion: true }))) return
    try {
      const path = await api.addons.exportTo(id)
      if (path) setStatus({ kind: 'saved', text: t('Exportiert') })
    } catch (err) {
      await alert(t('Export fehlgeschlagen'), errorText(err))
    }
  }

  // ---------- Darstellung ----------
  const dim = useMemo(() => unreachable(nodes.map(fromRF), toFlowEdges(edges)), [nodes, edges])
  const shownNodes = useMemo(() => {
    void debugRev
    const { active, recent } = debug.current
    return nodes.map((n) => {
      const cls = [dim.has(n.id) && 'is-dim', active.has(n.id) ? 'is-run' : recent.has(n.id) && 'is-recent'].filter(Boolean).join(' ')
      return cls ? { ...n, className: cls } : n
    })
  }, [nodes, dim, debugRev])
  const shownEdges = useMemo(() => {
    void debugRev
    const { hot } = debug.current
    const cat = new Map(nodes.map((n) => [n.id, KINDS[n.data.type].category]))
    return edges.map((e) => {
      const color = HANDLE_COLOR[e.sourceHandle as Handle] ?? CAT_COLOR[cat.get(e.source) ?? 'action']
      const cls = [dim.has(e.target) && 'is-dim', hot.has(e.id) && 'is-hot'].filter(Boolean).join(' ')
      return { ...e, style: { stroke: color, strokeWidth: 1.8 }, className: cls }
    })
  }, [edges, nodes, dim, debugRev])
  const selected = nodes.filter((n) => n.selected)
  const one = selected.length === 1 ? selected[0] : null

  void histRev
  const h = hist.current

  return (
    <div
      className="fmaker"
      onKeyDown={(e) => {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
        if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') (e.preventDefault(), restore('undo'))
        if (e.ctrlKey && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) (e.preventDefault(), restore('redo'))
      }}
    >
      <header className="fbar">
        <button className="fbar-back" onClick={onBack} title={t('Zurück zu Meine Addons')}>
          <FlowIcon name="chevron" size={16} />
        </button>
        <span className="fbar-logo">
          <FlowIcon name="puzzle" size={17} />
        </span>
        <span className="fbar-crumb" onClick={onBack}>
          {t('Addons')}
        </span>
        <span className="fbar-sep">/</span>
        <input className="fbar-name" placeholder={t('Name deines Addons')} value={meta.name} maxLength={60} onChange={(e) => setMetaDirty({ name: e.target.value })} data-testid="maker-name" />
        <span className={`fbar-status ${status.kind}`} data-testid="maker-status">
          <i />
          {status.text}
        </span>
        <button className={`fbtn${testing ? ' danger' : ''}`} onClick={() => void toggleTest()} data-testid="maker-test">
          <FlowIcon name={testing ? 'x' : 'play'} size={14} /> {testing ? t('Test stoppen') : t('Testen')}
        </button>
        <button className="fbtn" onClick={() => void save()} data-testid="maker-save">
          {t('Speichern')}
        </button>
        <button className="fbtn primary" onClick={() => void exportFile()} data-testid="maker-export">
          {t('Exportieren')}
        </button>
      </header>
      <div className="fbody">
        <Palette onAdd={(type) => addNode(type)} />
        <div
          className="fcanvas"
          ref={canvas}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes(DRAG_TYPE)) {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }
          }}
          onDrop={(e) => {
            const type = e.dataTransfer.getData(DRAG_TYPE)
            if (!type || !KINDS[type]) return
            e.preventDefault()
            const p = screenToFlowPosition({ x: e.clientX, y: e.clientY })
            addNode(type, { x: p.x - NODE_W / 2, y: p.y - 30 })
          }}
        >
          {loaded && (
            <FlowTest.Provider value={testCtx}>
              <ReactFlow
                nodes={shownNodes}
                edges={shownEdges}
                nodeTypes={NODE_TYPES}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                isValidConnection={isValidConnection}
                onNodeDragStop={() => commit()}
                onNodesDelete={() => commit()}
                onEdgesDelete={() => commit()}
                deleteKeyCode={['Delete', 'Backspace']}
                colorMode="dark"
                fitView
                fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                minZoom={0.2}
                maxZoom={1.8}
                snapToGrid
                snapGrid={[10, 10]}
                proOptions={{ hideAttribution: true }}
                defaultEdgeOptions={{ type: 'default' }}
                connectionLineStyle={{ stroke: '#9fb8ff', strokeWidth: 1.8 }}
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} color="rgba(255,255,255,0.09)" />
                <ZoomBar onUndo={() => restore('undo')} onRedo={() => restore('redo')} canUndo={h.past.length > 0} canRedo={h.future.length > 0} />
              </ReactFlow>
            </FlowTest.Provider>
          )}
          {(testing || debug.current.log.length > 0) && (
            <DebugLog
              log={debug.current.log}
              testing={testing}
              onPick={pickNode}
              onClear={() => {
                debug.current.log = []
                setDebugRev((r) => r + 1)
              }}
            />
          )}
        </div>
        <aside className="fside">
          {one ? (
            <NodeInspector
              key={one.id}
              node={fromRF(one)}
              ctx={ctx}
              onChange={(p) => updateData(one.id, p)}
              onRemoveCase={(i) => removeCase(one.id, i)}
              onDelete={() => removeNode(one.id)}
              onDuplicate={() => duplicate(one.id)}
              onFire={testing && isTrigger(one.data.type) ? () => fire(one.id) : undefined}
            />
          ) : (
            <AddonMeta meta={meta} onChange={setMetaDirty} />
          )}
        </aside>
      </div>
    </div>
  )
}

export function FlowMaker({ editId, templateId = null, onBack }: { editId: string | null; templateId?: string | null; onBack(): void }): React.JSX.Element {
  return (
    <ReactFlowProvider>
      <Editor editId={editId} templateId={templateId} onBack={onBack} />
    </ReactFlowProvider>
  )
}

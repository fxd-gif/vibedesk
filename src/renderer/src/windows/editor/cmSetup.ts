import { basicSetup } from 'codemirror'
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view'
import { indentWithTab } from '@codemirror/commands'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { css } from '@codemirror/lang-css'
import { html } from '@codemirror/lang-html'
import { markdown } from '@codemirror/lang-markdown'
import { python } from '@codemirror/lang-python'
import { yaml } from '@codemirror/lang-yaml'

export function languageFor(file: string): Extension {
  const ext = file.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'ts':
    case 'mts':
    case 'cts':
      return javascript({ typescript: true })
    case 'tsx':
      return javascript({ typescript: true, jsx: true })
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return javascript({ jsx: true })
    case 'json':
    case 'jsonc':
      return json()
    case 'css':
    case 'scss':
    case 'less':
      return css()
    case 'html':
    case 'htm':
    case 'vue':
    case 'svelte':
      return html()
    case 'md':
    case 'mdx':
    case 'markdown':
      return markdown()
    case 'py':
      return python()
    case 'yml':
    case 'yaml':
      return yaml()
    default:
      return []
  }
}

/** Glas-Look: transparenter Hintergrund, Farben aus dem VibeDesk-Akzent. */
const theme = EditorView.theme(
  {
    '&': { height: '100%', color: 'var(--text)', backgroundColor: 'transparent', fontSize: '13px' },
    '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.6' },
    '.cm-content': { caretColor: 'var(--accent)', padding: '8px 0' },
    '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'rgba(159, 184, 255, 0.22) !important' },
    '.cm-gutters': { backgroundColor: 'transparent', color: 'rgba(223, 229, 239, 0.28)', border: 'none' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'rgba(223, 229, 239, 0.7)' },
    '.cm-activeLine': { backgroundColor: 'rgba(255, 255, 255, 0.035)' },
    '.cm-foldPlaceholder': { backgroundColor: 'rgba(255,255,255,.08)', border: 'none', color: 'var(--text-dim)' },
    '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(159, 184, 255, 0.18)', outline: 'none' },
    '.cm-searchMatch': { backgroundColor: 'rgba(250, 204, 21, 0.18)' },
    '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'rgba(250, 204, 21, 0.35)' },
    '.cm-selectionMatch': { backgroundColor: 'rgba(255, 255, 255, 0.07)' },
    '.cm-panels': { backgroundColor: 'rgba(10, 13, 20, 0.85)', color: 'var(--text)', backdropFilter: 'blur(12px)' },
    '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--glass-border)' },
    '.cm-panels.cm-panels-bottom': { borderTop: '1px solid var(--glass-border)' },
    '.cm-panel input, .cm-panel button': { fontFamily: 'inherit' },
    '.cm-tooltip': { backgroundColor: 'rgba(14, 18, 26, 0.95)', border: '1px solid var(--glass-border)', borderRadius: '8px' },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'rgba(159, 184, 255, 0.2)', color: 'var(--text)' },
    '.cm-flash': { backgroundColor: 'rgba(159, 184, 255, 0.16)', transition: 'background-color 600ms' }
  },
  { dark: true }
)

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: '#c4a7ff' },
  { tag: [t.string, t.special(t.string), t.regexp], color: '#a5e3a0' },
  { tag: [t.number, t.bool, t.null, t.atom], color: '#ffb877' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'rgba(223, 229, 239, 0.38)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#8ec7ff' },
  { tag: [t.typeName, t.className, t.namespace], color: '#7fe0d4' },
  { tag: [t.propertyName, t.attributeName], color: '#b9c8ff' },
  { tag: [t.tagName], color: '#ff9fb2' },
  { tag: [t.definition(t.variableName)], color: '#e6ecf5' },
  { tag: [t.heading], color: '#9fb8ff', fontWeight: '600' },
  { tag: [t.link, t.url], color: '#8ec7ff', textDecoration: 'underline' },
  { tag: [t.emphasis], fontStyle: 'italic' },
  { tag: [t.strong], fontWeight: '600' },
  { tag: [t.punctuation, t.bracket, t.operator], color: 'rgba(223, 229, 239, 0.7)' },
  { tag: t.invalid, color: '#f87171' }
])

// Kurzes Aufleuchten der Zeilen, die Claude gerade geändert hat
export const flashEffect = StateEffect.define<{ from: number; to: number } | null>()
const flashLine = Decoration.line({ class: 'cm-flash' })

const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (!e.is(flashEffect)) continue
      if (!e.value) return Decoration.none
      const doc = tr.state.doc
      const first = doc.lineAt(e.value.from).number
      const last = doc.lineAt(e.value.to).number
      const ranges = []
      for (let n = first; n <= Math.min(last, first + 200); n++) ranges.push(flashLine.range(doc.line(n).from))
      deco = Decoration.set(ranges)
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Springt zum Text und lässt die Zeilen ~2 s aufleuchten. false, wenn nicht gefunden. */
export function revealText(view: EditorView, find: string): boolean {
  const doc = view.state.doc.toString()
  let from = doc.indexOf(find)
  if (from < 0) from = doc.indexOf(find.trim())
  if (from < 0 || !find.trim()) return false
  const to = from + (doc.indexOf(find) === from ? find.length : find.trim().length)
  view.dispatch({
    selection: { anchor: from },
    effects: [EditorView.scrollIntoView(from, { y: 'center' }), flashEffect.of({ from, to: Math.max(from, to - 1) })]
  })
  setTimeout(() => {
    if (view.dom.isConnected) view.dispatch({ effects: flashEffect.of(null) })
  }, 2200)
  return true
}

export function createState(doc: string, file: string, extra: Extension[]): EditorState {
  return EditorState.create({
    doc,
    extensions: [basicSetup, keymap.of([indentWithTab]), theme, syntaxHighlighting(highlight), flashField, languageFor(file), ...extra]
  })
}

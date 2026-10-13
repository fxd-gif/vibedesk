// Kleines, sicheres Markdown für Notizen: Überschriften, Listen, Code, fett, `code` und [[Links]] – kein HTML.
import { Fragment, type ReactNode } from 'react'

const INLINE = /(\[\[[^\]\n]+\]\]|`[^`\n]+`|\*\*[^*\n]+\*\*)/g

function inline(text: string, onLink: (title: string) => void, key: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const k = `${key}-${i}`
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const inner = part.slice(2, -2)
      const [target, alias] = inner.split('|')
      const title = target.split('#')[0].trim()
      return (
        <button key={k} className="md-link" onClick={() => onLink(title)}>
          {alias?.trim() || target.trim()}
        </button>
      )
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) return <code key={k}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={k}>{part.slice(2, -2)}</b>
    return <Fragment key={k}>{part}</Fragment>
  })
}

export function Markdown({ text, onLink }: { text: string; onLink: (title: string) => void }): React.JSX.Element {
  const out: ReactNode[] = []
  const lines = text.split(/\r?\n/)
  let list: ReactNode[] = []
  const flush = (): void => {
    if (list.length) out.push(<ul key={'ul' + out.length}>{list}</ul>)
    list = []
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (l.trim().startsWith('```')) {
      flush()
      const code: string[] = []
      while (++i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i])
      out.push(<pre key={'pre' + i}>{code.join('\n')}</pre>)
      continue
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(l)
    if (h) {
      flush()
      const H = (`h${Math.min(h[1].length + 2, 6)}` as 'h3')
      out.push(<H key={'h' + i}>{inline(h[2], onLink, 'h' + i)}</H>)
      continue
    }
    const li = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l)
    if (li) {
      list.push(<li key={'li' + i}>{inline(li[1], onLink, 'li' + i)}</li>)
      continue
    }
    flush()
    if (l.trim()) out.push(<p key={'p' + i}>{inline(l, onLink, 'p' + i)}</p>)
  }
  flush()
  return <div className="md">{out}</div>
}

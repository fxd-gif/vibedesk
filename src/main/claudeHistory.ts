// Liest frühere Claude-Code-Sessions eines Projekts aus ~/.claude/projects/<ordner>/<id>.jsonl
import { t } from '../shared/i18n'
import fs from 'fs'
import path from 'path'
import type { ClaudeSessionMeta } from '../shared/types'

const HEAD = 512 * 1024
const TAIL = 256 * 1024

export function claudeProjectDirName(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

function findDir(cwd: string, root: string): string | null {
  const want = claudeProjectDirName(cwd).toLowerCase()
  try {
    const hit = fs.readdirSync(root).find((d) => d.toLowerCase() === want)
    return hit ? path.join(root, hit) : null
  } catch {
    return null
  }
}

function readChunks(file: string, size: number): string[] {
  const fd = fs.openSync(file, 'r')
  try {
    const head = Buffer.alloc(Math.min(HEAD, size))
    fs.readSync(fd, head, 0, head.length, 0)
    const out = [head.toString('utf8')]
    if (size > HEAD) {
      const tail = Buffer.alloc(Math.min(TAIL, size - HEAD))
      fs.readSync(fd, tail, 0, tail.length, size - tail.length)
      out.push(tail.toString('utf8'))
    }
    return out
  } finally {
    fs.closeSync(fd)
  }
}

function promptText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const t = content.find((c) => c && typeof c === 'object' && (c as { type?: string }).type === 'text') as { text?: string } | undefined
    return t?.text ?? ''
  }
  return ''
}

function titleFrom(chunks: string[]): string {
  let aiTitle = ''
  let prompt = ''
  for (const chunk of chunks)
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('{')) continue
      let e: Record<string, any>
      try {
        e = JSON.parse(line)
      } catch {
        continue
      }
      if (e.type === 'ai-title' && typeof e.aiTitle === 'string') aiTitle = e.aiTitle
      else if (!prompt && e.type === 'user' && !e.isMeta && e.message?.role === 'user') {
        const text = promptText(e.message.content).trim()
        const args = /<command-args>([\s\S]*?)<\/command-args>/.exec(text)?.[1]?.trim()
        if (args) prompt = args
        else if (text && !text.startsWith('<')) prompt = text
      }
    }
  const title = (aiTitle || prompt).replace(/\s+/g, ' ').trim()
  if (!title) return t('Ohne Titel')
  return title.length > 80 ? title.slice(0, 79) + '…' : title
}

export function listClaudeSessions(cwd: string, projectsRoot: string, limit = 15): ClaudeSessionMeta[] {
  const dir = findDir(cwd, projectsRoot)
  if (!dir) return []
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith('.jsonl'))
    .map((d) => {
      const file = path.join(dir, d.name)
      const st = fs.statSync(file)
      return { file, id: d.name.slice(0, -6), mtime: st.mtimeMs, size: st.size }
    })
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit)
    .map(({ file, id, mtime, size }) => ({ id, mtime, size, title: titleFrom(readChunks(file, size)) }))
}

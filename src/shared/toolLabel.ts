// Werkzeugaufrufe im Klartext: „mcp__vibedesk-brain__brain_search“ sagt einem Menschen nichts.
// Gilt für den Live-Feed und für „was Claude gerade tut“ – Claude-eigene Werkzeuge (Read, Bash …) bleiben, wie sie sind.
import { t } from './i18n'

/** Name des MCP-Servers, über den VibeDesk Claude seine Werkzeuge gibt (Gehirn + Desktop) – wie BRAIN_SERVER in main/hookSettings.ts */
export const VIBEDESK_MCP = 'vibedesk-brain'

/** mcp__server__werkzeug → Teile (Servernamen dürfen einzelne Unterstriche enthalten) */
export function mcpParts(tool: string): { server: string; name: string } | null {
  const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(tool)
  return m ? { server: m[1], name: m[2] } : null
}

/** Werkzeugname bei VibeDesks eigenem MCP-Server, sonst null */
export function vibedeskTool(tool: string): string | null {
  const p = mcpParts(tool)
  return p && p.server === VIBEDESK_MCP ? p.name : null
}

/** Gehirn-Werkzeug (brain_search, brain_write …) – sonst null */
export function brainTool(tool: string): string | null {
  const n = vibedeskTool(tool)
  return n && n.startsWith('brain_') ? n : null
}

/** Schreibt dieses Gehirn-Werkzeug (statt nur zu lesen)? */
export const brainWrites = (name: string): boolean => name === 'brain_write' || name === 'brain_forget'

/** Kurzer Name fürs Feed – unbekannte Werkzeuge bleiben lesbar statt roh */
export function toolLabel(tool: string): string {
  const own = vibedeskTool(tool)
  if (own) {
    switch (own) {
      case 'brain_overview':
        return t('Gehirn-Überblick')
      case 'brain_search':
        return t('Gehirn durchsuchen')
      case 'brain_read':
        return t('Notiz lesen')
      case 'brain_related':
        return t('Wissen zur Datei')
      case 'brain_write':
        return t('Notiz schreiben')
      case 'brain_forget':
        return t('Notiz archivieren')
    }
    if (own.startsWith('desk_scene')) return t('Lebende Szene')
    if (own.startsWith('desk_app')) return t('Werkzeug-Fenster')
    if (own.startsWith('desk_')) return t('VibeDesk bedienen')
    return own
  }
  const p = mcpParts(tool)
  return p ? `${p.server} · ${p.name}` : tool
}

// Farbschemata fürs Terminal. Hintergrund bleibt durchsichtig – das Glasfenster dahinter gibt den Ton an.
import type { ITheme } from '@xterm/xterm'
import { t } from '../../../shared/i18n'
import type { CustomTheme } from '../../../shared/desk'

const glass = {
  background: 'rgba(0,0,0,0)',
  // Linienfarbe der Nacht-Flächen statt Weiß – unter WebGL sonst ein auffälliger grauer Balken
  scrollbarSliderBackground: 'rgba(170,185,215,0.1)',
  scrollbarSliderHoverBackground: 'rgba(170,185,215,0.2)',
  scrollbarSliderActiveBackground: 'rgba(170,185,215,0.28)'
}

export const TERMINAL_THEMES: { id: string; label: string; theme: ITheme }[] = [
  {
    // Nacht-Design der Website: Text ink, Cursor Regen-Blau, Statusfarben als ANSI-Grundfarben – auf der Nacht-Fläche gut lesbar
    id: 'vibedesk',
    label: 'VibeDesk',
    theme: {
      ...glass,
      foreground: '#e3e7ef',
      cursor: '#b5c5dd',
      cursorAccent: '#0c0f18',
      selectionBackground: 'rgba(143,166,200,0.35)',
      selectionForeground: '#ffffff',
      black: '#1b2030', red: '#ff8a8a', green: '#5fd497', yellow: '#f3b94d', blue: '#7aa7ff', magenta: '#b49cff', cyan: '#6ad7e5', white: '#e3e7ef',
      brightBlack: '#6f788a', brightRed: '#ffb0b0', brightGreen: '#8fe3b5', brightYellow: '#f7cf82', brightBlue: '#a4c3ff', brightMagenta: '#cbbaff', brightCyan: '#97e4ee', brightWhite: '#ffffff'
    }
  },
  {
    id: 'wald',
    get label() {
      return t('Wald')
    },
    theme: {
      ...glass,
      foreground: '#dfe8d8',
      cursor: '#a3d977',
      cursorAccent: '#0c120a',
      selectionBackground: 'rgba(163,217,119,0.28)',
      black: '#1c241a', red: '#e8836b', green: '#a3d977', yellow: '#e6c86e', blue: '#7fb4c9', magenta: '#c7a1d6', cyan: '#8fd1b5', white: '#dfe8d8',
      brightBlack: '#5c6b55', brightRed: '#f2a48f', brightGreen: '#c2ec9c', brightYellow: '#f3dc96', brightBlue: '#a5cfdf', brightMagenta: '#dcc0e6', brightCyan: '#b0e5cf', brightWhite: '#f6faf2'
    }
  },
  {
    id: 'neon',
    get label() {
      return t('Neon (Tokyo)')
    },
    theme: {
      ...glass,
      foreground: '#e6e1f5',
      cursor: '#ff7ab6',
      cursorAccent: '#120a17',
      selectionBackground: 'rgba(255,122,182,0.28)',
      black: '#211a2e', red: '#ff6b8b', green: '#7cf0b0', yellow: '#ffd36e', blue: '#7aa8ff', magenta: '#ff7ab6', cyan: '#6fe3f2', white: '#e6e1f5',
      brightBlack: '#675d7e', brightRed: '#ff98ad', brightGreen: '#a6f7cb', brightYellow: '#ffe39c', brightBlue: '#a4c3ff', brightMagenta: '#ffa6cf', brightCyan: '#9cecf7', brightWhite: '#ffffff'
    }
  },
  {
    id: 'kontrast',
    get label() {
      return t('Hoher Kontrast')
    },
    theme: {
      ...glass,
      foreground: '#ffffff',
      cursor: '#ffe14d',
      cursorAccent: '#000000',
      selectionBackground: 'rgba(255,225,77,0.35)',
      black: '#2a2a2a', red: '#ff5c5c', green: '#5cff8a', yellow: '#ffe14d', blue: '#5cb3ff', magenta: '#e07cff', cyan: '#4dfff0', white: '#ffffff',
      brightBlack: '#8a8a8a', brightRed: '#ff8f8f', brightGreen: '#8fffae', brightYellow: '#fff08f', brightBlue: '#8fcbff', brightMagenta: '#eba6ff', brightCyan: '#8ffff6', brightWhite: '#ffffff'
    }
  },
  {
    id: 'mono',
    get label() {
      return t('Ruhig (Graustufen)')
    },
    theme: {
      ...glass,
      foreground: '#d6d6d6',
      cursor: '#ededed',
      cursorAccent: '#111111',
      selectionBackground: 'rgba(255,255,255,0.2)',
      black: '#222222', red: '#d98c8c', green: '#a9c79b', yellow: '#d9c78c', blue: '#9bb0c7', magenta: '#bfa3c7', cyan: '#9bc7c0', white: '#d6d6d6',
      brightBlack: '#6b6b6b', brightRed: '#e6abab', brightGreen: '#c4dbb8', brightYellow: '#e6dab0', brightBlue: '#b8c8db', brightMagenta: '#d4c0db', brightCyan: '#b8dbd5', brightWhite: '#f2f2f2'
    }
  }
]

/** Passend zur Szene: Wald → grün, Tokyo → Neon, sonst VibeDesk */
const BY_SCENE: Record<string, string> = { forest: 'wald', tokyo: 'neon' }

export function resolveTheme(id: string, scene: string, custom?: CustomTheme | null): ITheme {
  // eigenes Schema: auf VibeDesk aufbauen, nur die gesetzten Farben ersetzen (Glas-Hintergrund bleibt)
  if (id === 'custom' && custom) {
    const c = custom.colors
    return { ...TERMINAL_THEMES[0].theme, ...c, ...(c.cursor ? { selectionBackground: c.cursor + '4d' } : {}) }
  }
  const want = id === 'scene' ? (BY_SCENE[scene] ?? 'vibedesk') : id
  return (TERMINAL_THEMES.find((t) => t.id === want) ?? TERMINAL_THEMES[0]).theme
}

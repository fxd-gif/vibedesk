// Farbschemata fürs Terminal. Hintergrund bleibt durchsichtig – das Glasfenster dahinter gibt den Ton an.
import type { ITheme } from '@xterm/xterm'

const glass = {
  background: 'rgba(0,0,0,0)',
  scrollbarSliderBackground: 'rgba(255,255,255,0.08)',
  scrollbarSliderHoverBackground: 'rgba(255,255,255,0.16)',
  scrollbarSliderActiveBackground: 'rgba(255,255,255,0.22)'
}

export const TERMINAL_THEMES: { id: string; label: string; theme: ITheme }[] = [
  {
    id: 'vibedesk',
    label: 'VibeDesk',
    theme: {
      ...glass,
      foreground: '#dfe5ef',
      cursor: '#9fb8ff',
      cursorAccent: '#0b0e14',
      selectionBackground: 'rgba(159,184,255,0.3)',
      black: '#1b2030', red: '#f87171', green: '#4ade80', yellow: '#facc15', blue: '#60a5fa', magenta: '#c084fc', cyan: '#5eead4', white: '#dfe5ef',
      brightBlack: '#5b6478', brightRed: '#fca5a5', brightGreen: '#86efac', brightYellow: '#fde047', brightBlue: '#93c5fd', brightMagenta: '#d8b4fe', brightCyan: '#99f6e4', brightWhite: '#ffffff'
    }
  },
  {
    id: 'wald',
    label: 'Wald',
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
    label: 'Neon (Tokyo)',
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
    label: 'Hoher Kontrast',
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
    label: 'Ruhig (Graustufen)',
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

export function resolveTheme(id: string, scene: string): ITheme {
  const want = id === 'scene' ? (BY_SCENE[scene] ?? 'vibedesk') : id
  return (TERMINAL_THEMES.find((t) => t.id === want) ?? TERMINAL_THEMES[0]).theme
}

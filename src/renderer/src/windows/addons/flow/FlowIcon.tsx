// Strich-Icons für den Flowchart-Editor (24er-Raster, currentColor).
const P: Record<string, string> = {
  power: 'M12 3v8M6.3 7.3a8 8 0 1 0 11.4 0',
  hourglass: 'M7 3h10M7 21h10M8 3c0 4 8 5 8 9s-8 5-8 9M16 3c0 4-8 5-8 9s8 5 8 9',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.5l2.7 2.7L16.5 9.5',
  timer: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  keyboard: 'M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM7 9h.01M11 9h.01M15 9h.01M7 12.5h.01M11 12.5h.01M15 12.5h.01M8 16h8',
  repeat: 'M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4',
  infinity: 'M12 12c-2-2.7-3.6-4-5.5-4a4 4 0 0 0 0 8c1.9 0 3.5-1.3 5.5-4zm0 0c2 2.7 3.6 4 5.5 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.3-5.5 4z',
  image: 'M4 5h16v14H4zM4 16l5-5 4 4 2-2 5 5M15.5 9.5h.01',
  rain: 'M12 3.5c2.8 3.7 5.5 7 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 10.5 9.2 7.2 12 3.5z',
  volume: 'M4 10v4h4l5 4V6L8 10zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  variable: 'M8 4c-2 0-3 1-3 3v2.5c0 1-.7 2-2 2.5 1.3.5 2 1.5 2 2.5V17c0 2 1 3 3 3M16 4c2 0 3 1 3 3v2.5c0 1 .7 2 2 2.5-1.3.5-2 1.5-2 2.5V17c0 2-1 3-3 3M9.5 9l5 6M14.5 9l-5 6',
  message: 'M4 5h16v11H9l-5 4z',
  clipboard: 'M9 4h6v3H9zM9 5.5H6v15h12v-15h-3M9 12h6M9 15.5h4',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7z',
  play: 'M8 5l11 7-11 7z',
  logic: 'M6 6a2 2 0 1 0 0 .01M18 18a2 2 0 1 0 0 .01M6 8v2a4 4 0 0 0 4 4h4a4 4 0 0 1 4 4M14 6h4v4',
  wrench: 'M14.5 6.5a4 4 0 0 0-5.3 5.3L3 18v3h3l6.2-6.2a4 4 0 0 0 5.3-5.3L15 12l-3-3z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  chevron: 'M6 9l6 6 6-6',
  minus: 'M5 12h14',
  plus: 'M12 5v14M5 12h14',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 0 0 0 10h3',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  copy: 'M9 9h11v11H9zM5 15V4h11',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  puzzle: 'M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z',
  x: 'M6 6l12 12M18 6L6 18'
}

export function FlowIcon({ name, size = 18, stroke = 1.7 }: { name: string; size?: number; stroke?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name] ?? P.puzzle} />
    </svg>
  )
}

export const CATEGORY_ICONS = { trigger: 'zap', action: 'play', logic: 'logic', tool: 'wrench' } as const

const paths: Record<string, string> = {
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z',
  music: 'M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  rain: 'M12 3.5c2.8 3.7 5.5 7 5.5 10.2a5.5 5.5 0 0 1-11 0C6.5 10.5 9.2 7.2 12 3.5zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5',
  status: 'M4 5h7v6H4zM13 5h7v6h-7zM4 13h7v6H4zM13 13h7v6h-7z',
  feed: 'M4 6h16M4 12h10M4 18h13',
  todos: 'M4 6l2 2 3-3M4 13l2 2 3-3M12 7h8M12 14h8M4 19h16',
  agents: 'M12 4v5M12 9l-6 5M12 9l6 5M6 14v3M18 14v3M12 9v8',
  grid: 'M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z',
  exit: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  terminal: 'M4 5h16v14H4zM7 9l3 3-3 3M12 15h5',
  plus: 'M12 5v14M5 12h14',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  play: 'M8 5l11 7-11 7z',
  restart: 'M4 12a8 8 0 1 0 3-6.3M4 4v4h4',
  check: 'M5 12l5 5 9-10',
  github: 'M9 19c-4 1.5-4-2-6-2.5m12 5v-3.5a3 3 0 0 0-.8-2.3c2.7-.3 5.5-1.3 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.3 4.3 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.5 2.7 5.5 3 5.5 3a4.3 4.3 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.4c0 4.6 2.8 5.6 5.5 6a3 3 0 0 0-.8 2.3V22',
  stats: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  pen: 'M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4',
  timer: 'M12 8v5l3 2M9 2h6M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  back: 'M15 6l-6 6 6 6',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  history: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4M12 8v4l3 2',
  discord: 'M8 16c2.5 1.3 5.5 1.3 8 0M8.5 12.5h.01M15.5 12.5h.01M7 7c3-1.3 7-1.3 10 0l2 9c-1.8 1.4-3.6 2-5 2l-1-2M7 7L5 16c1.8 1.4 3.6 2 5 2l1-2',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  inspect: 'M4 5h16v14H4zM4 9h16M8 13h5M8 16h8',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  puzzle: 'M10 4a2 2 0 1 1 4 0v2h4v4h-2a2 2 0 1 0 0 4h2v4h-4v-2a2 2 0 1 0-4 0v2H6v-4h2a2 2 0 1 0 0-4H6V6h4z',
  share: 'M12 15V4M8 8l4-4 4 4M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.7.8 2.8 2.6 3 5.2',
  broadcast: 'M12 13a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM8.5 15a5 5 0 0 1 0-7M15.5 8a5 5 0 0 1 0 7M5.6 18a9 9 0 0 1 0-13M18.4 5a9 9 0 0 1 0 13',
  eyeoff: 'M3 3l18 18M10.6 6.1A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.5 6-.5.9-1.6 2.4-3.1 3.7M6.6 7.6C4.6 8.9 3.2 10.8 2.5 12c1 1.8 4.5 6 9.5 6 1.6 0 3-.4 4.3-1.1M9.9 10a3 3 0 0 0 4.1 4.1',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  send: 'M4 12l16-8-6 16-2.5-6.5z'
}

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={paths[name] ?? ''} />
    </svg>
  )
}

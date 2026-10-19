import { useEffect } from 'react'
import { create } from 'zustand'
import { api, errorText } from '../api'
import { useSettings } from './settingsStore'
import type { SpotifyCommand, SpotifyDevice, SpotifyPlayer, SpotifyPlaylist, SpotifyQueue, SpotifyStatus } from '../../../shared/spotify'

interface SpotifyState {
  status: SpotifyStatus | null
  player: SpotifyPlayer | null
  devices: SpotifyDevice[]
  playlists: SpotifyPlaylist[]
  queue: SpotifyQueue | null
  /** ist der laufende Titel in „Lieblingssongs“? */
  liked: boolean
  error: string
  refreshStatus(): Promise<void>
  connect(clientId: string): Promise<void>
  disconnect(): Promise<void>
  poll(): Promise<void>
  loadLibrary(): Promise<void>
  loadDevices(): Promise<void>
  cmd(c: SpotifyCommand): Promise<void>
  toggleLike(): Promise<void>
}

let errTimer: ReturnType<typeof setTimeout> | undefined
let lastTrack = ''

export const useSpotify = create<SpotifyState>((set, get) => {
  const fail = (e: unknown): void => {
    set({ error: errorText(e) })
    clearTimeout(errTimer)
    errTimer = setTimeout(() => set({ error: '' }), 8000)
    // Anmeldung entzogen? Dann zeigt das Fenster wieder „Verbinden“
    void get().refreshStatus()
  }

  /** Spotify und Lofi-Radio sollen nicht gleichzeitig laufen */
  const silenceLofi = (): void => {
    const st = useSettings.getState()
    if (st.s?.musicOn) st.set({ musicOn: false })
  }

  return {
    status: null,
    player: null,
    devices: [],
    playlists: [],
    queue: null,
    liked: false,
    error: '',

    refreshStatus: async () => {
      const status = await api.spotify.status()
      set(status.connected ? { status } : { status, player: null, playlists: [], devices: [], queue: null })
    },

    connect: async (clientId) => {
      set({ status: { connected: false, connecting: true }, error: '' })
      try {
        const status = await api.spotify.connect(clientId)
        set({ status })
        void get().loadLibrary()
        void get().poll()
      } catch (e) {
        set({ status: { connected: false, connecting: false } })
        set({ error: errorText(e) })
      }
    },

    disconnect: async () => {
      await api.spotify.disconnect()
      lastTrack = ''
      set({
        status: { connected: false, connecting: false },
        player: null,
        playlists: [],
        devices: [],
        queue: null,
        liked: false
      })
    },

    poll: async () => {
      if (!get().status?.connected) return
      try {
        const player = await api.spotify.player()
        set({ player })
        const uri = player?.track?.uri ?? ''
        if (uri !== lastTrack) {
          lastTrack = uri
          const [queue, liked] = await Promise.all([api.spotify.queue().catch(() => null), uri ? api.spotify.isLiked(uri).catch(() => false) : false])
          set({ queue, liked })
        }
      } catch (e) {
        fail(e)
      }
    },

    loadLibrary: async () => {
      try {
        set({ playlists: await api.spotify.playlists() })
      } catch (e) {
        fail(e)
      }
      void get().loadDevices()
    },

    loadDevices: async () => {
      try {
        set({ devices: await api.spotify.devices() })
      } catch {
        // Geräteliste ist Beiwerk
      }
    },

    cmd: async (c) => {
      const p = get().player
      // sofort zeigen, Spotify bestätigt beim nächsten Abfragen
      if (p && (c.type === 'play' || c.type === 'pause'))
        set({
          player: {
            ...p,
            playing: c.type === 'play',
            progressMs: p.progressMs + (p.playing ? Date.now() - p.at : 0),
            at: Date.now()
          }
        })
      if (p && c.type === 'seek') set({ player: { ...p, progressMs: c.ms, at: Date.now() } })
      if (p && c.type === 'shuffle') set({ player: { ...p, shuffle: c.on } })
      if (p && c.type === 'repeat') set({ player: { ...p, repeat: c.mode } })
      if (c.type === 'play' || c.type === 'playContext' || c.type === 'playTracks' || (c.type === 'transfer' && c.play)) silenceLofi()
      try {
        // Ohne aktives Gerät, aber mit einem bekannten: dorthin übergeben statt mit Fehler abzubrechen
        if ((c.type === 'play' || c.type === 'playContext' || c.type === 'playTracks') && !p?.device) {
          const devs = await api.spotify.devices()
          set({ devices: devs })
          const target = devs.find((d) => d.active) ?? devs[0]
          if (target && !target.active)
            await api.spotify.command({
              type: 'transfer',
              deviceId: target.id,
              play: false
            })
        }
        await api.spotify.command(c)
        setTimeout(() => void get().poll(), c.type === 'next' || c.type === 'prev' || c.type === 'playContext' || c.type === 'playTracks' ? 700 : 400)
        if (c.type === 'transfer') setTimeout(() => void get().loadDevices(), 800)
      } catch (e) {
        fail(e)
        void get().poll()
      }
    },

    toggleLike: async () => {
      const uri = get().player?.track?.uri
      if (!uri) return
      const on = !get().liked
      set({ liked: on })
      try {
        await api.spotify.setLiked(uri, on)
      } catch (e) {
        set({ liked: !on })
        fail(e)
      }
    }
  }
})

/** Hält den Player-Stand frisch, solange jemand zuschaut (Fenster offen) */
export function useSpotifyPolling(active: boolean): void {
  const on = useSpotify((s) => active && !!s.status?.connected)
  useEffect(() => {
    if (!on) return
    const st = useSpotify.getState()
    void st.poll()
    void st.loadLibrary()
    const id = setInterval(() => {
      if (!document.hidden) void useSpotify.getState().poll()
    }, 3000)
    return () => clearInterval(id)
  }, [on])
}

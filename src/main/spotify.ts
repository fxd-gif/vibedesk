import { createServer, type Server } from 'http'
import { createHash, randomBytes } from 'crypto'
import { ipcMain, safeStorage, shell } from 'electron'
import { t } from '../shared/i18n'
import { readJson, writeJsonAtomic } from './jsonFile'
import {
  parseCommand,
  SPOTIFY_PORT,
  SPOTIFY_REDIRECT,
  SPOTIFY_SCOPES,
  toDevice,
  toPlayer,
  toPlaylist,
  toPlaylistItem,
  toTrack,
  validClientId,
  type SpotifyCommand,
  type SpotifyDevice,
  type SpotifyPlayer,
  type SpotifyPlaylist,
  type SpotifyQueue,
  type SpotifyStatus,
  type SpotifyTrack
} from '../shared/spotify'

const API = 'https://api.spotify.com/v1'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const LOGIN_TIMEOUT = 5 * 60_000

interface Tokens {
  access: string
  /** Ablaufzeitpunkt (ms) */
  expires: number
  refresh: string
}

/** auf der Platte: der Refresh-Token per Windows-Schlüsselbund verschlüsselt (falls verfügbar) */
interface StoredTokens {
  clientId: string
  refresh: string
  encrypted: boolean
  user?: SpotifyStatus['user']
}

const b64url = (b: Buffer): string => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

class SpotifyError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

export class SpotifyService {
  private tokens: Tokens | null = null
  private clientId = ''
  private user: SpotifyStatus['user']
  private login: { server: Server; cancel: () => void } | null = null

  constructor(
    private file: string,
    private fetchImpl: typeof fetch = fetch
  ) {
    const s = readJson<StoredTokens | null>(file, null)
    if (s?.refresh && s.clientId) {
      try {
        const refresh = s.encrypted ? safeStorage.decryptString(Buffer.from(s.refresh, 'base64')) : s.refresh
        this.tokens = { access: '', expires: 0, refresh }
        this.clientId = s.clientId
        this.user = s.user
      } catch {
        // Schlüssel passt nicht mehr (anderer Windows-Benutzer) – neu verbinden
      }
    }
  }

  status(): SpotifyStatus {
    return {
      connected: !!this.tokens,
      connecting: !!this.login,
      user: this.user
    }
  }

  /** Login im Browser (OAuth mit PKCE – ohne Client-Secret) */
  async connect(clientId: string): Promise<SpotifyStatus> {
    clientId = clientId.trim()
    if (!validClientId(clientId)) throw new Error(t('Die Client-ID besteht aus 32 Zeichen (0–9, a–f).'))
    this.cancel()
    const verifier = b64url(randomBytes(48))
    const challenge = b64url(createHash('sha256').update(verifier).digest())
    const state = b64url(randomBytes(16))

    const code = await new Promise<string>((resolve, reject) => {
      let done = false
      const finish = (err: Error | null, value?: string): void => {
        if (done) return
        done = true
        clearTimeout(timer)
        server.close()
        this.login = null
        if (err) reject(err)
        else resolve(value!)
      }
      const server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', SPOTIFY_REDIRECT)
        if (url.pathname !== '/callback') {
          res.writeHead(404).end()
          return
        }
        const ok = url.searchParams.get('state') === state && url.searchParams.get('code')
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(callbackPage(ok ? t('Spotify ist verbunden. Du kannst dieses Fenster schließen.') : t('Verbinden hat nicht geklappt. Versuch es in VibeDesk noch einmal.')))
        if (ok) finish(null, url.searchParams.get('code')!)
        else finish(new Error(url.searchParams.get('error') === 'access_denied' ? t('Zugriff in Spotify abgelehnt.') : t('Spotify-Anmeldung fehlgeschlagen.')))
      })
      const timer = setTimeout(() => finish(new Error(t('Zeit abgelaufen – die Anmeldung wurde nicht abgeschlossen.'))), LOGIN_TIMEOUT)
      server.on('error', (e: NodeJS.ErrnoException) =>
        finish(new Error(e.code === 'EADDRINUSE' ? t('Port {port} ist belegt – schließ das Programm, das ihn nutzt.', { port: SPOTIFY_PORT }) : e.message))
      )
      server.listen(SPOTIFY_PORT, '127.0.0.1', () => {
        const q = new URLSearchParams({
          client_id: clientId,
          response_type: 'code',
          redirect_uri: SPOTIFY_REDIRECT,
          code_challenge_method: 'S256',
          code_challenge: challenge,
          scope: SPOTIFY_SCOPES.join(' '),
          state
        })
        void shell.openExternal(`https://accounts.spotify.com/authorize?${q}`)
      })
      this.login = {
        server,
        cancel: () => finish(new Error(t('Abgebrochen.')))
      }
    })

    const tok = await this.tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT,
      client_id: clientId,
      code_verifier: verifier
    })
    this.clientId = clientId
    this.tokens = tok
    try {
      const me = await this.call('GET', '/me')
      this.user = {
        name: String(me?.display_name || me?.id || 'Spotify'),
        image: Array.isArray(me?.images) ? (me.images[0]?.url ?? '') : ''
      }
    } catch {
      this.user = { name: 'Spotify', image: '' }
    }
    this.save()
    return this.status()
  }

  cancel(): void {
    this.login?.cancel()
  }

  disconnect(): void {
    this.cancel()
    this.tokens = null
    this.user = undefined
    writeJsonAtomic(this.file, null)
  }

  private save(): void {
    if (!this.tokens) return
    const enc = safeStorage.isEncryptionAvailable()
    const data: StoredTokens = {
      clientId: this.clientId,
      refresh: enc ? safeStorage.encryptString(this.tokens.refresh).toString('base64') : this.tokens.refresh,
      encrypted: enc,
      user: this.user
    }
    writeJsonAtomic(this.file, data)
  }

  private async tokenRequest(body: Record<string, string>): Promise<Tokens> {
    const res = await this.fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString()
    })
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok || typeof j.access_token !== 'string') {
      throw new SpotifyError(j.error === 'invalid_client' ? t('Spotify kennt diese Client-ID nicht.') : String(j.error_description || j.error || res.statusText), res.status)
    }
    return {
      access: j.access_token,
      expires: Date.now() + (Number(j.expires_in) || 3600) * 1000 - 60_000,
      refresh: typeof j.refresh_token === 'string' ? j.refresh_token : (this.tokens?.refresh ?? '')
    }
  }

  private async accessToken(): Promise<string> {
    if (!this.tokens) throw new SpotifyError(t('Spotify ist nicht verbunden.'), 401)
    if (this.tokens.access && Date.now() < this.tokens.expires) return this.tokens.access
    try {
      const prev = this.tokens.refresh
      this.tokens = await this.tokenRequest({
        grant_type: 'refresh_token',
        refresh_token: prev,
        client_id: this.clientId
      })
      if (this.tokens.refresh !== prev) this.save()
    } catch (e) {
      // Zugriff entzogen oder Token abgelaufen – sauber trennen statt endlos zu scheitern
      if (e instanceof SpotifyError && e.status === 400) this.disconnect()
      throw e
    }
    return this.tokens.access
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Rohdaten der Spotify-API
  private async call(method: string, path: string, body?: unknown, retry = true): Promise<any> {
    const res = await this.fetchImpl(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${await this.accessToken()}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {})
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
    if (res.status === 401 && retry && this.tokens) {
      this.tokens.access = ''
      return this.call(method, path, body, false)
    }
    if (res.status === 204) return null
    const text = await res.text()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let j: any = null
    try {
      j = text ? JSON.parse(text) : null
    } catch {
      j = null
    }
    if (!res.ok) throw new SpotifyError(errorMessage(res.status, j?.error?.reason, j?.error?.message), res.status)
    return j
  }

  async player(): Promise<SpotifyPlayer | null> {
    return toPlayer(await this.call('GET', '/me/player?additional_types=track,episode'))
  }

  async devices(): Promise<SpotifyDevice[]> {
    const j = await this.call('GET', '/me/player/devices')
    return (Array.isArray(j?.devices) ? j.devices : []).map(toDevice).filter(Boolean) as SpotifyDevice[]
  }

  async playlists(): Promise<SpotifyPlaylist[]> {
    const j = await this.call('GET', '/me/playlists?limit=50')
    return (Array.isArray(j?.items) ? j.items : []).map(toPlaylist).filter(Boolean) as SpotifyPlaylist[]
  }

  /** Titel einer Playlist – Spotify liefert sie nur für eigene oder gemeinsame Playlists (sonst leer) */
  async playlistTracks(id: string): Promise<SpotifyTrack[]> {
    if (!/^[\w]{1,64}$/.test(id)) return []
    try {
      const j = await this.call('GET', `/playlists/${id}/items?limit=50`)
      return (Array.isArray(j?.items) ? j.items : []).map(toPlaylistItem).filter(Boolean) as SpotifyTrack[]
    } catch (e) {
      if (e instanceof SpotifyError && (e.status === 403 || e.status === 404)) return []
      throw e
    }
  }

  async likedTracks(): Promise<SpotifyTrack[]> {
    const j = await this.call('GET', '/me/tracks?limit=50')
    return (Array.isArray(j?.items) ? j.items : []).map((x: { track?: unknown }) => toTrack(x?.track)).filter(Boolean) as SpotifyTrack[]
  }

  async queue(): Promise<SpotifyQueue> {
    const j = await this.call('GET', '/me/player/queue')
    return {
      current: toTrack(j?.currently_playing),
      next: (Array.isArray(j?.queue) ? j.queue : []).map(toTrack).filter(Boolean).slice(0, 20) as SpotifyTrack[]
    }
  }

  async search(q: string): Promise<{ tracks: SpotifyTrack[]; playlists: SpotifyPlaylist[] }> {
    q = q.trim().slice(0, 200)
    if (!q) return { tracks: [], playlists: [] }
    // Seit 2026 höchstens 10 Treffer pro Typ
    const j = await this.call('GET', `/search?type=track,playlist&limit=10&q=${encodeURIComponent(q)}`)
    return {
      tracks: (j?.tracks?.items ?? []).map(toTrack).filter(Boolean),
      playlists: (j?.playlists?.items ?? []).map(toPlaylist).filter(Boolean)
    }
  }

  async isLiked(uri: string): Promise<boolean> {
    if (!/^spotify:(track|episode):\w+$/.test(uri)) return false
    const j = await this.call('GET', `/me/library/contains?uris=${encodeURIComponent(uri)}`)
    return Array.isArray(j) && !!j[0]
  }

  async setLiked(uri: string, on: boolean): Promise<void> {
    if (!/^spotify:(track|episode):\w+$/.test(uri)) return
    await this.call(on ? 'PUT' : 'DELETE', `/me/library?uris=${encodeURIComponent(uri)}`)
  }

  async command(c: SpotifyCommand): Promise<void> {
    switch (c.type) {
      case 'play':
        return void (await this.call('PUT', '/me/player/play'))
      case 'pause':
        return void (await this.call('PUT', '/me/player/pause'))
      case 'next':
        return void (await this.call('POST', '/me/player/next'))
      case 'prev':
        return void (await this.call('POST', '/me/player/previous'))
      case 'seek':
        return void (await this.call('PUT', `/me/player/seek?position_ms=${c.ms}`))
      case 'volume':
        return void (await this.call('PUT', `/me/player/volume?volume_percent=${c.pct}`))
      case 'shuffle':
        return void (await this.call('PUT', `/me/player/shuffle?state=${c.on}`))
      case 'repeat':
        return void (await this.call('PUT', `/me/player/repeat?state=${c.mode}`))
      case 'playContext':
        return void (await this.call('PUT', '/me/player/play', {
          context_uri: c.uri,
          ...(c.offsetUri ? { offset: { uri: c.offsetUri } } : {})
        }))
      case 'playTracks':
        return void (await this.call('PUT', '/me/player/play', {
          uris: c.uris,
          ...(c.offsetUri ? { offset: { uri: c.offsetUri } } : {})
        }))
      case 'transfer':
        return void (await this.call('PUT', '/me/player', {
          device_ids: [c.deviceId],
          play: c.play
        }))
    }
  }
}

function errorMessage(status: number, reason?: string, msg?: string): string {
  if (reason === 'NO_ACTIVE_DEVICE' || (status === 404 && /device/i.test(msg ?? ''))) return t('Kein aktives Spotify-Gerät. Öffne Spotify auf dem PC oder Handy und wähle es hier unter „Gerät“ aus.')
  if (reason === 'PREMIUM_REQUIRED') return t('Diese Steuerung braucht Spotify Premium.')
  if (status === 403) return t('Spotify erlaubt das nicht. Steuerung braucht Premium, und dein Konto muss in deiner Spotify-App als Nutzer eingetragen sein.')
  if (status === 429) return t('Spotify bremst gerade – kurz warten.')
  if (status === 401) return t('Spotify-Anmeldung abgelaufen – bitte neu verbinden.')
  return msg || t('Spotify-Fehler ({status})', { status })
}

function callbackPage(text: string): string {
  const safe = text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]!)
  return `<!doctype html><meta charset="utf-8"><title>VibeDesk</title><body style="margin:0;height:100vh;display:grid;place-items:center;background:#0b0f17;color:#e8ecf4;font:16px system-ui,sans-serif"><div style="text-align:center"><div style="font-size:40px">🎧</div><p>${safe}</p></div></body>`
}

export function registerSpotifyIpc(spotify: SpotifyService): void {
  const id = (v: unknown): string => (typeof v === 'string' ? v : '')
  ipcMain.handle('spotify:status', () => spotify.status())
  ipcMain.handle('spotify:connect', (_e, clientId) => spotify.connect(id(clientId)))
  ipcMain.on('spotify:cancel', () => spotify.cancel())
  ipcMain.handle('spotify:disconnect', () => spotify.disconnect())
  ipcMain.handle('spotify:player', () => spotify.player())
  ipcMain.handle('spotify:devices', () => spotify.devices())
  ipcMain.handle('spotify:playlists', () => spotify.playlists())
  ipcMain.handle('spotify:playlistTracks', (_e, pid) => spotify.playlistTracks(id(pid)))
  ipcMain.handle('spotify:liked', () => spotify.likedTracks())
  ipcMain.handle('spotify:queue', () => spotify.queue())
  ipcMain.handle('spotify:search', (_e, q) => spotify.search(id(q)))
  ipcMain.handle('spotify:isLiked', (_e, uri) => spotify.isLiked(id(uri)))
  ipcMain.handle('spotify:setLiked', (_e, uri, on) => spotify.setLiked(id(uri), !!on))
  ipcMain.handle('spotify:command', (_e, c) => {
    const cmd = parseCommand(c)
    if (!cmd) throw new Error(t('Unbekannter Spotify-Befehl'))
    return spotify.command(cmd)
  })
  // startet die installierte Spotify-App (sie wird dann als Gerät sichtbar)
  ipcMain.on('spotify:openApp', () => void shell.openExternal('spotify:'))
}

// Lofi-Stream (HTMLAudioElement, Fade über volume – funktioniert auch ohne CORS-Header)
// und synthetisches Regengeräusch (WebAudio: Rauschschichten + zufällige Tropfen).

type Listener = (s: { musicOffline: boolean; musicPlaying: boolean }) => void

const FADE_MS = 1000
const RETRY_MS = 30000

export class AmbienceAudio {
  private audio: HTMLAudioElement | null = null
  private url = ''
  private musicOn = false
  private musicVolume = 0.5
  private fadeRaf = 0
  private retry: ReturnType<typeof setTimeout> | null = null
  private offline = false
  private playing = false
  private listeners: Listener[] = []

  private ctx: AudioContext | null = null
  private rainGain: GainNode | null = null
  private rumble: GainNode | null = null
  private hiss: GainNode | null = null
  private rainOn = false
  private rainVolume = 0.35
  private intensity = 0.6
  private dropTimer: ReturnType<typeof setTimeout> | null = null

  private musicDuck = 1
  private rainDuck = 1

  /** Absenken in Fokus-Pausen (1 = normal) */
  setDuck(music: number, rain: number): void {
    this.musicDuck = music
    this.rainDuck = rain
    if (this.musicOn && this.audio) this.fadeTo(this.musicVolume * music)
    this.setRain(this.rainOn, this.rainVolume, this.intensity)
  }

  onState(cb: Listener): () => void {
    this.listeners.push(cb)
    cb({ musicOffline: this.offline, musicPlaying: this.playing })
    return () => (this.listeners = this.listeners.filter((l) => l !== cb))
  }

  private emit(): void {
    this.listeners.forEach((l) => l({ musicOffline: this.offline, musicPlaying: this.playing }))
  }

  // ---------- Musik ----------
  setMusic(on: boolean, volume: number, url: string): void {
    const urlChanged = url !== this.url
    this.musicOn = on
    this.musicVolume = volume
    this.url = url
    if (on) {
      if (!this.audio || urlChanged) this.connect()
      else if (this.audio.paused) this.play()
      this.fadeTo(volume * this.musicDuck)
    } else if (this.audio) {
      this.fadeTo(0, () => {
        this.audio?.pause()
        this.playing = false
        this.emit()
      })
    }
  }

  private connect(): void {
    if (this.retry) clearTimeout(this.retry)
    this.retry = null
    if (this.audio) {
      this.audio.pause()
      this.audio.src = ''
    }
    const a = new Audio()
    a.preload = 'none'
    a.volume = 0
    a.src = this.url
    a.addEventListener('playing', () => {
      this.offline = false
      this.playing = true
      this.emit()
    })
    const fail = (): void => {
      if (this.audio !== a) return
      this.offline = true
      this.playing = false
      this.emit()
      if (this.musicOn && !this.retry)
        this.retry = setTimeout(() => {
          this.retry = null
          if (this.musicOn) {
            this.connect()
            this.fadeTo(this.musicVolume * this.musicDuck)
          }
        }, RETRY_MS)
    }
    a.addEventListener('error', fail)
    a.addEventListener('stalled', () => setTimeout(() => a.paused || a.readyState < 3 ? fail() : undefined, 8000))
    this.audio = a
    this.play()
  }

  private play(): void {
    this.audio?.play().catch(() => {
      /* Fehler kommt über 'error' */
    })
  }

  private fadeTo(target: number, done?: () => void): void {
    cancelAnimationFrame(this.fadeRaf)
    const a = this.audio
    if (!a) return done?.()
    const from = a.volume
    const start = performance.now()
    const step = (now: number): void => {
      const k = Math.min(1, (now - start) / FADE_MS)
      a.volume = Math.max(0, Math.min(1, from + (target - from) * (k * k * (3 - 2 * k))))
      if (k < 1) this.fadeRaf = requestAnimationFrame(step)
      else done?.()
    }
    this.fadeRaf = requestAnimationFrame(step)
  }

  // ---------- Regen ----------
  setRain(on: boolean, volume: number, intensity: number): void {
    this.rainOn = on
    this.rainVolume = volume
    this.intensity = intensity
    if (on) this.ensureRain()
    if (!this.ctx || !this.rainGain || !this.rumble || !this.hiss) return
    const t = this.ctx.currentTime
    const target = on ? volume * (0.35 + intensity * 0.65) * this.rainDuck : 0
    this.rainGain.gain.cancelScheduledValues(t)
    this.rainGain.gain.setTargetAtTime(target, t, FADE_MS / 3000)
    this.rumble.gain.setTargetAtTime(0.5 + intensity * 0.5, t, 0.3)
    this.hiss.gain.setTargetAtTime(0.08 + intensity * 0.22, t, 0.3)
    if (on) this.scheduleDrops()
  }

  private noiseBuffer(ctx: AudioContext, brown: boolean): AudioBuffer {
    const len = ctx.sampleRate * 4
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch)
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        if (brown) {
          last = (last + 0.02 * w) / 1.02
          d[i] = last * 3.5
        } else d[i] = w
      }
    }
    return buf
  }

  private ensureRain(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const ctx = new AudioContext()
    this.ctx = ctx
    const master = ctx.createGain()
    master.gain.value = 0
    master.connect(ctx.destination)
    this.rainGain = master

    const layer = (brown: boolean, filterType: BiquadFilterType, freq: number): GainNode => {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer(ctx, brown)
      src.loop = true
      const f = ctx.createBiquadFilter()
      f.type = filterType
      f.frequency.value = freq
      const g = ctx.createGain()
      src.connect(f).connect(g).connect(master)
      src.start()
      return g
    }
    this.rumble = layer(true, 'lowpass', 900)
    this.hiss = layer(false, 'bandpass', 5200)
  }

  private scheduleDrops(): void {
    if (this.dropTimer) return
    const tick = (): void => {
      this.dropTimer = null
      if (!this.rainOn || !this.ctx || !this.rainGain) return
      this.drop()
      const rate = 3 + this.intensity * 22 // Tropfen pro Sekunde
      this.dropTimer = setTimeout(tick, (-Math.log(1 - Math.random()) / rate) * 1000)
    }
    tick()
  }

  private drop(): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    const len = Math.floor(ctx.sampleRate * 0.03)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.15))
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    f.frequency.value = 1800 + Math.random() * 4500
    f.Q.value = 4 + Math.random() * 6
    const g = ctx.createGain()
    g.gain.value = 0.15 + Math.random() * 0.35
    const pan = ctx.createStereoPanner()
    pan.pan.value = Math.random() * 1.6 - 0.8
    src.connect(f).connect(g).connect(pan).connect(this.rainGain!)
    src.start(t)
  }
}

export const ambienceAudio = new AmbienceAudio()

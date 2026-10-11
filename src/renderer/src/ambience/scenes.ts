import { sceneParams, type SceneParams } from './sceneParams'

export { SCENES } from './sceneParams'

export interface SceneTextures {
  sharp: HTMLCanvasElement
  blurred: HTMLCanvasElement
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!]
}

function hexA(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

function paint(ctx: CanvasRenderingContext2D, p: SceneParams, w: number, h: number, focus: 'sharp' | 'bokeh'): void {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, p.bg[0])
  g.addColorStop(0.55, p.bg[1])
  g.addColorStop(1, p.bg[2])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  ctx.globalCompositeOperation = 'lighter'
  for (const l of p.lights) {
    const x = l.x * w
    const y = l.y * h
    // Im Fokus (durch den Tropfen) sind Lichter kleine helle Punkte, sonst weiche Bokeh-Scheiben
    const r = focus === 'sharp' ? Math.max(1.5, l.r * w * 0.3) : l.r * w
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
    const a = focus === 'sharp' ? Math.min(1, l.alpha * 1.3) : l.alpha
    rg.addColorStop(0, hexA(l.color.hex, a))
    rg.addColorStop(focus === 'sharp' ? 0.35 : 0.75, hexA(l.color.hex, a * (focus === 'sharp' ? 0.5 : 0.8)))
    rg.addColorStop(1, hexA(l.color.hex, 0))
    ctx.fillStyle = rg
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  const fog = ctx.createLinearGradient(0, 0, 0, h)
  fog.addColorStop(0, hexA(p.fogColor, p.fog * 0.6))
  fog.addColorStop(0.6, hexA(p.fogColor, p.fog * 0.35))
  fog.addColorStop(1, hexA(p.fogColor, p.fog * 0.15))
  ctx.fillStyle = fog
  ctx.fillRect(0, 0, w, h)
}

function blurOf(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = canvas(w, h)
  const px = Math.round(w * 0.018)
  ctx.filter = `blur(${px}px)`
  // etwas größer zeichnen, damit die Ränder nicht ausbluten
  ctx.drawImage(src, -px * 2, -px * 2, w + px * 4, h + px * 4)
  return c
}

export function renderScene(id: string, w: number, h: number, seed = 7): SceneTextures {
  const p = sceneParams(id, seed)
  const [bokeh, bctx] = canvas(w, h)
  paint(bctx, p, w, h, 'bokeh')
  const [sharp, sctx] = canvas(w, h)
  paint(sctx, p, w, h, 'sharp')
  // weicher Schein der Lichter auch in der scharfen Ansicht – sonst wirkt sie zu dunkel
  sctx.globalAlpha = 0.45
  sctx.drawImage(blurOf(bokeh, w, h), 0, 0)
  sctx.globalAlpha = 1
  return { sharp, blurred: blurOf(bokeh, w, h) }
}

export async function renderImageScene(url: string, w: number, h: number): Promise<SceneTextures> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = url
  await img.decode()
  const [sharp, ctx] = canvas(w, h)
  const s = Math.max(w / img.width, h / img.height)
  const dw = img.width * s
  const dh = img.height * s
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
  ctx.fillStyle = 'rgba(5,8,14,0.25)' // abdunkeln, damit es zur Nacht passt
  ctx.fillRect(0, 0, w, h)
  return { sharp, blurred: blurOf(sharp, w, h) }
}

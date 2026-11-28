// WebGL-Ebene des Gehirn-Graphen: Kanten, Leuchten, Knoten und Ringe – die Massenware.
// Canvas 2D schafft bei großen Gehirnen (3.000 Knoten, 12.000 Kanten) nur einstellige Bildraten, weil Skia jede Kante
// und jeden Knoten einzeln rastert. Hier sind es drei Zeichenaufrufe je Bild. Pulse, Funken und Beschriftungen bleiben
// auf dem 2D-Canvas darüber. Alles in Gerätepixeln; ohne WebGL zeichnet BrainGraph wie bisher mit Canvas 2D.

/** RGBA 0..1 aus einer CSS-Farbe (#rgb, #rrggbb, rgb(), rgba()) – gemerkt, denn es sind nur wenige Farben */
const parsed = new Map<string, [number, number, number, number]>()
export function rgba(css: string): [number, number, number, number] {
  let c = parsed.get(css)
  if (c) return c
  const s = css.trim()
  if (s.startsWith('#')) {
    const h = s.length === 4 ? s.slice(1).replace(/./g, (x) => x + x) : s.slice(1, 7)
    c = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255, 1]
  } else {
    const m = /rgba?\(([^)]+)\)/.exec(s)
    const p = m ? m[1].split(',').map((x) => parseFloat(x)) : [255, 255, 255, 1]
    c = [p[0] / 255, p[1] / 255, p[2] / 255, p[3] ?? 1]
  }
  parsed.set(css, c)
  return c
}

/** Art eines Kreises: gefüllte Scheibe, weiches Leuchten, Ring, gestrichelter Ring */
export const DISC = 0
export const GLOW = 1
export const RING = 2
export const DASHED = 3

/** Ein Bild: wird pro Frame neu gefüllt, die Puffer wachsen nur */
export class GlFrame {
  lines: Float32Array<ArrayBuffer> = new Float32Array(6 * 2 * 4096)
  lineN = 0
  tris: Float32Array<ArrayBuffer> = new Float32Array(6 * 6 * 256)
  triN = 0
  circ: Float32Array<ArrayBuffer> = new Float32Array(CIRC_STRIDE * 6 * 2048)
  circN = 0

  reset(): void {
    this.lineN = this.triN = this.circN = 0
  }

  /** Haarlinie (1 Gerätepixel) */
  line(x0: number, y0: number, x1: number, y1: number, c: [number, number, number, number], alpha = 1): void {
    if ((this.lineN + 2) * 6 > this.lines.length) this.lines = grow(this.lines)
    const a = this.lines
    let o = this.lineN * 6
    a[o++] = x0; a[o++] = y0; a[o++] = c[0]; a[o++] = c[1]; a[o++] = c[2]; a[o++] = c[3] * alpha
    a[o++] = x1; a[o++] = y1; a[o++] = c[0]; a[o++] = c[1]; a[o++] = c[2]; a[o++] = c[3] * alpha
    this.lineN += 2
  }

  /** breite Linie als zwei Dreiecke (nur für die wenigen hervorgehobenen Kanten) */
  wide(x0: number, y0: number, x1: number, y1: number, w: number, c: [number, number, number, number]): void {
    const dx = x1 - x0
    const dy = y1 - y0
    const len = Math.hypot(dx, dy) || 1
    const nx = (-dy / len) * (w / 2)
    const ny = (dx / len) * (w / 2)
    if ((this.triN + 6) * 6 > this.tris.length) this.tris = grow(this.tris)
    const a = this.tris
    let o = this.triN * 6
    for (const [x, y] of [[x0 + nx, y0 + ny], [x0 - nx, y0 - ny], [x1 + nx, y1 + ny], [x1 + nx, y1 + ny], [x0 - nx, y0 - ny], [x1 - nx, y1 - ny]]) {
      a[o++] = x; a[o++] = y; a[o++] = c[0]; a[o++] = c[1]; a[o++] = c[2]; a[o++] = c[3]
    }
    this.triN += 6
  }

  /** Kreis: Mitte, Radius und Strichbreite in Gerätepixeln */
  circle(cx: number, cy: number, r: number, kind: number, c: [number, number, number, number], alpha = 1, width = 1.5): void {
    if ((this.circN + 6) * CIRC_STRIDE > this.circ.length) this.circ = grow(this.circ)
    const a = this.circ
    let o = this.circN * CIRC_STRIDE
    const ext = r + width + 1.5
    for (const [ox, oy] of CORNERS) {
      a[o++] = cx; a[o++] = cy; a[o++] = ox * ext; a[o++] = oy * ext
      a[o++] = r; a[o++] = width; a[o++] = kind
      a[o++] = c[0]; a[o++] = c[1]; a[o++] = c[2]; a[o++] = c[3] * alpha
    }
    this.circN += 6
  }
}

const CIRC_STRIDE = 11
const CORNERS = [[-1, -1], [1, -1], [-1, 1], [-1, 1], [1, -1], [1, 1]]

function grow(a: Float32Array<ArrayBuffer>): Float32Array<ArrayBuffer> {
  const b = new Float32Array(a.length * 2)
  b.set(a)
  return b
}

const FLAT_VS = `
attribute vec2 aPos; attribute vec4 aCol; uniform vec2 uSize; varying vec4 vCol;
void main() { vCol = aCol; gl_Position = vec4(aPos / uSize * 2.0 - 1.0, 0.0, 1.0); gl_Position.y = -gl_Position.y; }`
const FLAT_FS = `
precision mediump float; varying vec4 vCol;
void main() { gl_FragColor = vec4(vCol.rgb * vCol.a, vCol.a); }`

const CIRC_VS = `
attribute vec2 aCenter; attribute vec2 aOff; attribute vec3 aShape; attribute vec4 aCol;
uniform vec2 uSize; varying vec2 vOff; varying vec3 vShape; varying vec4 vCol;
void main() {
  vOff = aOff; vShape = aShape; vCol = aCol;
  gl_Position = vec4((aCenter + aOff) / uSize * 2.0 - 1.0, 0.0, 1.0); gl_Position.y = -gl_Position.y;
}`
// vShape = (Radius, Strichbreite, Art); Kanten weich über einen halben Pixel
const CIRC_FS = `
precision mediump float; varying vec2 vOff; varying vec3 vShape; varying vec4 vCol;
void main() {
  float d = length(vOff); float r = vShape.x; float w = vShape.y; float a;
  if (vShape.z < 0.5) a = clamp(r - d + 0.5, 0.0, 1.0);
  else if (vShape.z < 1.5) a = max(0.0, 1.0 - d / r) * 0.9;
  else {
    a = clamp(w * 0.5 - abs(d - r) + 0.5, 0.0, 1.0);
    if (vShape.z > 2.5) {
      float n = max(6.0, floor(6.2832 * r / (4.5 * w + 3.0)));
      a *= step(0.5, fract(atan(vOff.y, vOff.x) / 6.2832 * n));
    }
  }
  a *= vCol.a;
  if (a <= 0.0) discard;
  gl_FragColor = vec4(vCol.rgb * a, a);
}`

export class GraphGl {
  private constructor(
    private gl: WebGLRenderingContext,
    private flat: { p: WebGLProgram; pos: number; col: number; size: WebGLUniformLocation },
    private circ: { p: WebGLProgram; center: number; off: number; shape: number; col: number; size: WebGLUniformLocation },
    private buf: WebGLBuffer
  ) {}

  /** null: kein WebGL (alter Treiber, abgeschaltet) – dann zeichnet Canvas 2D */
  static create(canvas: HTMLCanvasElement): GraphGl | null {
    let gl: WebGLRenderingContext | null = null
    try {
      // ohne MSAA: kostete hier bei 12.000 Kanten zwei Drittel der Bildrate; Kreise glättet der Shader selbst
      gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: false })
    } catch {
      gl = null
    }
    if (!gl) return null
    const prog = (vs: string, fs: string): WebGLProgram | null => {
      const p = gl!.createProgram()
      for (const [type, src] of [[gl!.VERTEX_SHADER, vs], [gl!.FRAGMENT_SHADER, fs]] as const) {
        const sh = gl!.createShader(type)
        if (!sh || !p) return null
        gl!.shaderSource(sh, src)
        gl!.compileShader(sh)
        if (!gl!.getShaderParameter(sh, gl!.COMPILE_STATUS)) return null
        gl!.attachShader(p, sh)
      }
      if (!p) return null
      gl!.linkProgram(p)
      return gl!.getProgramParameter(p, gl!.LINK_STATUS) ? p : null
    }
    const fp = prog(FLAT_VS, FLAT_FS)
    const cp = prog(CIRC_VS, CIRC_FS)
    const buf = gl.createBuffer()
    if (!fp || !cp || !buf) return null
    return new GraphGl(
      gl,
      { p: fp, pos: gl.getAttribLocation(fp, 'aPos'), col: gl.getAttribLocation(fp, 'aCol'), size: gl.getUniformLocation(fp, 'uSize')! },
      { p: cp, center: gl.getAttribLocation(cp, 'aCenter'), off: gl.getAttribLocation(cp, 'aOff'), shape: gl.getAttribLocation(cp, 'aShape'), col: gl.getAttribLocation(cp, 'aCol'), size: gl.getUniformLocation(cp, 'uSize')! },
      buf
    )
  }

  get lost(): boolean {
    return this.gl.isContextLost()
  }

  /** Reihenfolge: Haarlinien, breite Kanten, dann Kreise (Leuchten, Knoten, Ringe in der Reihenfolge des Einfügens) */
  draw(f: GlFrame, w: number, h: number): void {
    const gl = this.gl
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf)

    const fl = this.flat
    gl.useProgram(fl.p)
    gl.uniform2f(fl.size, w, h)
    gl.enableVertexAttribArray(fl.pos)
    gl.enableVertexAttribArray(fl.col)
    const flatDraw = (data: Float32Array, n: number, mode: number): void => {
      if (!n) return
      gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, n * 6), gl.STREAM_DRAW)
      gl.vertexAttribPointer(fl.pos, 2, gl.FLOAT, false, 24, 0)
      gl.vertexAttribPointer(fl.col, 4, gl.FLOAT, false, 24, 8)
      gl.drawArrays(mode, 0, n)
    }
    flatDraw(f.lines, f.lineN, gl.LINES)
    flatDraw(f.tris, f.triN, gl.TRIANGLES)
    gl.disableVertexAttribArray(fl.pos)
    gl.disableVertexAttribArray(fl.col)

    if (f.circN) {
      const c = this.circ
      gl.useProgram(c.p)
      gl.uniform2f(c.size, w, h)
      gl.bufferData(gl.ARRAY_BUFFER, f.circ.subarray(0, f.circN * CIRC_STRIDE), gl.STREAM_DRAW)
      const S = CIRC_STRIDE * 4
      for (const [loc, n, off] of [[c.center, 2, 0], [c.off, 2, 8], [c.shape, 3, 16], [c.col, 4, 28]] as const) {
        gl.enableVertexAttribArray(loc)
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, S, off)
      }
      gl.drawArrays(gl.TRIANGLES, 0, f.circN)
      for (const loc of [c.center, c.off, c.shape, c.col]) gl.disableVertexAttribArray(loc)
    }
  }

  clear(): void {
    this.gl.clearColor(0, 0, 0, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT)
  }

  dispose(): void {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

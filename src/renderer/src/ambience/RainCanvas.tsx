import { useEffect, useRef, useState } from 'react'
import { FRAG, VERT } from './rainShader'
import { renderImageScene, renderScene, type SceneTextures } from './scenes'

interface Props {
  scene: string
  customImage?: string
  intensity: number
  blur: number
  paused?: boolean
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader-Fehler')
  return s
}

function texture(gl: WebGL2RenderingContext, unit: number, src: HTMLCanvasElement, tex?: WebGLTexture | null): WebGLTexture {
  const t = tex ?? gl.createTexture()!
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, t)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return t
}

/** Vollflächiger Regen-auf-Glas-Hintergrund. Fällt ohne WebGL auf das unscharfe Szenenbild zurück. */
export function RainCanvas({ scene, customImage, intensity, blur, paused }: Props): React.JSX.Element {
  const ref = useRef<HTMLCanvasElement>(null)
  const fallbackRef = useRef<HTMLCanvasElement>(null)
  const [fallback, setFallback] = useState(false)
  const params = useRef({ intensity, blur, paused })
  params.current = { intensity, blur, paused }
  const glState = useRef<{ gl: WebGL2RenderingContext; sharp: WebGLTexture | null; blurred: WebGLTexture | null } | null>(null)

  // Szene (neu) rendern und als Texturen hochladen
  useEffect(() => {
    let alive = true
    const w = Math.round(window.innerWidth)
    const h = Math.round(window.innerHeight)
    const load: Promise<SceneTextures> = customImage
      ? renderImageScene(customImage, w, h).catch(() => renderScene('city', w, h))
      : Promise.resolve(renderScene(scene, w, h))
    load.then((tx) => {
      if (!alive) return
      const st = glState.current
      if (st) {
        st.sharp = texture(st.gl, 0, tx.sharp, st.sharp)
        st.blurred = texture(st.gl, 1, tx.blurred, st.blurred)
      }
      const fb = fallbackRef.current
      if (fb) {
        fb.width = w
        fb.height = h
        fb.getContext('2d')!.drawImage(tx.blurred, 0, 0)
      }
    })
    return () => {
      alive = false
    }
  }, [scene, customImage, fallback])

  // WebGL-Setup + Renderloop
  useEffect(() => {
    const canvas = ref.current!
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'low-power' })
    if (!gl) {
      setFallback(true)
      return
    }
    let prog: WebGLProgram
    try {
      prog = gl.createProgram()!
      gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT))
      gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG))
      gl.linkProgram(prog)
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Link-Fehler')
    } catch (err) {
      console.error('[rain] shader', err)
      setFallback(true)
      return
    }
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'aPos')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const u = (n: string) => gl.getUniformLocation(prog, n)
    const uRes = u('uRes'), uTime = u('uTime'), uRain = u('uRain'), uBlur = u('uBlurAmt')
    gl.uniform1i(u('uSharp'), 0)
    gl.uniform1i(u('uBlur'), 1)
    glState.current = { gl, sharp: null, blurred: null }
    // Szene ggf. nachladen, falls sie schon fertig war
    const w0 = window.innerWidth, h0 = window.innerHeight
    const tx = renderScene(scene, w0, h0)
    glState.current.sharp = texture(gl, 0, tx.sharp)
    glState.current.blurred = texture(gl, 1, tx.blurred)

    const resize = (): void => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.round(window.innerWidth * dpr)
      canvas.height = Math.round(window.innerHeight * dpr)
      gl.viewport(0, 0, canvas.width, canvas.height)
    }
    resize()
    window.addEventListener('resize', resize)

    let raf = 0
    let last = 0
    let t = 0
    let prev = performance.now()
    const frame = (now: number): void => {
      raf = requestAnimationFrame(frame)
      const p = params.current
      const idle = p.paused || document.hidden || !document.hasFocus()
      // Im Hintergrund auf ~5 FPS drosseln
      if (idle && now - last < 200) return
      last = now
      const dt = Math.min(0.1, (now - prev) / 1000)
      prev = now
      if (!p.paused) t += dt
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, t)
      gl.uniform1f(uRain, p.intensity)
      gl.uniform1f(uBlur, p.blur)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    raf = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      glState.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <canvas ref={ref} className="rain-canvas" style={{ display: fallback ? 'none' : 'block' }} />
      {fallback && <canvas ref={fallbackRef} className="rain-canvas" />}
    </>
  )
}

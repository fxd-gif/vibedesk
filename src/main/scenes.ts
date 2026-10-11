import { ipcMain } from 'electron'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

export const SCENE_SCHEME = 'vibedesk-scene'
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp'])

/** Kopiert ein eigenes Szenenbild in den App-Ordner und liefert dessen URL. */
export function copyScene(scenesDir: string, src: string): string {
  const ext = path.extname(src).toLowerCase()
  if (!IMAGE_EXT.has(ext)) throw new Error('Nur Bilder (jpg, png, webp, gif, avif) sind möglich')
  fs.mkdirSync(scenesDir, { recursive: true })
  const name = randomUUID() + ext
  fs.copyFileSync(src, path.join(scenesDir, name))
  return `${SCENE_SCHEME}://img/${name}`
}

/** Löst eine Scheme-URL sicher auf eine Datei im Szenenordner auf. */
export function sceneFile(scenesDir: string, url: string): string | null {
  let name: string
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\/+/, ''))
  } catch {
    return null
  }
  if (!name || name !== path.basename(name) || name.includes('..')) return null
  return path.join(scenesDir, name)
}

export function registerSceneIpc(scenesDir: string): void {
  ipcMain.handle('scenes:addCustom', (_e, src: string) => copyScene(scenesDir, src))
}

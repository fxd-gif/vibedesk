// Rückblick-Karte als Bild: Ausschnitt des Hauptfensters → Zwischenablage und Bilder\VibeDesk.
import { clipboard, ClipboardItem, type BrowserWindow } from 'electron'
import fs from 'fs'
import { join } from 'path'

export async function captureCard(win: BrowserWindow | null, r: unknown, picturesDir: string): Promise<string | null> {
  if (!win || win.isDestroyed() || !r || typeof r !== 'object') return null
  const { x, y, width, height } = r as Record<string, unknown>
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0)) return null
  const rect = { x: Math.round(x as number), y: Math.round(y as number), width: Math.round(width as number), height: Math.round(height as number) }
  if (rect.width < 10 || rect.height < 10 || rect.width > 4000 || rect.height > 4000) return null
  const img = await win.webContents.capturePage(rect)
  if (img.isEmpty()) return null
  const png = img.toPNG()
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]).catch(() => undefined)
  const dir = join(picturesDir, 'VibeDesk')
  fs.mkdirSync(dir, { recursive: true })
  const d = new Date()
  const file = join(dir, `vibe-wrapped-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.png`)
  fs.writeFileSync(file, png)
  return file
}

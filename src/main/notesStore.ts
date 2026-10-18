import { t } from '../shared/i18n'
import fs from 'fs'
import path from 'path'

/** Notizen pro Projekt als Markdown-Datei in userData/notes. */
export class NotesStore {
  constructor(private dir: string) {}

  private file(projectId: string): string {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(projectId)) throw new Error(t('Ungültige Projekt-ID'))
    return path.join(this.dir, projectId + '.md')
  }

  get(projectId: string): string {
    try {
      return fs.readFileSync(this.file(projectId), 'utf8')
    } catch {
      return ''
    }
  }

  set(projectId: string, text: string): void {
    const f = this.file(projectId)
    fs.mkdirSync(this.dir, { recursive: true })
    fs.writeFileSync(f, text, 'utf8')
  }
}

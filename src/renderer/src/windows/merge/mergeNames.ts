import type { MergeSession } from '../../../../shared/merge'
import { t } from '../../../../shared/i18n'

/** Anzeigename einer Session: Hauptordner, sonst Branch ohne „vd/“ */
export function sessionName(s: MergeSession): string {
  if (s.main) return t('Hauptordner')
  if (s.branch) return s.branch.replace(/^vd\//, '')
  return s.path.split(/[\\/]/).pop() ?? s.head.slice(0, 7)
}

// Eigenes Fenster für eine Shell (PowerShell/cmd) im Projektordner.
import { useState } from 'react'
import { GlassWindow } from '../desktop/GlassWindow'
import { Icon } from '../desktop/icons'
import { shellWin } from '../store/sessionStore'
import { useShells } from '../store/shellStore'
import { useUi } from '../store/uiStore'
import type { ShellInfo } from '../../../shared/types'
import { TermPane } from '../terminal/TermPane'
import { TermSettings } from '../terminal/TermSettings'
import { t } from '../../../shared/i18n'

const kindLabel = (k: ShellInfo['kind']): string => (k === 'cmd' ? t('Eingabeaufforderung') : k === 'pwsh' ? 'PowerShell 7' : 'PowerShell')

export function ShellWindow({ shell }: { shell: ShellInfo }): React.JSX.Element {
  const id = shellWin(shell.id)
  const isTop = useUi((s) => s.open[s.open.length - 1] === id)
  const exitCode = useShells((s) => s.exited[shell.id])
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <GlassWindow
      id={id}
      solid
      minW={360}
      minH={200}
      onClose={() => void useShells.getState().close(shell.id)}
      title={
        <>
          <Icon name="terminal" size={14} />
          <span>{shell.name}</span>
          <span className="dim" style={{ fontWeight: 400 }}>
            · {kindLabel(shell.kind)}
          </span>
          <span className="term-tools" onPointerDown={(e) => e.stopPropagation()}>
            <button className={`term-tool${settingsOpen ? ' on' : ''}`} title={t('Terminal-Einstellungen')} onClick={() => setSettingsOpen((v) => !v)}>
              <Icon name="gear" size={13} />
            </button>
          </span>
        </>
      }
    >
      <div className="term-panes" style={{ bottom: 6 }}>
        <div className="term-slot">
          <TermPane id={shell.id} testId={`shellwin-${shell.name}`} focused={isTop} />
        </div>
      </div>
      {settingsOpen && <TermSettings onClose={() => setSettingsOpen(false)} />}
      {exitCode !== undefined && (
        <div className="term-overlay">
          <span className="dim">{exitCode !== 0 ? t('Shell beendet (Code {code})', { code: exitCode }) : t('Shell beendet')}</span>
          <button className="btn primary" onClick={() => void useShells.getState().restart(shell.id)}>
            <Icon name="restart" size={15} /> {t('Neu starten')}
          </button>
        </div>
      )}
    </GlassWindow>
  )
}

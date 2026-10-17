// Muss als allererstes geladen werden (erste Zeile in main.tsx): Sprache steht fest, bevor andere Module Texte bauen.
// Die Einstellung liegt in settings.json; damit sie schon vor dem Laden der Settings bekannt ist, merkt sich
// der Renderer die aufgelöste Sprache zusätzlich in localStorage.
import '../../shared/i18n/en'
import { resolveLang, setLang, type Lang, type LangSetting } from '../../shared/i18n'

const KEY = 'vd-lang'

function stored(): Lang | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'de' || v === 'en' ? v : null
  } catch {
    return null
  }
}

export const startLang: Lang = stored() ?? resolveLang('auto', navigator.language)
setLang(startLang)
document.documentElement.lang = startLang

/** Nach dem Laden der Settings bzw. beim Umstellen: weicht die Sprache ab, Fenster einmal neu laden */
export function applyLangSetting(setting: LangSetting | undefined): void {
  const want = resolveLang(setting, navigator.language)
  try {
    localStorage.setItem(KEY, want)
  } catch {
    /* ohne Speicher gilt beim nächsten Start wieder die Systemsprache */
  }
  if (want !== startLang) location.reload()
}

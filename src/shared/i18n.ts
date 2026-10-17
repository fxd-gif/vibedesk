// Sprache der Oberfläche. Der deutsche Text ist selbst der Schlüssel: t('Neu starten') liefert auf Englisch
// den Eintrag aus dem Wörterbuch (src/shared/i18n/en/*.ts), sonst bleibt es beim deutschen Text.
// Platzhalter: t('Session „{name}“ beenden?', { name }) – im Wörterbuch dieselben {name} verwenden.
//
// Wichtig: t() nie auf Modulebene aufrufen (Konstanten beim Import) – dort steht die Sprache noch nicht fest.
// Stattdessen an der Stelle übersetzen, an der der Text angezeigt wird.

export type Lang = 'de' | 'en'
export type LangSetting = 'auto' | Lang

const en: Record<string, string> = {}
let lang: Lang = 'de'

export function registerEn(dict: Record<string, string>): void {
  Object.assign(en, dict)
}

export function setLang(l: Lang): void {
  lang = l
}

export function getLang(): Lang {
  return lang
}

/** 'auto' folgt der Systemsprache: Deutsch für de-*, sonst Englisch */
export function resolveLang(setting: LangSetting | undefined, locale: string): Lang {
  if (setting === 'de' || setting === 'en') return setting
  return /^de\b/i.test(locale) ? 'de' : 'en'
}

const fill = (s: string, vars?: Record<string, string | number>): string =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s

export function t(de: string, vars?: Record<string, string | number>): string {
  return fill(lang === 'en' ? (en[de] ?? de) : de, vars)
}

/** Einzahl/Mehrzahl: tn(n, '{n} Datei', '{n} Dateien') */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : many, { n, ...vars })
}

/** Zahlen und Daten im Format der gewählten Sprache */
export const locale = (): string => (lang === 'en' ? 'en-US' : 'de-DE')

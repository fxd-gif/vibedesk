// Projekt-Vorlagen: Gerüst-Ideen für neue Projekte samt erstem Prompt an Claude.
import { t } from './i18n'

export interface ProjectTemplate {
  id: string
  icon: string
  name: string
  /** ein Satz, was dabei herauskommt */
  hint: string
  /** was Claude anlegen soll – der vorlagenspezifische Teil des Prompts */
  task: string
}

/** „Leer“ – wie bisher: nur Ordner und Session, kein Prompt */
export const BLANK_TEMPLATE = 'blank'

/** so viel vom „Worum geht's?“-Feld kommt in den Prompt */
export const ABOUT_MAX = 200

/** Alle Vorlagen – Texte erst beim Aufruf übersetzen (Sprache kann wechseln) */
export function projectTemplates(): ProjectTemplate[] {
  return [
    {
      id: 'website',
      icon: '🌐',
      name: t('Website'),
      hint: t('HTML, CSS und JavaScript – ohne Build, öffnet direkt im Browser.'),
      task: t('Lege eine einfache Website mit index.html, style.css und script.js an – ohne Build-Werkzeuge und ohne Frameworks, so dass sie sich direkt im Browser öffnen lässt. Mit einer ansprechenden Startseite als Beispiel.')
    },
    {
      id: 'react',
      icon: '⚛️',
      name: t('React-App'),
      hint: t('Vite und TypeScript – modern, schnell, mit Live-Vorschau.'),
      task: t('Lege eine React-App mit Vite und TypeScript an (zum Beispiel mit `npm create vite@latest . -- --template react-ts`, ohne Rückfragen) und installiere die Pakete. Räum das Beispiel auf, so dass eine kleine, saubere Startseite übrig bleibt.')
    },
    {
      id: 'game',
      icon: '🎮',
      name: t('Kleines Spiel'),
      hint: t('Ein Browser-Spiel mit Canvas – sofort spielbar.'),
      task: t('Lege ein kleines Spiel für den Browser an: index.html mit einem Canvas, dazu JavaScript ohne Build-Werkzeuge und ohne Frameworks. Baue eine erste spielbare Version mit Steuerung per Tastatur, Punktestand und Neustart.')
    },
    {
      id: 'python',
      icon: '🐍',
      name: t('Python-Werkzeug'),
      hint: t('Ein Skript für die Kommandozeile, das dir Arbeit abnimmt.'),
      task: t('Lege ein kleines Python-Werkzeug für die Kommandozeile an: ein Hauptskript mit argparse, eine requirements.txt (nur wenn Pakete nötig sind) und eine README.md. Nutze möglichst nur die Standardbibliothek.')
    },
    {
      id: 'discord',
      icon: '🤖',
      name: t('Discord-Bot'),
      hint: t('Node.js mit discord.js – mit einem ersten Befehl.'),
      task: t('Lege einen Discord-Bot mit Node.js und discord.js an und installiere die Pakete. Der Bot soll einen ersten Slash-Befehl /ping haben. Das Token kommt aus einer .env-Datei (lege eine .env.example an, die echte .env gehört in die .gitignore). Erkläre mir auch, wo ich im Discord-Entwicklerportal das Token bekomme und den Bot einlade.')
    },
    {
      id: 'chrome',
      icon: '🧩',
      name: t('Chrome-Erweiterung'),
      hint: t('Manifest V3 mit Popup – lädt ohne Build in Chrome.'),
      task: t('Lege eine Chrome-Erweiterung mit Manifest V3 an: manifest.json, ein kleines Popup (HTML, CSS, JavaScript) und Platzhalter-Icons. Ohne Build-Werkzeuge. Erkläre mir, wie ich sie unter chrome://extensions als entpackte Erweiterung lade.')
    },
    {
      id: 'landing',
      icon: '✨',
      name: t('Landingpage'),
      hint: t('Eine schicke Seite mit Tailwind CSS.'),
      task: t('Lege eine Landingpage mit Tailwind CSS an: eine index.html mit Kopfbereich, Vorteilen, Aufruf zum Handeln und Fußzeile. Halte es einfach (Tailwind über die offizielle CDN-Einbindung reicht), modern und auch auf dem Handy gut lesbar.')
    },
    {
      id: 'notes',
      icon: '📝',
      name: t('Notizen & Texte'),
      hint: t('Kein Code – ein ordentlicher Platz für Texte und Ideen.'),
      task: t('Hier entsteht kein Code, sondern eine Sammlung von Notizen und Dokumenten in Markdown. Lege eine sinnvolle Ordnerstruktur an, eine README.md als Startseite mit Inhaltsverzeichnis und eine erste Notiz als Beispiel.')
    }
  ]
}

export function templateById(id: string | undefined): ProjectTemplate | undefined {
  return id && id !== BLANK_TEMPLATE ? projectTemplates().find((x) => x.id === id) : undefined
}

/** „Worum geht's?“ als eine ruhige Zeile – ohne Umbrüche, gekürzt */
export function cleanAbout(about: string | undefined): string {
  const one = (about ?? '').replace(/\s+/g, ' ').trim()
  return one.length > ABOUT_MAX ? one.slice(0, ABOUT_MAX - 1).trimEnd() + '…' : one
}

/** Der erste Prompt für ein frisch angelegtes Projekt */
export function templatePrompt(tpl: ProjectTemplate, opts: { name: string; about?: string }): string {
  const about = cleanAbout(opts.about)
  return [
    t('Wir starten das neue Projekt „{name}“, der Ordner ist noch leer.', { name: opts.name }),
    tpl.task,
    about && t('Worum es geht: {about}', { about }),
    t('Halte das Gerüst klein und einsteigerfreundlich – nur das Nötigste, damit ich gleich etwas sehe.'),
    t('Lege eine passende .gitignore an.'),
    t('Erkläre mir danach in zwei, drei Sätzen, wie ich es starte bzw. benutze.'),
    t('Schreibe zum Schluss mit brain_write eine kurze Gehirn-Notiz „Projekt-Überblick“ (type module): Ziel, Aufbau, wichtigste Dateien und wie man es startet.')
  ]
    .filter(Boolean)
    .join(' ')
}

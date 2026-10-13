# Changelog

Neue Einträge kommen unter „Unveröffentlicht“. `npm run release` macht daraus automatisch die neue Versionsnummer –
und VibeDesk zeigt sie nach dem Update einmalig unter „Was ist neu“.

Abschnitte: `### Neu`, `### Verbessert`, `### Entfernt`

## Unveröffentlicht

### Neu
- **8 Addon-Vorlagen** zum Loslegen und Umbauen: Adaptive Atmosphäre, Pomodoro mit Statistik, Tageszeit-Regisseur, Deep-Work-Schalter, Kosten-Wächter, Prompt-Werkzeugkasten, Regen-Welle und Tagesbericht
- Neue Bausteine: **Je nach Wert** (ein Ausgang pro Fall), **Überblenden** (Regen und Lautstärke sanft über Sekunden), **Frage** mit zwei Knöpfen, **Dauerhaft merken** (überlebt Neustarts)
- Bedingungen mit beliebig vielen Vergleichen, verknüpft mit **Und/Oder**
- Neue Werte: Tokens und Kosten heute, offene Sessions, Session-Dauer, Wochentag, Datum, Unix-Zeit und das Projekt, das ein Ereignis ausgelöst hat
- **Tab „Erweitert“**: Signale senden und empfangen (auch wartend wie ein Unterprogramm), Gleichzeitig, Warten bis, Drossel und Listen
- Im `fx`-Menü: verschachtelbare **Berechnungen** (Rechnen, Modulo, Runden, Wurzel, Sinus, Text-Funktionen), Listen-Werte und gemerkte Werte

## 0.5.0

### Neu
- **Addons**: Bau dir eigene Erweiterungen im Flowchart-Editor – Bausteine ziehen, verbinden, fertig. Ganz ohne Code. Zum Beispiel: „Wenn eine Session auf mich wartet → wechsle nach Tokio und spiel einen Gong“
- Auslöser (Session wartet/fertig, Fokus-Timer, Uhrzeit, Tastenkürzel, Intervall), Aktionen (Szene, Regen, Lautstärke, Töne, Fokus-Timer), Logik (Wenn/Sonst, Schleifen, Warten, Variablen) und Werkzeuge (Hinweis, Zwischenablage)
- Werte direkt einstellen oder per `fx` aus Variablen, App-Werten (z. B. Uhrzeit) oder Prompt-Vorlagen holen; `{Variable}` in Texten wird ersetzt
- Eigene Szenenbilder, Töne und Prompt-Vorlagen direkt im Addon
- Addons als **.vibeaddon**-Datei exportieren und teilen – Doppelklick, Drag & Drop oder „Importieren…“ installiert sie
- Vor dem Installieren siehst du im Klartext, was ein Addon tut. Addons können keine Dateien lesen, keine Befehle ausführen und nicht ins Internet

### Verbessert
- „Fenster anordnen“ legt Panels ohne Terminals als Raster an statt als schmale, hohe Streifen; solche alten Fenstergrößen werden beim Start verworfen

## 0.4.0

### Neu
- **Code-Editor** für schnelle Anpassungen: Dateibaum, Tabs, Syntax-Highlighting, Speichern mit Strg+S
- Klick auf eine Datei im Live-Feed öffnet sie im Editor – direkt an der Stelle, die Claude geändert hat
- Ändert Claude eine offene Datei, lädt der Editor sie neu – oder fragt nach, wenn du selbst gerade daran arbeitest
- **Befehls-Palette** (Strg+K bzw. Strg+Umschalt+P): alle Fenster, Projekte und Aktionen per Suche
- **Session-Inspector**: Status, Live-Feed, Todos, Agents und Stats in einem Fenster mit Tabs
- „Was ist neu“ nach jedem Update
- Erster Start prüft Node.js und Claude Code und bietet die Installation an

### Verbessert
- Aufgeräumtes Dock: 7 statt 16 Symbole – der Rest ist über die Befehls-Palette erreichbar
- Laufendes Lofi-Radio erkennst du am kleinen Equalizer auf dem Atmosphäre-Symbol

### Entfernt
- Einzelne Dock-Symbole für Status, Feed, Todos, Agents und Stats (jetzt im Session-Inspector)
- Dock-Symbole für Skills, Prompts, Discord, Anordnen und Vollbild verlassen (jetzt in der Befehls-Palette; Vollbild weiter mit F11 oder Esc halten)
- Eigener Musik-Schalter im Dock (jetzt im Atmosphäre-Menü)

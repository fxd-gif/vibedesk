# Changelog

Neue Einträge kommen unter „Unveröffentlicht“. `npm run release` macht daraus automatisch die neue Versionsnummer –
und VibeDesk zeigt sie nach dem Update einmalig unter „Was ist neu“.

Abschnitte: `### Neu`, `### Verbessert`, `### Entfernt`

## Unveröffentlicht

## 0.12.1

### Verbessert
- **Flüssigeres Terminal**: Claudes Ausgabe wird jetzt per Grafikkarte (WebGL) gezeichnet – auch bei viel Text auf einmal ruckelt nichts mehr. Fällt WebGL aus, springt automatisch der bisherige Renderer ein
- Die Ausgabe kommt gebündelt statt in vielen kleinen Häppchen im Fenster an, und beim Ziehen oder Vergrößern passt sich das Terminal ruhiger an

## 0.12.0

### Neu
- **Makros, die Claude automatisieren**: Im Addon-Maker gibt es die neue Kategorie „Claude“ – Session öffnen, Prompt an Claude schicken (auf Wunsch erst weiter, wenn Claude fertig ist) und Warten bis Claude fertig. So laufen ganze Abläufe wie „Tests schreiben → reparieren → committen“ auf Knopfdruck
- Neuer Auslöser **Makro-Befehl**: erscheint in der Befehls-Palette (Strg+K) als „Makro: Name“. Auch „Session fertig“ kann jetzt genau der Session antworten, die fertig wurde
- Neuer Wert **Claude-Status** (arbeitet, wartet, fertig) für Bedingungen
- Zwei neue Vorlagen: **Makro: Tests & Commit** und **Makro: Morgen-Start**
- Sicherheit: höchstens ein Prompt alle 3 Sekunden und 40 pro Stunde je Addon; Addons, die Claude steuern, zeigen beim Installieren eine deutliche Warnung

## 0.11.0

### Neu
- **Git & GitHub** als eigenes Fenster: geänderte Dateien mit Diff ansehen, einzeln oder alle vormerken, verwerfen, committen – und den Verlauf mit allen Änderungen eines Commits durchblättern
- **KI-Commit-Nachricht**: Claude schreibt die Nachricht aus deinen Änderungen, im Stil der bisherigen Commits deines Repos – über dein Claude-Abo, ohne API-Key
- Push, Pull und Aktualisieren mit Anzeige, wie viele Commits voraus oder hinterher sind; neue Projekte mit einem Klick auf GitHub veröffentlichen (privat oder öffentlich)
- VibeDesk erkennt, ob Git installiert und ob du bei GitHub angemeldet bist: Git und die GitHub-CLI lassen sich per Klick installieren, die Anmeldung läuft über einen Code im Browser – scheitert ein Push an der Anmeldung, bietet VibeDesk sie direkt an

## 0.10.2

### Behoben
- Wenn Claude Code Hooks über PowerShell ausführt (z. B. ohne Git Bash), kam bei jedem Prompt „UserPromptSubmit hook error … In Zeile:1 Zeichen:8“ – Status, Live-Feed und Gehirn blieben dann leer. Der Hook-Befehl funktioniert jetzt in PowerShell, cmd und bash

## 0.10.1

### Verbessert
- **Unsichtbares Raster** beim Anordnen: Fenster rasten beim Ziehen und Größe-Ändern an anderen Fenstern (bündig oder mit sauberem Abstand), am Bildschirmrand und an Hälften, Dritteln und Vierteln ein – dezente Hilfslinien zeigen, woran. Mit gedrückter Alt-Taste frei platzieren

## 0.10.0

### Neu
- **Das VibeDesk-Gehirn**: Claude bekommt ein Projektgedächtnis. Bereiche, Entscheidungen, Stolperfallen und Konventionen landen als verlinkte Notizen in `.vibedesk/brain` – Markdown mit `[[Links]]`, direkt in Obsidian zu öffnen und mit Git zu versionieren
- Jede neue Session startet mit einem Überblick über dieses Wissen und kann es über eigene Werkzeuge durchsuchen, lesen und erweitern – ohne Rückfragen und ganz lokal
- **Gehirn-Fenster** als lebendiger Graph: zoomen, ziehen, suchen, nach Typ filtern. Knoten leuchten auf, während Claude Dateien liest, ändert oder etwas Neues lernt
- Notizen direkt im Fenster lesen, schreiben und verlinken; zu jeder Datei siehst du das Wissen dazu und welche Dateien oft mit ihr zusammen geändert werden
- „Gehirn aufbauen lassen“ und „Gehirn pflegen“ schicken Claude den passenden Auftrag. Notizen, deren Dateien sich seitdem geändert haben, sind als „zu prüfen“ markiert
- Hat eine Session viel geändert, ohne etwas festzuhalten, schlägt VibeDesk vor, das Gehirn zu pflegen

## 0.9.0

### Neu
- **Mitteilungen**: Wartet eine Session, ist sie fertig oder abgestürzt, erscheint unten rechts eine Karte mit „Öffnen“ bzw. „Neu starten“ – und wenn VibeDesk im Hintergrund ist, auch eine Windows-Benachrichtigung
- **Glocke im Dock** mit Verlauf aller Mitteilungen und Einstellungen: Karten, Windows-Benachrichtigungen, Ton und welche Arten du sehen willst
- **Ruhe in Fokus-Runden**: nur Wichtiges kommt sofort durch, der Rest wartet bis zur Pause
- **Startkarte** „Woran baust du heute?“ mit deinen zuletzt genutzten Projekten – ein Klick und Claude startet

### Verbessert
- Ruhigeres Dock: Inspector, Editor und Vorschau erscheinen erst, wenn eine Session läuft; Addons und Lounge, sobald du sie nutzt
- Neues **Mehr-Menü** (⋯) mit allen Fenstern und einem Satz, wofür sie da sind – inklusive Schalter „Alle Symbole im Dock zeigen“
- Dock-Tooltips erklären jetzt, wofür ein Symbol da ist

## 0.8.0

### Neu
- **Discord-Benachrichtigungen per Webhook**: Wartet eine Session auf dich, während du nicht am Rechner bist, kommt eine Nachricht in deinen Discord-Kanal – auch aufs Handy
- **Tagesrückblick** in Discord: Tokens, Kosten, fertige Sessions, Fokus-Runden, Projekte und eine Mini-Grafik der letzten 7 Tage
- Rich Presence zeigt den Status als kleines Icon (arbeitet, wartet, fertig, Fokus, Pause)
- Rich Presence zeigt, wie viele in deiner Vibe-Lounge sind („2 von 16“)

### Verbessert
- Streamer-Modus schwärzt jetzt auch Discord-Webhook-URLs

## 0.7.0

### Neu
- **Vibe-Lounge**: mit Freunden im selben Raum vibecoden – ganz ohne Server, direkt zwischen euch. Ihr seht, wer gerade baut, startet Fokus-Runden zusammen, chattet und schickt Reaktionen
- **Share-Codes**: Prompts, Skills und deine Atmosphäre als Code teilen (z. B. per Discord). Einfügen mit Strg+K – vor dem Übernehmen gibt’s immer eine Vorschau
- **Streamer-Modus**: schwärzt API-Keys, Passwörter, Benutzernamen und E-Mails, sperrt `.env` & Co. im Editor und verdeckt Notizen
- OBS-Overlay für Streams: Status, Plan, Live-Feed und Fokus-Timer als Browserquelle
- Twitch-Chat-Vorschläge: Zuschauer schlagen mit `!vibe …` Prompts vor und stimmen ab – du entscheidest, was ins Terminal kommt
- Vorhang (Strg+Umschalt+H) verdeckt sofort den ganzen Bildschirm
- Im Editor Dateien und Ordner anlegen, umbenennen und löschen (Rechtsklick im Dateibaum, F2, Entf)

### Verbessert
- Updates werden direkt beim Öffnen installiert, solange noch keine Session läuft – kein manueller Neustart mehr nötig
- Update-Prüfung startet schneller nach dem Öffnen

## 0.6.0

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

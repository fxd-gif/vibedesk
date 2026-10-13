<div align="center">

<img src="resources/icon.png" width="112" alt="VibeDesk" />

# VibeDesk

**Dein ruhiger Ort zum Vibecoden.**<br/>
Regen an der Scheibe, Lofi im Ohr – und alle Claude-Code-Sessions auf einen Blick.

[![Release](https://img.shields.io/github/v/release/fxd-gif/vibedesk?style=flat-square&color=9fb8ff&label=Version)](https://github.com/fxd-gif/vibedesk/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/fxd-gif/vibedesk/total?style=flat-square&color=4ade80&label=Downloads)](https://github.com/fxd-gif/vibedesk/releases)
![Windows](https://img.shields.io/badge/Windows-10%20%7C%2011-0b0f17?style=flat-square&logo=windows&logoColor=white)

<a href="https://github.com/fxd-gif/vibedesk/releases/latest"><b>⬇&nbsp; Download für Windows</b></a>

<br/><br/>

<img src=".github/assets/hero.jpg" alt="VibeDesk mit zwei Claude-Code-Sessions, Stats, Todos und Agent-Baum" />

</div>

<br/>

## Was ist VibeDesk?

VibeDesk ist eine Vollbild-Arbeitsumgebung für Windows, gebaut für das Arbeiten mit [Claude Code](https://docs.claude.com/en/docs/claude-code). Statt zwischen Terminals, Browser und Musik-App hin- und herzuspringen, sitzt du vor einer verregneten Fensterscheibe – und alles, was du zum Bauen brauchst, schwebt in Glasfenstern davor.

## Features

**Atmosphäre**
- Realistischer Regen auf der Scheibe (WebGL) – Stadt bei Nacht, Wald oder Tokio-Gasse, oder dein eigenes Bild
- Lofi-Radio und synthetisches Regengeräusch, getrennt regelbar
- Fokus-Timer (Pomodoro) – in Pausen wird es automatisch leiser

**Claude Code im Blick**
- Mehrere Sessions parallel, mit Status im Dock: arbeitet · wartet auf dich · fertig
- **Mitteilungen**: Karten mit „Öffnen“, Windows-Benachrichtigungen im Hintergrund, Verlauf hinter der Glocke – in Fokus-Runden kommt nur Wichtiges durch
- Sanfter Ton, sobald eine Session auf dich wartet
- **Session-Inspector:** Live-Feed aller Aktionen, Todo-Fortschritt, Agent-Baum für Subagents und Stats – in einem Fenster mit Tabs
- **Stats:** Context-Auslastung, Tokens, Cache-Trefferquote und geschätzte Kosten – pro Session und pro Tag
- Frühere Sessions mit einem Klick fortsetzen

**Addons**
- **Addon-Maker** als Flowchart-Editor – Bausteine ziehen und verbinden, ohne eine Zeile Code: „Wenn eine Session auf mich wartet → wechsle nach Tokio und spiel einen Gong“
- Auslöser, Aktionen, Wenn/Sonst mit Und/Oder, Je nach Wert, Schleifen, Fragen mit Knöpfen, Überblenden und dauerhaft gemerkte Werte; eigene Szenenbilder, Töne und Prompt-Vorlagen im Addon
- **Erweitert:** Signale (auch als Unterprogramme), parallele Zweige, Warten bis, Drossel, Listen und verschachtelte Berechnungen
- **8 Vorlagen** zum Start – vom Pomodoro mit Statistik bis zum Kosten-Wächter
- Teilen als **`.vibeaddon`**-Datei: exportieren, verschicken, per Doppelklick installieren
- Sicher by Design: Addons sehen nur ihre Bausteine – keine Dateien, keine Befehle, kein Internet. Vor dem Installieren zeigt VibeDesk, was ein Addon tut

**Werkzeuge**
- **Code-Editor** für schnelle Anpassungen: Klick auf eine Datei im Live-Feed öffnet sie genau an der Stelle, die Claude geändert hat – mit Dateibaum, Tabs und Syntax-Highlighting
- **Befehls-Palette** (<kbd>Strg</kbd> + <kbd>K</kbd>): alle Fenster, Projekte und Aktionen per Suche
- Browser-Vorschau: Dev-Server werden erkannt und direkt im Glasfenster geöffnet
- Prompt-Bibliothek und Notizen pro Projekt
- Skills per Drag & Drop oder GitHub-Link installieren
- Discord Rich Presence mit eigenen Texten, Bildern, Status-Icons, Lounge-Größe und Live-Vorschau
- Discord-Benachrichtigungen per Webhook: „Session wartet auf dich“ aufs Handy und ein Tagesrückblick am Abend

<table>
  <tr>
    <td><img src=".github/assets/focus.jpg" alt="Fokus-Timer vor der Tokio-Szene" /></td>
    <td><img src=".github/assets/welcome.jpg" alt="Willkommens-Rundgang" /></td>
  </tr>
</table>

## Installation

1. Lade **`VibeDesk-Setup.exe`** aus den [Releases](https://github.com/fxd-gif/vibedesk/releases/latest) herunter und starte sie.
2. Ein kurzer Rundgang richtet alles ein.
3. Ab jetzt startest du VibeDesk mit <kbd>Win</kbd> + <kbd>R</kbd> → `vibe`.

Updates kommen automatisch: VibeDesk lädt neue Versionen im Hintergrund und installiert sie beim nächsten Neustart.

**Voraussetzungen:** Windows 10 oder 11. Node.js und [Claude Code](https://docs.claude.com/en/docs/claude-code) installiert VibeDesk beim ersten Start auf Wunsch mit einem Klick.

## Bedienung

| | |
|---|---|
| <kbd>Win</kbd> + <kbd>R</kbd> → `vibe` | VibeDesk starten |
| <kbd>Esc</kbd> halten · <kbd>F11</kbd> | Vollbild verlassen |
| Fenster an den Rand ziehen | halbe Bildschirmbreite |
| Doppelklick auf die Titelleiste | maximieren |
| <kbd>Strg</kbd> + <kbd>K</kbd> · <kbd>Strg</kbd> + <kbd>⇧</kbd> + <kbd>P</kbd> | Befehls-Palette (im Terminal nur die zweite) |
| <kbd>Strg</kbd> + <kbd>S</kbd> | im Editor speichern |
| Palette → Fenster anordnen | alle Fenster automatisch kacheln |

## Datenschutz

Alles bleibt auf deinem Rechner. VibeDesk liest die Hook-Events und Protokolle von Claude Code lokal aus (Server nur auf `127.0.0.1`, mit Zufallstoken), verändert keine Projekt-Einstellungen und sendet keine Telemetrie. Online geht es nur für das Lofi-Radio, Updates, Skill-Downloads und – falls aktiviert – Discord.

## Aus dem Quellcode bauen

```bash
npm install
npm run dev      # Entwicklung mit Hot-Reload
npm run dist     # Installer nach dist/
```

<div align="center">
<br/>
<sub>Gebaut mit Electron, React und WebGL · © 2026 fxd-gif</sub>
</div>

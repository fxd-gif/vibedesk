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
- Sanfter Ton, sobald eine Session auf dich wartet
- Live-Feed aller Aktionen, Todo-Fortschritt und Agent-Baum für Subagents
- **Stats:** Context-Auslastung, Tokens, Cache-Trefferquote und geschätzte Kosten – pro Session und pro Tag
- Frühere Sessions mit einem Klick fortsetzen

**Werkzeuge**
- Browser-Vorschau: Dev-Server werden erkannt und direkt im Glasfenster geöffnet
- Prompt-Bibliothek und Notizen pro Projekt
- Skills per Drag & Drop oder GitHub-Link installieren
- Discord Rich Presence mit eigenen Texten, Bildern und Live-Vorschau

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

**Voraussetzungen:** Windows 10 oder 11 · [Claude Code](https://docs.claude.com/en/docs/claude-code) (`npm i -g @anthropic-ai/claude-code`)

## Bedienung

| | |
|---|---|
| <kbd>Win</kbd> + <kbd>R</kbd> → `vibe` | VibeDesk starten |
| <kbd>Esc</kbd> halten · <kbd>F11</kbd> | Vollbild verlassen |
| Fenster an den Rand ziehen | halbe Bildschirmbreite |
| Doppelklick auf die Titelleiste | maximieren |
| Dock → Anordnen | alle Fenster automatisch kacheln |

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

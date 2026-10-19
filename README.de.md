<div align="center">

<img src="resources/icon.png" width="112" alt="VibeDesk" />

# VibeDesk

**Dein ruhiger Ort zum Vibecoden.**<br/>
Regen an der Scheibe, Lofi im Ohr – und alle Claude-Code-Sessions auf einem Windows-Desktop.

[English](README.md) · **Deutsch** · [Website](https://fxd-gif.github.io/vibedesk/)

[![Release](https://img.shields.io/github/v/release/fxd-gif/vibedesk?style=flat-square&color=9fb8ff&label=Version)](https://github.com/fxd-gif/vibedesk/releases/latest)
[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-4ade80?style=flat-square)](LICENSE)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0b0f17?style=flat-square&logo=windows&logoColor=white)

<a href="https://github.com/fxd-gif/vibedesk/releases/latest"><b>Download für Windows</b></a>

<br/><br/>

<!-- hero.gif: sobald .github/assets/hero.gif existiert, src unten auf .github/assets/hero.gif ändern -->
<img src=".github/assets/hero.jpg" alt="VibeDesk mit zwei Claude-Code-Sessions, Stats, Todos und Agent-Baum vor einer verregneten Scheibe" />

</div>

<br/>

## Was ist VibeDesk?

VibeDesk ist eine Vollbild-Arbeitsumgebung für Windows, gebaut für das Arbeiten mit [Claude Code](https://docs.claude.com/en/docs/claude-code). Statt zwischen Terminals, Browser und Musik-App hin- und herzuspringen, sitzt du vor einer verregneten Fensterscheibe – und alles, was du zum Bauen brauchst, schwebt in Glasfenstern davor.

In den Terminals läuft das echte Claude Code. VibeDesk legt den Blick darum: was jede Session gerade tut, worauf sie wartet und was sie kostet.

## Warum VibeDesk

- **Alle Sessions auf einen Blick.** Mehrere Claude-Code-Sessions nebeneinander – du siehst sofort, welche arbeitet, welche auf dich wartet und welche fertig ist.
- **Claude antworten, ohne das Terminal zu suchen.** Freigaben kommen als Karte (Erlauben · Immer · Ablehnen), am PC und auf dem Handy.
- **Sessions parallel arbeiten lassen, dann sicher zusammenführen.** Merge Studio gibt jeder Session einen eigenen Git-Worktree und Branch, erkennt Konflikte, bevor sie passieren, und übernimmt ganze Branches, einzelne Dateien oder einzelne Abschnitte – immer mit Checkpoint vorher.
- **Claude kennt dein Projekt.** Das „Gehirn“ hält Bereiche, Entscheidungen, Stolperfallen und Konventionen als verlinkte Markdown-Notizen fest, damit neue Sessions nicht jedes Mal von vorn erkunden.
- **Ein Ort, an dem man gern sitzt.** Regen, Lofi-Radio und Fokus-Timer – lange Sessions fühlen sich weniger nach Konsole an.

## Features

**Zwei Aufbau-Varianten**
- **Desktop:** frei schwebende Glasfenster und ein Dock, das mit dem wächst, was du nutzt
- **Studio:** Seitenleiste links, jedes Fenster als ganze Seite und eine Statusleiste mit Projekt, Branch, offenen Änderungen und dem, was Claude gerade tut. Umschalten im Mehr-Menü unter „Aufbau“ oder per Befehlspalette

**Atmosphäre**
- Regen auf der Scheibe (WebGL) – Stadt bei Nacht, Wald, Tokio-Gasse oder dein eigenes Bild
- Lofi-Radio oder **Spotify** (steuert deine Spotify-App: Playlists, Lieblingssongs, Warteschlange), dazu synthetisches Regengeräusch, getrennt regelbar
- Fokus-Timer (Pomodoro) – in Pausen wird es automatisch leiser
- Streamer-Modus: schwärzt API-Keys, Passwörter, Benutzernamen und E-Mails, sperrt `.env` & Co. im Editor; der Vorhang (<kbd>Strg</kbd> + <kbd>⇧</kbd> + <kbd>H</kbd>) verdeckt sofort den ganzen Bildschirm

**Claude-Code-Sessions**
- Mehrere Sessions parallel, mit Status im Dock: arbeitet · wartet auf dich · fertig
- Freigabe-Karten mit Erlauben · Immer · Ablehnen – oder „Im Terminal“ für die gewohnte Frage
- Mitteilungen als Karten, Windows-Benachrichtigungen im Hintergrund, Verlauf hinter der Glocke – in Fokus-Runden kommt nur Wichtiges durch
- Prompt-Warteschlange: Aufträge vormerken, die losgehen, sobald Claude fertig ist
- Schnell-Prompt von überall: <kbd>Strg</kbd> + <kbd>Alt</kbd> + <kbd>Leertaste</kbd> öffnet über jeder App ein Eingabefeld
- Wächter: meldet sich, wenn eine Session lange hängt, dreimal am selben Befehl scheitert oder der Kontext zu 85 % voll ist – mit passendem nächsten Schritt
- Terminal mit Kopieren/Einfügen wie im Windows Terminal, klickbaren Links und Dateipfaden, Suche, Zoom, Anhängen und einer PowerShell neben Claude
- Frühere Sessions mit einem Klick fortsetzen
- Nutzungslimit erreicht? VibeDesk liest die Reset-Zeit und lässt Claude danach von selbst weitermachen
- Zurückspulen: Gespräch und Code auf einen früheren Schritt zurücksetzen

**Merge Studio (Beta) – parallele Sessions**
- „Isolierte Session“: Claude bekommt einen eigenen Arbeitsordner (Git-Worktree) auf eigenem Branch – parallele Sessions kommen sich nie in die Quere
- Session-Karten mit Branch, geänderten Dateien, +/−, Live-Status und Badge: bereit · prüfen · Konflikte
- Konflikt-Vorhersage per `git merge-tree` – gegen den Ziel-Branch und zwischen Sessions, auch für noch nicht committete Änderungen –, ohne etwas zu verändern
- Datei-Vergleich nebeneinander: Session · aktuelles Ziel · andere Session
- Ganzen Branch, ausgewählte Dateien oder ausgewählte Abschnitte übernehmen (3-Wege-Apply). Ungespeicherte Änderungen im Ziel werden nie überschrieben, alles Riskante fragt vorher nach
- Automatische Checkpoints vor jedem Merge (als Git-Refs unter `refs/vibedesk/checkpoints`, nicht in deiner Historie) und Wiederherstellen per Klick
- KI-Zusammenfassung mit Risiken und empfohlenen nächsten Schritten; Tests vor dem Merge direkt im Ordner der Session

**Inspector und Stats**
- Live-Feed aller Aktionen, Todo-Fortschritt, Agent-Baum für Subagents und Stats in einem Fenster mit Tabs
- Context-Auslastung, Tokens, Cache-Trefferquote und geschätzte Kosten – pro Session und pro Tag
- Vibe Wrapped: dein Wochenrückblick (aktive Zeit, Prompts, geänderte Dateien, Top-Projekte) als Bild zum Teilen

**Das Gehirn (Projektgedächtnis)**
- Notizen in `.vibedesk/brain` im Projekt: Markdown mit `[[Links]]`, direkt in Obsidian zu öffnen und mit Git zu versionieren
- Jede Session startet mit einem Überblick über dieses Wissen und kann es über eigene Werkzeuge durchsuchen, lesen und erweitern
- **Über dich:** ein persönliches Gehirn, das in allen Projekten gilt. Claude merkt sich, wie du arbeitest und was du magst – je länger du VibeDesk nutzt, desto besser passt Claude zu dir. Liegt nur auf deinem PC
- Lebendiger Graph aus Notizen und Dateien – Knoten leuchten auf, während Claude liest, ändert oder lernt

**Werkzeuge**
- Code-Editor für schnelle Anpassungen: Klick auf eine Datei im Live-Feed öffnet sie genau an der Stelle, die Claude geändert hat
- Vorschau: Dev-Server werden erkannt und automatisch geöffnet. Mit „Zeig drauf“ klickst du ein Element an und sagst, was anders werden soll (Selektor, Text, HTML und Screenshot gehen mit). Konsolenfehler gehen per Klick an Claude
- Git & GitHub: Diff, vormerken, committen (Claude schreibt auf Wunsch die Nachricht), Verlauf, Push/Pull und Veröffentlichen auf GitHub – inklusive Login und Installation von Git/GitHub-CLI per Klick
- Befehls-Palette (<kbd>Strg</kbd> + <kbd>K</kbd>): alle Fenster, Projekte und Aktionen per Suche
- Prompt-Bibliothek und Notizen pro Projekt; Skills per Drag & Drop oder GitHub-Link installieren

**Handy-Begleiter**
- VibeDesk im Handy-Browser: QR-Code scannen, mit einem 6-stelligen Code vom PC-Bildschirm koppeln
- Sessions, Claudes letzte Ausgabe, Plan-Fortschritt und Mitteilungen; Freigaben beantworten (das Handy vibriert)
- Idee eintippen, Claude formuliert daraus einen klaren Prompt; ist Claude fertig, schlägt das Handy drei nächste Schritte vor
- Im WLAN und über einen Cloudflare-Quick-Tunnel auch von unterwegs (abschaltbar)

**Addons**
- Flowchart-Editor für eigene Erweiterungen ohne Code: „Wenn eine Session auf mich wartet → wechsle nach Tokio und spiel einen Gong“
- Auslöser, Aktionen, Bedingungen, Schleifen, Fragen mit Knöpfen, Signale, parallele Zweige, Listen und Berechnungen
- Makros für Claude: Prompts schicken, warten bis Claude fertig ist, weiter – gedrosselt und mit deutlicher Warnung beim Installieren
- 10 Vorlagen zum Start; Teilen als `.vibeaddon`-Datei, Installieren per Doppelklick
- Addons sehen nur ihre Bausteine – keine Dateien, keine Befehle, kein Internet. Vor dem Installieren zeigt VibeDesk im Klartext, was ein Addon tut

**Gemeinsam und Streaming**
- Vibe-Lounge: mit Freunden im selben Raum vibecoden, direkt zwischen euch ohne VibeDesk-Server – sehen, wer baut, Fokus-Runden zusammen, Chat und Reaktionen
- Share-Codes für Prompts, Skills und deine Atmosphäre – vor dem Übernehmen immer mit Vorschau
- Discord Rich Presence mit eigenen Texten, Bildern und Status-Icons, Live-Status, was Claude gerade tut („schreibt Code“, „führt Befehle aus“, aktuelle Aufgabe mit Fortschritt), und wechselnden Zeilen; Discord-Webhook-Nachrichten, wenn eine Session wartet, und ein Tagesrückblick
- OBS-Overlay (Status, Plan, Live-Feed, Fokus-Timer) als lokale Browserquelle; Twitch-Chat-Vorschläge per `!vibe …`, über die du entscheidest

<table>
  <tr>
    <td><img src=".github/assets/focus.jpg" alt="Fokus-Timer vor der Tokio-Szene" /></td>
    <td><img src=".github/assets/welcome.jpg" alt="Willkommens-Rundgang" /></td>
  </tr>
</table>

## Installation

1. Öffne das [neueste Release](https://github.com/fxd-gif/vibedesk/releases/latest) und lade **`VibeDesk-Setup-<version>.exe`** herunter.
2. Starte die Datei. Ein kurzer Rundgang richtet alles ein.
3. Ab jetzt startest du VibeDesk mit <kbd>Win</kbd> + <kbd>R</kbd> → `vibe`.

Updates lädt VibeDesk im Hintergrund von GitHub Releases und installiert sie beim nächsten Start (oder sofort, wenn noch keine Session läuft).

### Windows-SmartScreen-Warnung

Der Installer ist nicht signiert, deshalb zeigt Windows eventuell **„Der Computer wurde durch Windows geschützt“**. Klicke auf **Weitere Informationen → Trotzdem ausführen**.

Das ist bei kleinen Open-Source-Projekten üblich: Code-Signing-Zertifikate kosten jedes Jahr Geld, und SmartScreen warnt außerdem bei neuen Programmen, die noch selten heruntergeladen wurden. Es heißt nicht, dass die Datei als Schadsoftware erkannt wurde.

Wenn du sicher sein willst, dass die Datei die hier veröffentlichte ist, vergleiche ihre SHA256-Prüfsumme mit der in den Release-Notes:

```powershell
Get-FileHash .\VibeDesk-Setup-<version>.exe -Algorithm SHA256
```

Der Wert unter `Hash` muss genau mit der Prüfsumme in den Release-Notes übereinstimmen. Du kannst VibeDesk auch selbst aus dem Quellcode bauen (siehe unten).

### Voraussetzungen

- Windows 10 oder 11 (64-Bit)
- [Claude Code](https://docs.claude.com/en/docs/claude-code) mit einem Claude-Pro/Max-Abo oder einem Anthropic-API-Schlüssel
- Node.js (für den Hook-Forwarder) und Claude Code selbst: Fehlen sie, bietet VibeDesk beim ersten Start die Installation an (Node.js über `winget`, Claude Code über das offizielle Installationsskript von claude.ai)

Die Kosten in VibeDesk sind eine **Schätzung** nach Anthropics API-Preisen. Mit einem Abo zahlst du nicht pro Token – die Zahl dient zur Orientierung.

## Bedienung

| | |
|---|---|
| <kbd>Win</kbd> + <kbd>R</kbd> → `vibe` | VibeDesk starten |
| <kbd>Strg</kbd> + <kbd>Alt</kbd> + <kbd>Leertaste</kbd> | Schnell-Prompt aus jeder App |
| <kbd>Strg</kbd> + <kbd>K</kbd> · <kbd>Strg</kbd> + <kbd>⇧</kbd> + <kbd>P</kbd> | Befehls-Palette (im Terminal nur die zweite) |
| <kbd>Esc</kbd> halten · <kbd>F11</kbd> | Vollbild verlassen |
| <kbd>Strg</kbd> + <kbd>⇧</kbd> + <kbd>H</kbd> | Vorhang (Bildschirm verdecken) |
| <kbd>Strg</kbd> + <kbd>S</kbd> | im Editor speichern |
| Fenster an den Rand ziehen | halbe Bildschirmbreite |

## Datenschutz

VibeDesk hat **keine Telemetrie, keine Analyse und kein Konto**. Es gibt keinen VibeDesk-Server.

**Was lokal bleibt**
- Hook-Events von Claude Code gehen an einen lokalen Server auf `127.0.0.1` (zufälliger Port, Zufallstoken).
- VibeDesk liest Claudes Protokolle in `~/.claude/projects` (bzw. `CLAUDE_CONFIG_DIR`), um Feed, Todos und Stats zu zeigen.
- Das Fehlerprotokoll bleibt auf deinem Rechner: `%APPDATA%\vibedesk\logs\fehler.log`. „Fehler melden“ öffnet nur ein vorausgefülltes GitHub-Issue im Browser (Version, Windows-Version, Claude-Code-Version und das Ende des Fehlerprotokolls, Benutzernamen in Pfaden unkenntlich). Du siehst alles vor dem Abschicken, ohne dich wird nichts gesendet.

**Was ins Internet geht – und wann**

| Was | Wohin | Wann |
|---|---|---|
| Lofi-Radio | der gewählte Stream (Standard laut.fm; außerdem ilovemusic.de, zeno.fm) | solange Musik an ist (Standard: an) |
| Update-Prüfung und Download | GitHub Releases | beim Start |
| Claude Code selbst, KI-Commit-Nachrichten, Merge-Studio-Review, Prompt-Formulierung am Handy | Anthropic, über dein eigenes Claude Code | wenn du Claude nutzt |
| Spotify | accounts.spotify.com (Anmeldung) und api.spotify.com (Wiedergabe steuern), mit deiner eigenen Spotify-App-ID | nur wenn du Spotify verbindest |
| Skill-Downloads | GitHub (codeload.github.com) | wenn du einen Skill per Link installierst |
| Git-Fenster | deine Git-Remotes; GitHub-Login über die GitHub-CLI (Code im Browser) | bei Push, Pull, Login oder Veröffentlichen |
| Werkzeuge installieren | winget / Installer von claude.ai | nur auf Klick |
| Discord Rich Presence | deine lokale Discord-App; discord.com für App-Infos bei eigener App-ID | nur wenn aktiviert |
| Discord-Webhook | deine Webhook-URL | nur wenn aktiviert |
| Twitch-Chat-Vorschläge | Twitch-Chat (anonym, nur lesend) | nur wenn aktiviert |
| Handy-Begleiter | lokales Netz auf Port 17350; mit „Von überall“ (Standard, sobald der Begleiter an ist) ein Cloudflare-Quick-Tunnel (`*.trycloudflare.com`, cloudflared wird per winget installiert) | nur solange der Begleiter eingeschaltet ist |
| Vibe-Lounge | öffentliche Nostr-Relays zur Signalisierung (mit dem Raumcode verschlüsselt), danach WebRTC direkt zwischen den Teilnehmern, die dabei gegenseitig ihre IP-Adresse sehen | nur solange du in einer Lounge bist |

**Was VibeDesk auf deinem PC verändert**
- **In deinen Projekten:** Mit eingeschaltetem Gehirn (Standard) legt VibeDesk einen Ordner `.vibedesk/` mit den Gehirn-Notizen an. Trag ihn in `.gitignore` ein, wenn du ihn nicht committen willst.
- **Merge Studio:** Isolierte Sessions sind Git-Worktrees in `.vibedesk/worktrees/` auf Branches namens `vd/…`. VibeDesk trägt den Ordner in die lokale `.git/info/exclude` des Repos ein (deine `.gitignore` bleibt unberührt). Checkpoints sind Git-Refs unter `refs/vibedesk/checkpoints/`; löschen mit `git for-each-ref --format="%(refname)" refs/vibedesk | % { git update-ref -d $_ }`.
- **Claude-Code-Einstellungen:** VibeDesk ändert **weder** deine `~/.claude/settings.json` noch Projekt-Einstellungen. Für Sessions, die in VibeDesk starten, schreibt es eine temporäre Einstellungsdatei mit seinen Hooks (und mit Gehirn eine MCP-Konfiguration für die Gehirn-Werkzeuge) nach `%TEMP%\vibedesk` und übergibt sie per `--settings` / `--mcp-config`. Sessions, die du außerhalb von VibeDesk startest, bleiben unberührt.
- **Skills**, die du installierst, landen in `~/.claude/skills` (bzw. im `.claude/skills` des Projekts).
- **Ausführen-Kürzel:** `vibe` für <kbd>Win</kbd> + <kbd>R</kbd> ist ein Registry-Eintrag unter `HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\vibe.exe`.

## Deinstallieren

Deinstalliere VibeDesk über **Einstellungen → Apps**. Das Programm wird entfernt, liegen bleiben aber:

| Was | Wo |
|---|---|
| Einstellungen, Projektliste, Stats, Addons, Szenen, Notizen, Fehlerprotokoll | `%APPDATA%\vibedesk` |
| Temporäre Dateien (Session-Einstellungen, eingefügte Screenshots) | `%TEMP%\vibedesk` |
| Gehirn-Notizen | `.vibedesk\` in jedem geöffneten Projekt |
| Ausführen-Kürzel | `HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\vibe.exe` |
| Werkzeuge, die VibeDesk für dich installiert hat | Node.js, Claude Code, Git, GitHub-CLI, cloudflared (jeweils einzeln deinstallierbar) |

Um alles zu entfernen, nach der Deinstallation in PowerShell:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\vibedesk", "$env:TEMP\vibedesk" -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\vibe.exe" -Recurse -ErrorAction SilentlyContinue
```

Die `.vibedesk`-Ordner in deinen Projekten löschst du von Hand, wenn du die Notizen nicht behalten willst.

## Aus dem Quellcode bauen

Benötigt Node.js und npm.

```bash
npm install
npm run dev      # Entwicklung mit Hot-Reload
npm run dist     # Installer nach dist/
```

## FAQ

**Ist das ein offizielles Produkt von Anthropic?**
Nein. VibeDesk ist ein unabhängiges Open-Source-Projekt. Es nutzt das Claude-Code-CLI, das du selbst installierst und mit dem du dich selbst anmeldest.

**Gibt es VibeDesk für macOS oder Linux?**
Noch nicht. VibeDesk läuft vorerst nur unter Windows.

**Was kostet VibeDesk?**
Nichts – es ist kostenlos und Open Source (MIT). Du brauchst nur dein eigenes Claude-Abo oder einen API-Schlüssel für Claude Code.

**Gibt es die Oberfläche auf Englisch?**
Ja. VibeDesk richtet sich nach der Sprache von Windows (Deutsch oder Englisch). Umstellen im Mehr-Menü unter „Sprache · Language“.

## Feedback und Hilfe

Fragen, Fehlermeldungen und Ideen laufen alle über [GitHub Issues](https://github.com/fxd-gif/vibedesk/issues). In der App öffnet „Fehler melden“ ein vorausgefülltes Issue. Sicherheitslücken bitte wie in [SECURITY.md](SECURITY.md) beschrieben melden.

## Lizenz

[MIT](LICENSE) © 2026 fxd-gif

<div align="center">
<br/>
<sub>Gebaut mit Electron, React und WebGL.<br/>Nicht mit Anthropic verbunden. Claude ist eine Marke von Anthropic.</sub>
</div>

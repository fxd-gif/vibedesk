# Changelog

Neue Einträge kommen unter „Unveröffentlicht“. `npm run release` macht daraus automatisch die neue Versionsnummer –
und VibeDesk zeigt sie nach dem Update einmalig unter „Was ist neu“.

Abschnitte: `### Neu`, `### Verbessert`, `### Entfernt`

## Unveröffentlicht

## 1.8.0

### Neu

- **Claude gestaltet dein Terminal**: Sag in einer Session „Mach mir ein Terminal-Theme in Herbstfarben“ (oder „wie Dracula“, „ruhiges Blau“ …), und Claude erzeugt ein eigenes Farbschema und schaltet es ein. Es steht danach auch in den Terminal-Einstellungen zur Auswahl („Eigenes: Herbst“). Der Hintergrund bleibt Glas über deiner Regenszene

## 1.7.0

### Neu

- **Dev-Server per Klick**: Hat dein Projekt ein `dev`-Skript in der `package.json` (auch wenn Claude es gerade erst angelegt hat), steht im Terminal-Kopf „▶ Dev-Server“. Ein Klick startet ihn in einer Shell daneben, mit dem passenden Paketmanager (npm, pnpm, yarn oder bun), und die Adresse erscheint wie gewohnt als Vorschau-Chip. Funktioniert auch, wenn Windows PowerShell-Skripte gesperrt sind

- **VibeDesk als Werkzeug für Claude (MCP)**: Claude kann den Desktop jetzt selbst bedienen. Sag einfach „Sortier meine Fenster“, „Mach den Zen-Modus an“, „Tokyo-Szene mit mehr Regen“, „Lofi leiser“, „Öffne das Git-Fenster“ oder „Wechsel in den Studio-Aufbau“, und Claude erledigt es. Dazu gehören Fenster anordnen und aufräumen, Zen-Modus, Szene, Regen und Unschärfe, Lofi-Radio und Regengeräusch, Fenster öffnen, Aufbau, Terminal-Farbschema, Fokus-Timer und eine kurze Karte für dich („Build fertig“). Claude kann vorher nachsehen, wie alles eingestellt ist. Funktioniert in jeder Session, auch wenn das Gehirn aus ist

## 1.6.0

### Neu

- **Plan-Karte**: Legt Claude im Plan-Modus einen Plan vor, erscheint er als lesbare Karte, mit Überschriften, Listen und Code statt Werkzeug-JSON. „Los geht’s“ gibt ihn frei, „Ändern …“ schickt Claude deine Rückmeldung („bitte ohne neue Abhängigkeiten“), und Claude überarbeitet den Plan. Am Handy genauso, dort bleibt dein angefangener Text auch stehen, wenn sich zwischendurch etwas aktualisiert

## 1.5.0

### Neu

- **Abo-Limit im Blick**: Mit Claude Pro oder Max zeigt die Statuszeile unter dem Terminal, wie viel vom 5-Stunden-Limit verbraucht ist (Maus drüber: auch das Wochenlimit und wann beides wieder bei 0 ist). Bei 75 % und 90 % kommt ein leiser Hinweis, und sobald ein volles Limit wieder frei ist, sagt VibeDesk Bescheid. Auch in der Studio-Statusleiste und am Handy. Die Werte kommen direkt von Claude Code. Eine eigene Statuszeile, die du in Claude Code eingerichtet hast, läuft weiter wie gewohnt

- **Tasten am Handy**: Mit freigegebenem Terminal kannst du im Handy-Begleiter zusätzlich „Tasten vom Handy erlauben“. Dann steht unter dem Terminal eine Leiste mit Esc, ↑, ↓, 1, 2, 3 und Enter – genug, um Claudes Auswahlmenüs („1. Yes / 2. No“) vom Sofa aus zu beantworten oder Claude zu unterbrechen. Freie Eingaben gibt es dort bewusst nicht, und zu schnelles Tippen wird gebremst

### Verbessert

- Terminal am Handy: Wer unten mitliest, bleibt unten – auch wenn sich die Größe ändert (Tastenleiste, Handy drehen)

## 1.4.0

### Neu

- **Anfänger oder Profi**: Der Einrichtungs-Rundgang fragt nach deiner Vibecoding-Erfahrung. Anfänger bekommen eine ruhige Oberfläche mit Dock und leisen Tipps, Profis den Studio-Aufbau mit Seitenleiste, Statusleiste und allen Werkzeugen. Alles bleibt einzeln an- und abschaltbar
- **Klick-Tour**: Eine kurze Tour zeigt Schritt für Schritt, wo was ist und wie VibeDesk funktioniert. Startet am Ende der Einrichtung, jederzeit über die Befehlspalette („Rundgang starten“) oder in den Einstellungen
- **Einstellungen → Ansicht**: Erfahrung, Aufbau, Werkzeugkasten und welche Tabs im Session-Inspector sichtbar sind, an einem Ort
- **Automatische Updates abschaltbar** (Einstellungen → Updates): Dann meldet VibeDesk neue Versionen nur und lädt sie erst auf Knopfdruck. Dort siehst du auch die installierte Version und kannst selbst nach Updates suchen

## 1.3.0

### Neu

- **Ganzes Terminal auf dem Handy**: Im Fenster „Handy-Begleiter“ lässt sich unter „Terminal“ freigeben, dass das Handy das komplette Terminal einer Session sieht, live, mit Farben und dem ganzen Verlauf. Ältere Zeilen lädt ein Tipp nach. Wer oben im Verlauf liest, wird nicht nach unten gerissen, ein Knopf „Neue Ausgabe“ bringt einen zurück. Trennlinien bleiben Linien, lange Zeilen brechen um (abschaltbar). Standardmäßig aus, weil im Terminal auch Geheimnisse stehen können
- **Am Handy sehen, was gerade passiert**: Jede Session zeigt deinen letzten Auftrag und die letzten Schritte von Claude („Ändert src/app.tsx“, „Befehl npm test“, …) mit Häkchen, Fehler-Kreuz und Zeit, statt nur „arbeitet“ oder „wartet“
- **Zen-Modus** (<kbd>Strg</kbd> + <kbd>.</kbd> oder das Auge im Terminal-Kopf): Nur noch die aktuelle Session und der Regen. Andere Sessions stehen als kleine Pillen oben, das Dock kommt erst zurück, wenn die Maus an den unteren Rand fährt
- **Werkzeugkasten**: Module wie Addons, Handy-Begleiter, Discord, Lounge oder Streamer-Modus lassen sich ausblenden. Sie verschwinden dann aus Dock, Mehr-Menü und Befehlspalette. Neue Nutzer wählen beim Start „Einfach“ oder „Alles“
- **Einstellungen an einem Ort**: Ein eigenes Fenster mit Allgemein, Werkzeugkasten, Mitteilungen und Terminal. Im Mehr-Menü stehen nur noch Fenster
- **Aufräumen**: Ein Befehl in der Palette räumt übrige Fenster ins Dock. Auf Wunsch wandern Fenster nach 15 Minuten ohne Benutzung von selbst dorthin
- **Leise Tipps**: Statt still neue Symbole einzublenden, sagt VibeDesk einmal Bescheid, wenn etwas gerade passt, etwa Merge Studio bei zwei Sessions oder Git, sobald Claude Dateien geändert hat. Abschaltbar in den Einstellungen

### Verbessert

- Das Dock bleibt ruhiger: Git erscheint erst, wenn Claude Dateien geändert hat, das Gehirn erst, wenn Claude es benutzt, die Vorschau erst bei einem laufenden Dev-Server. Einmal erschienene Symbole bleiben stehen, damit nichts herumspringt
- Das Dock blendet sich ab, während du im Terminal tippst
- Mitteilungen: Es steht immer nur eine Karte da, der Rest wartet hinter „+n weitere“. Mehrere „fertig“-Meldungen werden zu einer gebündelt, und Wichtiges wie „wartet auf dich“ steht immer vorn
- Statistik: Pro Session stehen nur Kontext und Kosten vorn, Cache-Werte, Antworten und Tool-Aufrufe liegen hinter „Details“
- Der Einrichtungs-Rundgang ist kürzer. Szene, Musik und Discord kommen später als Tipp

## 1.2.0

### Neu

- **Discord zeigt live, was Claude gerade tut**: Deine Freunde sehen „schreibt Code“, „führt Befehle aus“, „recherchiert im Web“ oder „schickt 3 Agents los“, dazu die aktuelle Aufgabe aus Claudes Todo-Liste mit Fortschritt („Baut die Login-Seite · 3/7“) und deine Serie („🔥 5 Tage am Stück“). Dateinamen und Befehle verlassen nie deinen PC, im Privat- und Streamer-Modus fällt auch die Aufgabe weg. Die neuen Platzhalter heißen `{doing}`, `{task}`, `{progress}` und `{streak}`, die Vorlage „Live“ nutzt sie alle
- **Wechselnde Zeilen in Discord**: Mehrere Varianten mit `||` trennen, und Discord wechselt alle 20 Sekunden zwischen ihnen. Leere Varianten werden übersprungen
- **Merge Studio (Beta)**: Ein Kontrollzentrum für parallele Claude-Sessions. „Isolierte Session“ gibt Claude einen eigenen Arbeitsordner (Git-Worktree) auf eigenem Branch, sodass sich mehrere Sessions nicht in die Quere kommen. Merge Studio zeigt alle Sessions mit Branch, geänderten Dateien, +/− und Live-Status, vergleicht eine Datei nebeneinander (Session · Ziel · andere Session) und erkennt vorab, wo es wirklich kracht: mit dem Ziel-Branch und zwischen den Sessions, auch für noch nicht committete Änderungen. Übernehmen lässt sich alles, einzelne Dateien oder einzelne Abschnitte. Vorher setzt Merge Studio immer einen Checkpoint, ungespeicherte Änderungen im Ziel werden nie überschrieben, und alles Riskante fragt nach. Dazu kommen eine KI-Zusammenfassung mit Risiken und nächsten Schritten, Tests im Ordner der Session vor dem Merge und Checkpoints zum Zurückholen. Zu finden im Mehr-Menü, ab zwei parallelen Sessions auch im Dock
- **Zwei Aufbau-Varianten**: Neben dem gewohnten Desktop mit freien Fenstern und Dock gibt es jetzt den Aufbau „Studio“: Seitenleiste links, jedes Fenster als ganze Seite und unten eine Statusleiste mit Projekt, Branch, offenen Änderungen und was Claude gerade tut. Umschalten im Mehr-Menü unter „Aufbau“ oder per Befehlspalette

## 1.1.0

### Neu

- **Claude lernt dich kennen**: Neben dem Gehirn jedes Projekts gibt es jetzt ein persönliches Gehirn „Über dich“. Darin hält Claude fest, wie du arbeitest, was du magst und was nicht, und jede neue Session startet in jedem Projekt mit diesem Wissen. Je länger du VibeDesk nutzt, desto besser passt Claude zu dir. Die Notizen liegen nur auf deinem PC, nie im Projekt. Ansehen und bearbeiten im Gehirn-Fenster unter „Über dich (alle Projekte)“. Der Knopf „Claude lernt mich kennen“ legt die ersten Notizen an, und Vibe Wrapped zeigt, wie viel Claude in der Woche über dich gelernt hat
- **VibeDesk auf Englisch**: Die ganze Oberfläche gibt es jetzt auch auf Englisch: Fenster, Mitteilungen, Dialoge, Handy- und Overlay-Seite. VibeDesk richtet sich nach der Sprache von Windows. Umstellen lässt es sich im Mehr-Menü unter „Sprache · Language“

### Verbessert

- Discord: Der Knopf „VibeDesk holen“ steht jetzt immer an erster Stelle, eigene Knöpfe bekommen den zweiten Platz. Abschalten lässt er sich weiterhin im Discord-Fenster
- Die Anhänge-Leiste im Terminal ragt nicht mehr über die Statuszeile

## 1.0.0

### Neu

- **Weiter nach dem Limit**: Meldet Claude „Limit erreicht · resets 22:30“, macht VibeDesk nach dem Reset von selbst weiter. Oben im Terminal steht, wann es losgeht, ein Klick bricht es ab. Abschalten lässt es sich in den Terminal-Einstellungen
- **Zurückspulen**: Ein Knopf in der Statuszeile öffnet Claudes eigenes Zurückspulen. Du wählst einen früheren Schritt, und Gespräch und Code gehen auf diesen Stand zurück
- **Über VibeDesk** im Mehr-Menü: Version, Lizenz, Fehlerprotokoll und „Fehler melden“. Das öffnet ein vorausgefülltes GitHub-Issue, du siehst alles, bevor du es abschickst
- **Energiesparen** im Atmosphäre-Menü: Im Akkubetrieb zeichnet der Regen sparsamer, auf Wunsch auch immer

### Verbessert

- **Erststart ohne Sackgassen**: Die Einrichtung zeigt, ob du bei Claude angemeldet bist, und sagt in einem Satz, warum eine Installation gescheitert ist. Kann eine Session ohne Claude Code nicht starten, wird die Einrichtung direkt angeboten. Ein beendetes Claude wird verständlich erklärt
- **Stabiler**: Ein Fehler in einem Fenster macht nicht mehr die ganze App weiß. Das Fenster zeigt dann „Neu laden“. Ein zweites `vibe` stört laufende Sessions nicht mehr. Startfehler zeigen eine Meldung statt einer hängenden App
- **Schneller**: Der Regen zeichnet höchstens 30 Bilder pro Sekunde und pausiert gar nicht mehr. Große Claude-Protokolle bremsen VibeDesk nicht mehr aus. Die Oberfläche zeichnet bei Claude-Ereignissen und im Fokus-Timer nicht mehr alles neu
- **Sicherer**: Das Hauptfenster lädt keine fremden Seiten mehr, Seiten in der Vorschau bekommen weder Kamera noch Mikrofon oder Standort. Prompts von Addons, Handy und Warteschlange können Claude nicht mehr in den Bash-Modus schalten
- Discord-Profil, Vibe-Wrapped-Bild und Streamer-Overlay zeigen dezent, woher VibeDesk kommt. Alles lässt sich abschalten
- VibeDesk ist jetzt offiziell Open Source unter der MIT-Lizenz, mit englischer README und eigener Website

## 0.19.0

### Neu

- **Anhänge im Terminal**: Die Büroklammer oben im Claude-Fenster öffnet den Windows-Dateidialog. Eine Liste zeigt dann, was du angehängt hast und wie weit es ist: *noch nicht abgeschickt*, *abgeschickt* oder *Claude hat sie gelesen*. Dateien, die du ins Terminal ziehst, und Screenshots per Strg+V landen auch in der Liste. Von dort lässt sich ein Pfad noch einmal einfügen oder wieder entfernen

## 0.18.0

### Neu

- **Terminal wie im Windows Terminal**: Strg+C kopiert, wenn etwas markiert ist (sonst bricht es wie gewohnt ab). Strg+V fügt ein, auch Screenshots: Das Bild wird gespeichert und Claude bekommt den Pfad. Rechtsklick kopiert oder fügt ein, Dateien lassen sich ins Terminal ziehen
- **Klickbare Links im Terminal**: Adressen öffnen sich im Browser, `localhost` in der Vorschau. Dateipfade wie `src/app.ts:42` öffnen den Editor genau an der Stelle
- **Suche und Zoom**: Strg+F sucht im Terminal, Strg+Plus/Minus ändert die Schriftgröße, Strg+0 setzt sie zurück
- **Shell neben Claude**: Ein Klick auf das Terminal-Symbol im Fenstertitel öffnet eine PowerShell im Projektordner daneben. Über die Befehls-Palette („Shell öffnen“) gibt es sie auch als eigenes Fenster
- **Statuszeile**: Unter jedem Claude-Terminal stehen Modell, Kontext-Füllstand, Kosten und Laufzeit
- **Terminal-Einstellungen** (Zahnrad im Fenstertitel): Farbschema (auch passend zur Szene), Schriftgröße, Zeilenhöhe, Cursor, Shell-Art und Statuszeile
- **Vorschau öffnet sich von selbst**: Startet Claude oder eine Shell einen lokalen Server, geht die Vorschau mit der Seite automatisch auf. Ist der Server noch nicht ganz bereit, versucht sie es ein paar Sekunden weiter. Abschaltbar im Terminal-Menü

### Verbessert

- **Todos im Inspector**: Neue Claude-Code-Versionen planen mit einzelnen Aufgaben statt einer Liste. Diese Aufgaben erscheinen jetzt im Inspector, laufende mit ihrem „Baue …“-Text
- **Sessions überleben einen Neustart von VibeDesk**: Eine Session, die noch aus der Zeit vor einem Update läuft, erscheint weiter im Inspector mit Todos, Feed und Agenten
- **Neuladen des Fensters** (Strg+R): Laufende Sessions und Shells kommen samt Verlauf wieder
- Ein dezenter, atmender Rand zeigt, wenn Claude gerade arbeitet

## 0.17.2

### Behoben

- **Update-Fensterchen bleibt beim Neustart offen**: Während VibeDesk sich für ein Update beendet, zeigt das kleine Fenster jetzt durchgehend „Installiere Update …“, bis die neue Version da ist. Bisher war es in dieser Zeit verschwunden
- **Gehirn nach einem Update**: Laufende Claude-Sessions finden VibeDesk nach einem Neustart (z. B. durch ein Update) wieder. Das Gehirn und die Live-Anzeige funktionieren weiter, statt „VibeDesk ist nicht erreichbar“ zu melden

## 0.17.1

### Verbessert

- **Vibe Wrapped in neuem Look**: Der Wochenrückblick ist jetzt eine ruhige, dunkle Karte. Klare Zahlen, ein Akzent für deinen besten Tag, keine bunten Verläufe mehr. Sieht auch als geteiltes Bild besser aus

## 0.17.0

### Verbessert

- **Handy von überall ist jetzt Standard**: Der Internet-Link über Cloudflare ist von Haus aus an. Handy-Begleiter einschalten, QR-Code scannen, koppeln – fertig, im WLAN wie unterwegs. Abschalten geht weiter mit dem Schalter „Von überall – ohne App“

### Entfernt

- Tailscale ist komplett raus: keine Tailscale-Hinweise, kein Verbindungs-Check und keine Firewall-Freigabe mehr. Am Handy reicht der Browser

## 0.16.0

### Neu

- **Handy von überall – ohne App**: Im Handy-Begleiter gibt es jetzt den Schalter „Von überall – ohne App“. VibeDesk richtet einen sicheren HTTPS-Link über Cloudflare ein (ohne Konto, ohne Router-Einstellungen, ohne Firewall-Freigabe). Am Handy reicht der Browser, im WLAN genauso wie unterwegs im Mobilfunk. Gekoppelt wird wie immer mit dem Code vom PC-Bildschirm, ohne ihn kommt niemand hinein. Der Link bleibt, solange VibeDesk läuft. Nach einem Neustart einmal neu scannen und koppeln
- Beim ersten Einschalten installiert VibeDesk das kleine Cloudflare-Programm selbst. Fällt der Tunnel aus, baut VibeDesk ihn von allein neu auf

### Verbessert

- Tailscale ist nur noch eine Alternative für alle, die es schon nutzen. Die Handy-App wird nicht mehr gebraucht

## 0.15.1

### Behoben

- **Handy über Tailscale jetzt ganz ohne Firewall-Freigabe**: VibeDesk lässt Tailscale die Verbindungen selbst annehmen (`tailscale serve`) und weiterreichen. Der Tailscale-Dienst darf das in allen Netzen, darum braucht es keine Adminrechte und keine Windows-Abfrage mehr. Der QR-Code nutzt dafür den Tailscale-Namen deines PCs. Klappt das einmal nicht, bleibt „Firewall freigeben“ als Rückfallweg

## 0.15.0

### Neu

- **„Zeig drauf“ in der Vorschau**: Auf das Lupen-Symbol klicken, ein Element der Seite anklicken und kurz sagen, was anders werden soll – Claude bekommt Selektor, Text, HTML und einen Screenshot des Ausschnitts. Die Vorschau bleibt dabei vorn, damit du die Änderung live siehst
- **Konsolenfehler an Claude**: Fehler aus der Browser-Konsole der Vorschau sammeln sich als rotes Abzeichen – ein Klick auf „Claude soll das beheben“ schickt sie an die passende Session
- **Prompt-Warteschlange**: „＋ Danach“ in der Titelleiste des Terminals – Aufträge vormerken, die automatisch losgehen, sobald Claude fertig ist. Umsortieren und entfernen geht jederzeit
- **Wächter**: VibeDesk meldet sich, wenn eine Session lange ohne Lebenszeichen hängt, dreimal am selben Befehl scheitert oder der Kontext zu 85 % voll ist – mit passender Hilfe wie „Unterbrechen“, „Anders versuchen“ oder „/compact“. Auch auf dem Handy
- **Schnell-Prompt von überall**: Strg+Alt+Leertaste öffnet über jeder App ein Eingabefeld – Tab wählt die Session, Enter schickt ab. Arbeitet Claude noch, wird der Auftrag vorgemerkt. Abschaltbar im Mehr-Menü
- **Vibe Wrapped**: Dein Wochenrückblick mit aktiver Zeit, Prompts, geänderten Dateien, Lieblingswerkzeug, Top-Projekten und einer Persona – als Bild in die Zwischenablage kopieren und teilen. Im Stats-Fenster, in der Befehls-Palette und einmal pro Woche als Hinweis

### Behoben

- **Handy über Tailscale kam nicht an**: Windows führt das Tailscale-Netz als privates Netz, die Firewall-Freigabe galt aber nur für öffentliche Netze. Der neue Verbindungs-Check im Handy-Begleiter erkennt das und gibt die Firewall per Klick frei – nur für Tailscale und dein eigenes Netz. Er zeigt außerdem, ob dein Handy überhaupt im Tailnet angemeldet ist und mit welchem Konto

## 0.14.0

### Neu

- **Update-Fensterchen** wie bei Discord: Beim Start zeigt ein kleines Fenster, ob VibeDesk nach Updates sucht, eins herunterlädt (mit Fortschritt) oder gleich startet. Ohne Internet geht es nach ein paar Sekunden normal weiter
- Auch während der Installation bleibt das Fensterchen sichtbar, bis die neue Version da ist – kein „hat sich VibeDesk einfach geschlossen?“ mehr
- **Gehirn pflegt sich selbst**: Hat Claude in einer Runde Dateien geändert, aber nichts im Gehirn festgehalten, bittet VibeDesk es vor dem Abschluss kurz darum – ganz ohne Klick. Im Terminal steht dann „pflegt Gehirn …“, und eine kleine Karte zeigt, welche Notizen aktualisiert wurden
- **Handy-Begleiter von unterwegs**: Mit Tailscale (kostenlos) erreichst du VibeDesk auch außerhalb deines WLANs – über ein privates, verschlüsseltes Netz nur zwischen deinen Geräten. VibeDesk erkennt Tailscale automatisch und zeigt einen QR-Code, der zu Hause und unterwegs funktioniert. Fehlt Tailscale noch, installiert VibeDesk es auf Knopfdruck und öffnet die Anmeldung

### Entfernt

- Die Karte „Gehirn pflegen?“ – das passiert jetzt automatisch

## 0.13.0

### Neu

- **Handy-Begleiter**: VibeDesk aufs Handy holen – im selben WLAN QR-Code scannen und mit einem 6-stelligen Einmal-Code vom PC koppeln. Auf dem Handy siehst du alle Sessions, was Claude zuletzt geschrieben hat, den Plan-Fortschritt und deine Mitteilungen
- **Wie geht es weiter?** Ist Claude fertig, schlägt das Handy drei sinnvolle nächste Schritte vor – ein Tipp schickt sie los
- **Idee eintippen, Claude formuliert**: Schreib kurz, was du willst – Claude macht daraus einen klaren Prompt und schickt ihn direkt in die gewählte Session (oder startet eine neue). Läuft über dein Claude-Abo, ohne API-Key
- **Freigaben als Karte**: Will Claude einen Befehl ausführen oder eine Datei ändern, erscheint unten rechts eine Karte mit Erlauben · Immer · Ablehnen – und gleichzeitig auf dem Handy, das dabei vibriert. „Im Terminal“ führt zur gewohnten Frage
- Solange der Handy-Begleiter läuft, geht der PC nicht in den Standby. Vom Handy lässt er sich ausschalten (mit 60 Sekunden zum Abbrechen) oder schlafen legen
- Gekoppelte Handys siehst du im Fenster „Handy-Begleiter“ und kannst sie einzeln abmelden. Im Streamer-Modus ist der Kopplungs-Code verschwommen

### Behoben

- Prompts aus Makros (und vom Handy) landeten zwar in Claudes Eingabe, wurden aber nicht abgeschickt – jetzt geht Enter zuverlässig hinterher

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

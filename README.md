<div align="center">

<img src="resources/icon.png" width="112" alt="VibeDesk" />

# VibeDesk

**A calm place to work with Claude Code.**<br/>
Rain on the window, lofi in your ears, and every Claude Code session on one Windows desktop.

**English** · [Deutsch](README.de.md) · [Website](https://fxd-gif.github.io/vibedesk/)

[![Release](https://img.shields.io/github/v/release/fxd-gif/vibedesk?style=flat-square&color=9fb8ff&label=release)](https://github.com/fxd-gif/vibedesk/releases/latest)
[![License: MIT](https://img.shields.io/badge/license-MIT-4ade80?style=flat-square)](LICENSE)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0b0f17?style=flat-square&logo=windows&logoColor=white)

<a href="https://github.com/fxd-gif/vibedesk/releases/latest"><b>Download for Windows</b></a>

<br/><br/>

<!-- hero.gif: once .github/assets/hero.gif exists, change the src below to .github/assets/hero.gif -->
<img src=".github/assets/hero.jpg" alt="VibeDesk in Zen mode: one Claude Code session in front of a rainy window, the other sessions as small pills at the top" />

</div>

<br/>

## What is VibeDesk?

VibeDesk is a full-screen workspace for Windows built around [Claude Code](https://docs.claude.com/en/docs/claude-code). Instead of switching between terminals, a browser and a music app, you sit in front of a rainy window, and the things you need for building float in front of it as glass windows.

It runs the real Claude Code CLI in real terminals. VibeDesk adds the view around it: what each session is doing, what it is waiting for, and what it costs.

## Why VibeDesk

- **See every Claude Code session at a glance:** which one is working, which one waits for you, which one is done – and answer permission requests as cards, on your PC or your phone.
- **Let sessions work in parallel, then merge safely.** Merge Studio gives each session its own worktree, predicts conflicts and always sets a checkpoint first.
- **A calm place to sit.** Rain on the window, lofi or Spotify, a focus timer – and a desktop that stays quiet until you need more.

## Features

**Calm by default**
- The dock grows with your work: tools appear only when they have something to do (Git after Claude changed files, Merge Studio with two sessions, …)
- **Toolbox:** start "Simple" and switch modules like addons, phone companion, Discord or streamer mode on when you want them
- **Zen mode** (<kbd>Ctrl</kbd> + <kbd>.</kbd>): only Claude and the rain, other sessions as small pills at the top
- One card at a time, "done" messages are bundled, and the dock dims while you type

<details>
<summary><b>All features</b></summary>

**Two layouts**
- **Desktop:** free floating glass windows and a dock that grows with what you use
- **Studio:** a sidebar on the left, every window as a full page, and a status bar with project, branch, uncommitted changes and what Claude is doing. Switch in Settings or via the command palette

**Atmosphere**
- Rain running down the window (WebGL): city at night, forest, a Tokyo alley, or your own picture
- Lofi radio or **Spotify** (control your Spotify app: playlists, liked songs, queue), plus synthetic rain sound with separate volume controls
- Focus timer (Pomodoro); audio gets quieter during breaks
- Streamer mode: hides API keys, passwords, user names and e-mail addresses, locks `.env` files in the editor; a curtain (<kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd>) covers the whole screen

**Claude Code sessions**
- Several sessions in parallel, each with live status in the dock: working · waiting for you · done
- Permission cards with Allow · Always · Deny, or "In terminal" for the usual prompt
- Notifications as cards, Windows toasts while VibeDesk is in the background, and a history behind the bell. During focus rounds only important ones come through
- Prompt queue: line up follow-up prompts that start as soon as Claude is done
- Quick prompt from anywhere: <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> opens an input field over any app
- Watchdog: tells you when a session hangs without activity, fails at the same command three times, or the context is 85 % full, with a suggested next step
- Terminal with copy/paste like Windows Terminal, clickable links and file paths, search, zoom, attachments and a PowerShell next to Claude
- Resume earlier sessions with one click
- Hit your usage limit? VibeDesk reads the reset time and tells Claude to carry on once the limit is free again
- Rewind button: jump Claude's conversation and code back to an earlier step
- **Plan card:** plans from plan mode show up as a readable card – "Let's go", or "Change …" to send Claude your feedback
- **Plan limit at a glance** (Pro/Max): how much of the 5-hour and weekly limit is used, with a quiet heads-up at 75 % and 90 %
- **Dev server in one click:** "▶ Dev server" starts your `dev` script (npm, pnpm, yarn or bun) in a shell next to Claude
- **Claude can drive VibeDesk (MCP):** "sort my windows", "zen mode on", "tokyo scene with more rain" – Claude does it

**Merge Studio (beta) – parallel sessions**
- "Isolated session": Claude gets its own working folder (Git worktree) on its own branch, so parallel sessions never get in each other's way
- Session cards with branch, changed files, +/−, live status and a badge: ready · review · conflicts
- Conflict prediction with `git merge-tree` – against the target branch and between sessions, even for uncommitted changes – without touching anything
- Side-by-side file comparison: session · current target · other session
- Merge a whole branch, selected files or selected hunks (3-way apply). Uncommitted changes in the target are never overwritten; risky steps always ask first
- Automatic checkpoints before every merge (as Git refs under `refs/vibedesk/checkpoints`, not in your history) and one-click restore
- AI summary with risks and recommended next steps; run your tests inside the session folder before merging

**Inspector and stats**
- Live feed of every action, todo progress, a tree of subagents, and stats in one tabbed window
- Context usage, tokens, cache hit rate and estimated cost, per session and per day
- Vibe Wrapped: a weekly summary card (active time, prompts, changed files, top projects) you can copy as an image

**The brain (project memory)**
- Notes in `.vibedesk/brain` inside your project: plain Markdown with `[[links]]`, readable in Obsidian and versionable with Git
- **About you:** a personal brain that applies to all projects. Claude remembers how you work and what you like – the longer you use VibeDesk, the better Claude fits you. Stays on your PC only
- Each session starts with an overview of this knowledge and can search, read and extend it through its own tools
- A live graph of notes and files; nodes light up while Claude reads, edits or learns something

**Tools**
- Code editor for quick fixes: clicking a file in the live feed opens it at the line Claude changed
- Preview window: local dev servers are detected and opened automatically. "Point at it" lets you click an element and tell Claude what to change (selector, text, HTML and a screenshot are sent along). Console errors can be sent to Claude with one click
- Git window: diff, stage, commit (Claude can write the message), history, push/pull and publishing to GitHub, including GitHub login and installing Git/GitHub CLI
- Command palette (<kbd>Ctrl</kbd> + <kbd>K</kbd>) for all windows, projects and actions
- Prompt library and notes per project; install skills by drag & drop or GitHub link

**Phone companion**
- Open VibeDesk in your phone's browser: scan the QR code, pair with a 6-digit code from the PC screen
- See sessions, Claude's latest output, plan progress and notifications; answer permission requests (the phone vibrates)
- See what is happening: your last prompt and Claude's recent steps – and, if you allow it, the **whole terminal live** with colors and full history, plus a few keys (Esc, ↑, ↓, 1–3, Enter) for Claude's choice menus
- Type a rough idea and Claude turns it into a clear prompt; when Claude is done, the phone suggests three next steps
- Works in your Wi-Fi and, through a Cloudflare quick tunnel, from anywhere (can be switched off)

**Addons**
- Flowchart editor to build your own extensions without code, e.g. "when a session waits for me, switch to Tokyo and play a gong"
- Triggers, actions, conditions, loops, questions with buttons, signals, parallel branches, lists and calculations
- Macros that drive Claude: send prompts, wait until Claude is done, continue (rate-limited, with a clear warning on install)
- 10 templates to start from; share addons as `.vibeaddon` files and install them by double-click
- Addons only see their own building blocks: no file access, no shell commands, no internet. Before installing, VibeDesk shows in plain words what an addon does

**Social and streaming**
- Vibe Lounge: co-work with friends in a shared room, peer-to-peer without a VibeDesk server. See who is building, start focus rounds together, chat and react
- Share codes for prompts, skills and your atmosphere, always with a preview before applying
- Discord Rich Presence with your own texts, images and status icons, live status of what Claude is doing ("writing code", "running commands", current task with progress) and rotating lines; Discord webhook messages when a session waits for you and a daily summary
- OBS overlay (status, plan, live feed, focus timer) as a local browser source; Twitch chat suggestions via `!vibe …` that you approve

</details>

<table>
  <tr>
    <td><img src=".github/assets/focus.jpg" alt="Focus timer in front of the Tokyo scene" /></td>
    <td><img src=".github/assets/welcome.jpg" alt="Welcome tour" /></td>
  </tr>
</table>

## Install

1. Open the [latest release](https://github.com/fxd-gif/vibedesk/releases/latest) and download **`VibeDesk-Setup-<version>.exe`**.
2. Run it. A short welcome tour sets everything up.
3. From then on you can start VibeDesk with <kbd>Win</kbd> + <kbd>R</kbd> → `vibe`.

Updates are downloaded in the background from GitHub Releases and installed on the next start (or right away if no session is running).

### Windows SmartScreen warning

The installer is not code-signed, so Windows may show **"Windows protected your PC"**. Click **More info → Run anyway**.

This is common for small open-source projects: code-signing certificates cost money every year, and SmartScreen also warns about new apps that have not been downloaded often yet. It does not mean the file was flagged as malware.

If you want to make sure the file is the one published here, compare its SHA256 checksum with the one in the release notes:

```powershell
Get-FileHash .\VibeDesk-Setup-<version>.exe -Algorithm SHA256
```

The `Hash` value must match the checksum listed in the release notes exactly. You can also build VibeDesk yourself from source (see below).

### Requirements

- Windows 10 or 11 (64-bit)
- [Claude Code](https://docs.claude.com/en/docs/claude-code) with a Claude Pro/Max subscription or an Anthropic API key
- Node.js (used for the hook forwarder) and Claude Code itself: if they are missing, VibeDesk offers to install them on first start (Node.js via `winget`, Claude Code via the official installer script from claude.ai)

Costs shown in VibeDesk are **estimates** based on Anthropic's API prices. With a subscription you do not pay per token; the number is meant as orientation.

## Keyboard shortcuts

| | |
|---|---|
| <kbd>Win</kbd> + <kbd>R</kbd> → `vibe` | Start VibeDesk |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>Space</kbd> | Quick prompt from any app |
| <kbd>Ctrl</kbd> + <kbd>K</kbd> · <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> | Command palette (inside the terminal only the second one) |
| <kbd>Ctrl</kbd> + <kbd>.</kbd> | Zen mode: only the current session |
| Hold <kbd>Esc</kbd> · <kbd>F11</kbd> | Leave full screen |
| <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>H</kbd> | Curtain (hide the screen) |
| <kbd>Ctrl</kbd> + <kbd>S</kbd> | Save in the editor |
| Drag a window to the edge | Half screen width |

## Privacy

VibeDesk has **no telemetry, no analytics and no account**. There is no VibeDesk server.

**What stays local**
- Claude Code hook events go to a local server on `127.0.0.1` (random port, random token).
- VibeDesk reads Claude Code's transcripts in `~/.claude/projects` (or `CLAUDE_CONFIG_DIR`) to show feed, todos and stats.
- The error log stays on your PC: `%APPDATA%\vibedesk\logs\fehler.log`. "Report a bug" only opens a pre-filled GitHub issue in your browser (version, Windows version, Claude Code version and the end of the error log, with user names in paths masked). You see everything before you submit, and nothing is sent unless you do.

**What connects to the internet, and when**

| What | Where to | When |
|---|---|---|
| Lofi radio | the selected stream (laut.fm by default; also ilovemusic.de, zeno.fm) | while music is on (on by default) |
| Update check and download | GitHub Releases | on start |
| Claude Code itself, AI commit messages, Merge Studio review, prompt formulation on the phone | Anthropic, through your own Claude Code | when you use Claude |
| Spotify | accounts.spotify.com (login) and api.spotify.com (control playback), with your own Spotify app ID | only if you connect Spotify |
| Skill downloads | GitHub (codeload.github.com) | when you install a skill from a link |
| Git window | your Git remotes; GitHub login via the GitHub CLI (device code in the browser) | when you push, pull, log in or publish |
| Installing tools | winget / claude.ai installer | only when you click install |
| Discord Rich Presence | your local Discord app; discord.com for app info if you use your own app ID | only if enabled |
| Discord webhook | your Discord webhook URL | only if enabled |
| Twitch chat suggestions | Twitch chat (anonymous, read-only) | only if enabled |
| Phone companion | local network on port 17350; with "from anywhere" on (default once the companion is enabled) a Cloudflare quick tunnel (`*.trycloudflare.com`, cloudflared is installed via winget) | only while the companion is switched on |
| Vibe Lounge | public Nostr relays for signaling (encrypted with the room code), then WebRTC directly between participants, who can see each other's IP address | only while you are in a lounge |

**What VibeDesk changes on your PC**
- **In your projects:** with the brain turned on (default), VibeDesk creates a `.vibedesk/` folder with the brain notes. Add it to `.gitignore` if you do not want to commit it.
- **Merge Studio:** isolated sessions are Git worktrees in `.vibedesk/worktrees/` on branches named `vd/…`. VibeDesk adds that folder to the repository's local `.git/info/exclude` (your `.gitignore` stays untouched). Checkpoints are Git refs under `refs/vibedesk/checkpoints/`; delete them with `git for-each-ref --format="%(refname)" refs/vibedesk | % { git update-ref -d $_ }`.
- **Claude Code settings:** VibeDesk does **not** edit your `~/.claude/settings.json` or project settings. For sessions started in VibeDesk it writes a temporary settings file with its hooks (and, with the brain on, an MCP config for the brain tools) to `%TEMP%\vibedesk` and passes it via `--settings` / `--mcp-config`. Sessions you start outside VibeDesk are not affected.
- **Skills** you install go to `~/.claude/skills` (or the project's `.claude/skills`).
- **Run alias:** `vibe` for <kbd>Win</kbd> + <kbd>R</kbd> is a registry entry under `HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\vibe.exe`.

## Uninstall

Uninstall VibeDesk from **Settings → Apps**. The uninstaller removes the program, but these stay on your PC:

| What | Where |
|---|---|
| Settings, projects list, stats, addons, scenes, notes, error log | `%APPDATA%\vibedesk` |
| Temporary files (session settings, pasted screenshots) | `%TEMP%\vibedesk` |
| Brain notes | `.vibedesk\` in each project you opened |
| Run alias | `HKCU\Software\Microsoft\Windows\CurrentVersion\App Paths\vibe.exe` |
| Tools you let VibeDesk install | Node.js, Claude Code, Git, GitHub CLI, cloudflared (each uninstallable on its own) |

To remove everything, run in PowerShell after uninstalling:

```powershell
Remove-Item -Recurse -Force "$env:APPDATA\vibedesk", "$env:TEMP\vibedesk" -ErrorAction SilentlyContinue
Remove-Item "HKCU:\Software\Microsoft\Windows\CurrentVersion\App Paths\vibe.exe" -Recurse -ErrorAction SilentlyContinue
```

Delete the `.vibedesk` folders in your projects by hand if you do not want to keep the notes.

## Build from source

Requires Node.js and npm.

```bash
npm install
npm run dev      # development with hot reload
npm run dist     # build the installer into dist/
```

## FAQ

**Is this an official Anthropic product?**
No. VibeDesk is an independent open-source project. It uses the Claude Code CLI that you install and log in to yourself.

**Does it work on macOS or Linux?**
Not yet. VibeDesk is Windows-only for now.

**What does it cost?**
VibeDesk is free and open source (MIT). You only need your own Claude subscription or API key for Claude Code.

**Is the interface available in English?**
Yes. VibeDesk follows your Windows language (German or English). Switch it in the More menu under "Sprache · Language".

## Feedback and support

Questions, bug reports and ideas all go to [GitHub Issues](https://github.com/fxd-gif/vibedesk/issues). Inside the app, "Report a bug" opens a pre-filled issue for you. Security issues: please see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 fxd-gif

<div align="center">
<br/>
<sub>Built with Electron, React and WebGL.<br/>Not affiliated with Anthropic. Claude is a trademark of Anthropic.</sub>
</div>

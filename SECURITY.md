# Security Policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub: go to the [Security tab](https://github.com/fxd-gif/vibedesk/security) of this repository and click **"Report a vulnerability"** (private security advisory). Include the VibeDesk version, steps to reproduce and what an attacker could do.

VibeDesk is maintained by one person in their free time. You will get a reply as soon as possible, and fixes for confirmed issues ship in a regular release. Credit is given in the advisory unless you prefer otherwise.

## Supported versions

Only the [latest release](https://github.com/fxd-gif/vibedesk/releases/latest) receives security fixes. VibeDesk updates itself automatically.

## Scope

Especially interesting are:

- **Hook server**: the local HTTP server on `127.0.0.1` that receives Claude Code hook events and permission requests (token-protected)
- **Phone companion**: the HTTP server on the local network (port 17350), pairing with the 6-digit code, device tokens, and remote actions such as permission answers, prompts and power control
- **Cloudflare quick tunnel**: anything that makes the companion reachable from the internet without pairing
- **Addons** (`.vibeaddon`): escaping the sandbox (file access, commands, network) or bypassing the install warning and rate limits for addons that control Claude
- **Brain MCP server**, **OBS overlay server**, **share codes** and the **Vibe Lounge** (peer-to-peer messages)
- The Electron app itself: renderer sandbox, navigation, IPC

Out of scope: vulnerabilities in Claude Code, Electron, Discord, Cloudflare or other third-party software (please report those upstream), and attacks that require an attacker who already controls your Windows account.

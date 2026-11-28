# VibeDesk, plank by plank in Rust

VibeDesk is an Electron app. We are rebuilding it in Rust one piece at a time, like the Ship of Theseus. Every plank has to:

- do one job that users notice (faster, lighter, fewer things to install),
- ship in a normal release,
- keep the JavaScript version as a fallback until it has proven itself,
- pass the same tests as the JavaScript version it replaces.

| # | Plank | Replaces | Status |
|---|---|---|---|
| 1 | **`vibedesk-bridge`**: hook forwarder, statusline and MCP server for Claude Code in one binary | `resources/hook-forwarder.js`, `statusline.js`, `brain-mcp.js`, run with the system `node` | in VibeDesk 2.1 |
| 2 | Candidates: project brain index and search, usage statistics, git status and file watching | parts of `src/main` | open |

Want a part to go native next? Open an issue.

## Plank 1: the bridge to Claude Code

Claude Code runs a hook command on every event and waits for it. That includes `PreToolUse` and `PostToolUse` around every single tool call. VibeDesk pointed those hooks at small Node scripts, so every hook paid for a Node start. Each session also kept a Node process alive for its MCP server.

`vibedesk-bridge` does the same three jobs as one 590 KB binary:

```
vibedesk-bridge hook         # stdin: hook JSON → POST to VibeDesk → reply (if any) to Claude Code
vibedesk-bridge statusline   # report plan limits, then run the user's own statusline
vibedesk-bridge mcp          # MCP server (stdio, JSON-RPC) for the brain and desk tools
```

Measured on a Windows 11 laptop, 40 runs each, from spawn to exit (`node native/bench.mjs`):

| Measurement | Node + JS | Rust | Factor |
|---|---|---|---|
| Hook (PostToolUse, 2 KB) | 68 ms (p90 114) | 11 ms (p90 12) | 6.3× |
| Statusline (report limits) | 86 ms (p90 122) | 14 ms (p90 19) | 6.0× |
| MCP server until `initialize` | 70 ms (p90 93) | 9.3 ms (p90 13) | 7.5× |
| MCP server, memory | 54 MB | 5.1 MB | 10.5× |

VibeDesk no longer needs Node.js on the system for any of this.

### Rules

- **Never disturb Claude Code.** `hook` and `statusline` always exit with code 0: on missing environment, broken JSON, network errors and panics alike. Hard deadlines: 1.5 s for hooks, 4 s for the statusline, 595 s for permission requests (a human decides).
- **Same behaviour as the JavaScript version.** The test suites for the hook forwarder, statusline and MCP server run against both implementations.
- **One source for the MCP tools.** `resources/mcp-tools.json` is read by `brain-mcp.js` and compiled into the bridge.

### Windows details that cost time

- **Refused connections take 2 seconds.** Windows retries the SYN after a RST, so connecting to a dead port on `127.0.0.1` fails only after about two seconds. Node is fast because libuv sets `SIO_TCP_INITIAL_RTO` with `TCP_INITIAL_RTO_NO_SYN_RETRANSMISSIONS` on loopback sockets. The bridge does the same (`src/http.rs`). Without it, a hook would never reach a restarted VibeDesk in time.
- **Hook commands go through bash, cmd or PowerShell.** The binary path is written unquoted with forward slashes, which all three accept. A path with spaces stays on the JavaScript fallback.
- **A running .exe is locked.** Every session keeps an MCP server running. If it ran from the install folder, the next update would fail. VibeDesk copies the bridge to `%APPDATA%\vibedesk\bin` at startup and renames an old copy aside if it is still running.

## Build

```bash
npm run build:native   # cargo build --release, copies the binary to resources/bin
npm run test:native    # cargo test
node native/bench.mjs  # the measurements above, on your machine
```

`npm run dev` and `npm run build` build the native parts automatically. Without Rust installed you get a warning and VibeDesk uses the JavaScript versions.

Both Windows toolchains work. `x86_64-pc-windows-gnu` also works without Visual Studio, as long as no dependency needs `windows-sys` 0.61 or newer: its raw-dylib imports need `dlltool` plus an assembler, which only a full MinGW install provides. That is why the bridge uses `socket2` 0.5.

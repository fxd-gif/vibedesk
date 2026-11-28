# VibeDesk, plank by plank in Rust

VibeDesk is an Electron app. We are rebuilding it in Rust one piece at a time, like the Ship of Theseus. Every plank has to:

- do one job that users notice (faster, lighter, fewer things to install),
- ship in a normal release,
- keep the JavaScript version as a fallback until it has proven itself,
- pass the same tests as the JavaScript version it replaces.

| # | Plank | Replaces | Status |
|---|---|---|---|
| 1 | **`vibedesk-bridge`**: hook forwarder, statusline and MCP server for Claude Code in one binary | `resources/hook-forwarder.js`, `statusline.js`, `brain-mcp.js`, run with the system `node` | in VibeDesk 2.1 |
| 2 | **`vibedesk-layout`**: force layout of the brain graph, as WebAssembly in a Web Worker | `d3-force` on the window thread | in VibeDesk 2.1 |
| 3 | Candidates: project brain index and search, usage statistics, git status and file watching | parts of `src/main` | open |

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
- **Hook commands go through bash, cmd or PowerShell.** The binary path is written unquoted with forward slashes, which all three accept. A path with spaces stays on the JavaScript fallback (unless exec form applies, see below).
- **A running .exe is locked.** Every session keeps an MCP server running. If it ran from the install folder, the next update would fail. VibeDesk copies the bridge to `%APPDATA%\vibedesk\bin` at startup and renames an old copy aside if it is still running.
- **The shell costs more than the bridge.** See the next section.

### Hooks without a shell

In shell form, Claude Code on Windows runs every hook command through Git Bash, or through PowerShell when Git for Windows is not installed (the hook `shell` field picks one explicitly). Since Claude Code 2.1.139, a command hook may carry an `args` array instead ("exec form", [CHANGELOG](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md#21139), [hooks docs](https://code.claude.com/docs/en/hooks)): `command` is then spawned directly, with no shell, and must be a real `.exe` on Windows.

```json
{ "type": "command", "command": "C:\\Users\\me\\AppData\\Roaming\\vibedesk\\bin\\vibedesk-bridge.exe", "args": ["hook"], "timeout": 5 }
```

VibeDesk writes this form when it knows the Claude Code version is 2.1.139 or newer (`claude --version`, about 110 ms, cached and refreshed in the background so an auto-update is picked up by the next session). Unknown or older versions keep the shell form, because an older Claude Code would ignore `args` and run the bridge without a mode, which does nothing. Without the bridge, the Node fallback uses the same form (`"command": "node", "args": ["…\\hook-forwarder.js"]`). Exec form also takes paths with spaces, so the bridge runs hooks even where the shell form could not. The statusline has no exec form and stays in shell form.

Measured with the real bridge, 50 runs each, interleaved, spawn to exit, on a busy Windows 11 laptop (the bridge alone was 11 ms on a quiet machine, see above):

| How the hook is started | Median | p90 |
|---|---|---|
| Exec form (no shell) | 31 ms | 56 ms |
| `cmd /d /c` | 51 ms | 105 ms |
| Git Bash `bash -c` (the default) | 81 ms | 141 ms |
| PowerShell (no Git for Windows) | 324 ms | 444 ms |

That is about 50 ms saved on every hook with Git Bash and about 300 ms without it. A single tool call fires at least `PreToolUse` and `PostToolUse`, and Claude Code waits for each.

## Plank 2: the brain graph layout

The brain window shows what Claude knows about a project as a graph of notes and files. With a large brain (500 notes, 3,200 nodes, 12,000 edges) it dropped to 1 to 10 frames per second. We measured before changing anything. There were three causes, and Rust only fixes one of them:

| Cause | Fix |
|---|---|
| Canvas 2D strokes wider than one device pixel take a slow path on the GPU in Skia | WebGL: all edges in one draw call, nodes, glows and rings as quads with a shader (`graphGl.ts`). Without MSAA: it cost two thirds of the frame rate here |
| `d3-force` needed 32 ms per step at 3,200 nodes, on the window thread, for about 200 steps after every change | **`vibedesk-layout`**: the same forces in Rust (Barnes-Hut quadtree, grid-based collision, springs), compiled to WebAssembly and run in a Web Worker: 11 ms per step, and the window stays responsive while the layout settles |
| Reading 500 note files took 300 to 500 ms on the main process (Windows opens files slowly), on every brain tool call | Notes are cached in memory and a file watcher invalidates them; only changed files are read again |

Measured on a Windows 11 laptop in the real app (Playwright, frames per second):

| | Before | After |
|---|---|---|
| Hover, notes only | 6–13 | 60 |
| Show files (3,200 nodes) | 3–5 | 60 |
| Hover with files | 4–5 | 60 |
| Zoom with files | 1 | 60 |
| Claude reads 40 files | 2–4 | 59 |

The crate has no dependencies and no `wasm-bindgen`: it exports plain functions and pointers, and the worker reads positions directly from WebAssembly memory. `native/build.mjs` embeds the module as base64, because the renderer runs from `file://` and cannot fetch neighbouring files. If WebAssembly or the worker is unavailable, the same worker code runs `d3-force`. `tests/brainLayout.test.ts` runs the same checks against both engines.

## Build

```bash
npm run build:native   # cargo build --release, copies the binary to resources/bin, builds the layout for wasm32
npm run test:native    # cargo test
node native/bench.mjs  # the measurements above, on your machine
```

`npm run dev` and `npm run build` build the native parts automatically. Without Rust installed you get a warning and VibeDesk uses the JavaScript versions.

The layout needs the WebAssembly target once: `rustup target add wasm32-unknown-unknown`. It links with `rust-lld` and needs neither Visual Studio nor MinGW.

Both Windows toolchains work. `x86_64-pc-windows-gnu` also works without Visual Studio, as long as no dependency needs `windows-sys` 0.61 or newer: its raw-dylib imports need `dlltool` plus an assembler, which only a full MinGW install provides. That is why the bridge uses `socket2` 0.5.

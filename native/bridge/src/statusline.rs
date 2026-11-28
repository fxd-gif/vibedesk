//! `vibedesk-bridge statusline` – ersetzt resources/statusline.js.
//! Schickt nur die Abo-Limits (`rate_limits`) an VibeDesk – der Rest des JSON bleibt auf dem PC – und zeigt
//! danach die eigene Statuszeile des Nutzers (VIBEDESK_USER_STATUSLINE), falls er eine hat.

use crate::{endpoint, guard, http, truthy};
use serde_json::{Value, json};
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

const GUARD_MS: u64 = 4000;
const REPORT_MS: u64 = 800;
const USER_MS: u64 = 3000;

pub fn run() {
    guard::start(GUARD_MS);
    let mut raw = Vec::new();
    if std::io::stdin().read_to_end(&mut raw).is_err() {
        return;
    }
    let input = String::from_utf8_lossy(&raw).into_owned();
    let report = {
        let input = input.clone();
        std::thread::spawn(move || report(&input))
    };
    if let Some(out) = run_user(&input) {
        let mut stdout = std::io::stdout().lock();
        let _ = stdout.write_all(&out);
        let _ = stdout.flush();
    }
    let _ = report.join();
}

fn report(input: &str) {
    let Ok(v) = serde_json::from_str::<Value>(input) else { return };
    let Some(limits) = v.get("rate_limits").filter(|l| truthy(l)) else { return };
    let (Some(session), Some(ep)) = (endpoint::var("VIBEDESK_SESSION_ID"), endpoint::from_env()) else { return };
    let body = json!({ "sessionId": session, "payload": { "hook_event_name": "StatusLine", "rate_limits": limits } }).to_string();
    let _ = http::post(ep.port, "/event", &ep.token, body.as_bytes(), Duration::from_millis(REPORT_MS));
}

/// Eigene Statuszeile mit demselben JSON ausführen und ihre Ausgabe durchreichen (nach 3 s abgebrochen)
fn run_user(input: &str) -> Option<Vec<u8>> {
    let cmd = endpoint::var("VIBEDESK_USER_STATUSLINE")?;
    let mut child = shell(&cmd).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    // stdin in eigenem Faden: Eine Statuszeile, die nichts liest, darf uns nicht blockieren
    let mut stdin = child.stdin.take()?;
    let data = input.as_bytes().to_vec();
    std::thread::spawn(move || {
        let _ = stdin.write_all(&data);
    });
    let mut stdout = child.stdout.take()?;
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let _ = stdout.read_to_end(&mut out);
        let _ = tx.send(out);
    });
    let out = match rx.recv_timeout(Duration::from_millis(USER_MS)) {
        Ok(out) => out,
        Err(_) => {
            let _ = child.kill();
            // Hält ein Enkelprozess die Ausgabe offen, beendet uns der Wächter
            rx.recv().ok()?
        }
    };
    let _ = child.try_wait();
    (!out.is_empty()).then_some(out)
}

/// Wie `spawn(cmd, { shell: true, windowsHide: true })` in Node: `cmd.exe /d /s /c "<befehl>"` ohne Fenster
#[cfg(windows)]
fn shell(cmd: &str) -> Command {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut c = Command::new(endpoint::var("ComSpec").unwrap_or_else(|| "cmd.exe".into()));
    c.raw_arg(format!("/d /s /c \"{cmd}\"")).creation_flags(CREATE_NO_WINDOW);
    c
}

#[cfg(not(windows))]
fn shell(cmd: &str) -> Command {
    let mut c = Command::new("/bin/sh");
    c.arg("-c").arg(cmd);
    c
}

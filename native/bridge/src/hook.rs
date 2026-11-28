//! `vibedesk-bridge hook` – ersetzt resources/hook-forwarder.js.
//! Liest das Hook-JSON von stdin und schickt `{sessionId, payload}` an VibeDesk. Antwortet die App mit Text
//! (Überblick beim Session-Start, Freigabe-Entscheidung), geht er über stdout an Claude Code.

use crate::{endpoint, guard, http};
use std::io::{Read, Write};
use std::time::Duration;

/// Harte Obergrenze für alle normalen Events; der Hook-Timeout in den Settings ist 5 s
const GUARD_MS: u64 = 1500;
const REQUEST_MS: u64 = 1200;
/// Freigaben warten, bis jemand in VibeDesk (oder auf dem Handy) antwortet – knapp unter dem Hook-Timeout von 600 s
const PERMISSION_MS: u64 = 595_000;

pub fn run() {
    guard::start(GUARD_MS);
    let (Some(session), Some(first)) = (endpoint::var("VIBEDESK_SESSION_ID"), endpoint::from_env()) else { return };
    let mut raw = Vec::new();
    if std::io::stdin().read_to_end(&mut raw).is_err() {
        return;
    }
    let input = String::from_utf8_lossy(&raw);
    let Ok(payload) = serde_json::from_str::<serde_json::Value>(&input) else { return };
    let permission = payload.get("hook_event_name").and_then(|v| v.as_str()) == Some("PermissionRequest");
    if permission {
        guard::extend_from_now(PERMISSION_MS);
    }
    // Das Payload geht unverändert weiter – es ist geprüftes JSON und wird nicht neu geschrieben
    let body = format!("{{\"sessionId\":{},\"payload\":{}}}", serde_json::Value::from(session), input);
    let (path, timeout) = if permission { ("/permission", PERMISSION_MS - 1000) } else { ("/event", REQUEST_MS) };

    let mut ep = first.clone();
    let mut retry = true;
    loop {
        match http::post(ep.port, path, &ep.token, body.as_bytes(), Duration::from_millis(timeout)) {
            Ok(r) if r.status == 403 => {}
            Ok(r) => {
                if r.status == 200 && !r.body.is_empty() {
                    let mut out = std::io::stdout().lock();
                    let _ = out.write_all(&r.body);
                    let _ = out.flush();
                }
                return;
            }
            Err(http::Error::Timeout) => return,
            Err(http::Error::Failed) => {}
        }
        // Token falsch oder keine Verbindung: Nach einem Neustart von VibeDesk stehen Port und Token nur noch in der Endpunkt-Datei
        if !retry {
            return;
        }
        retry = false;
        match endpoint::fresh() {
            Some(f) if f != first => ep = f,
            _ => return,
        }
    }
}


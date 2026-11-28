//! vibedesk-bridge – die Brücke zwischen Claude Code und VibeDesk.
//!
//! Ein kleines Programm statt dreier Node-Skripte (Planke 1 der Rust-Umstellung, siehe native/README.md):
//! - `hook`        liest das Hook-JSON von stdin und schickt es an die App (ersetzt resources/hook-forwarder.js)
//! - `statusline`  meldet die Abo-Limits und zeigt die eigene Statuszeile des Nutzers (ersetzt resources/statusline.js)
//! - `mcp`         MCP-Server über stdio für Gehirn- und Desktop-Werkzeuge (ersetzt resources/brain-mcp.js)
//!
//! Oberste Regel: Claude Code nie stören. `hook` und `statusline` enden immer mit Exit-Code 0,
//! auch bei fehlender Umgebung, kaputtem JSON, Netzwerkfehlern oder einem Programmfehler.

mod endpoint;
mod guard;
mod hook;
mod http;
mod mcp;
mod statusline;

use std::process::exit;

fn main() {
    let mode = std::env::args().nth(1).unwrap_or_default();
    match mode.as_str() {
        "hook" => {
            quiet_panics(true);
            hook::run();
        }
        "statusline" => {
            quiet_panics(true);
            statusline::run();
        }
        "mcp" => {
            quiet_panics(false);
            mcp::run();
        }
        "--version" | "-V" | "version" => println!("vibedesk-bridge {}", env!("CARGO_PKG_VERSION")),
        // unbekannter Aufruf: kurz erklären, aber trotzdem Exit-Code 0
        _ => eprintln!("vibedesk-bridge {} – Aufruf: vibedesk-bridge <hook|statusline|mcp>", env!("CARGO_PKG_VERSION")),
    }
    exit(0)
}

/// Ein Programmfehler in `hook`/`statusline` endet still mit Exit-Code 0. Der MCP-Server fängt Fehler pro
/// Anfrage selbst ab (Antwort -32603) – dort wird nur die Meldung auf stderr unterdrückt.
fn quiet_panics(exit_zero: bool) {
    std::panic::set_hook(Box::new(move |_| {
        if exit_zero {
            exit(0)
        }
    }));
}

/// Wahrheitswert wie in JavaScript (`!!x`) – die JS-Fassung prüft an einigen Stellen so
pub fn truthy(v: &serde_json::Value) -> bool {
    use serde_json::Value;
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().is_some_and(|f| f != 0.0),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

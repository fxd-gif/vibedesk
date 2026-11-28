//! `vibedesk-bridge mcp` – ersetzt resources/brain-mcp.js.
//! MCP-Server über stdio (JSON-RPC, eine Nachricht je Zeile). Claude Code startet ihn pro Session; jede
//! Werkzeug-Anfrage geht an die laufende VibeDesk-App (nur 127.0.0.1, Token-geschützt). Werkzeug-Aufrufe
//! laufen parallel in eigenen Fäden, Antworten kommen in der Reihenfolge, in der sie fertig werden.

use crate::endpoint::{self, Endpoint};
use crate::{http, truthy};
use serde_json::{Map, Value, json};
use std::io::{BufRead, Write};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// Werkzeuge und Hinweise – dieselbe Datei liest resources/brain-mcp.js, so laufen beide nie auseinander
const SPEC: &str = include_str!("../../../resources/mcp-tools.json");
const UNREACHABLE: &str = "VibeDesk ist nicht erreichbar – läuft die App noch?";

struct Server {
    tools: Vec<Value>,
    instructions: String,
    protocol: String,
    session: Option<String>,
    endpoint: Mutex<Option<Endpoint>>,
    cwd: String,
    out: Mutex<std::io::Stdout>,
}

struct Reply {
    text: String,
    is_error: bool,
    image: Option<(String, String)>,
}

impl Reply {
    fn error(text: impl Into<String>) -> Self {
        Reply { text: text.into(), is_error: true, image: None }
    }
}

pub fn run() {
    let server = Arc::new(Server::new(endpoint::var("VIBEDESK_BRAIN").as_deref() != Some("0")));
    let mut input = std::io::stdin().lock();
    let mut line = Vec::new();
    loop {
        line.clear();
        match input.read_until(b'\n', &mut line) {
            Ok(0) | Err(_) => break,
            Ok(_) => {}
        }
        let text = String::from_utf8_lossy(&line);
        let text = text.trim_matches(|c: char| c.is_whitespace() || c == '\u{feff}');
        if text.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(text) {
            Ok(msg) => {
                let s = server.clone();
                if catch_unwind(AssertUnwindSafe(|| s.handle(msg))).is_err() {
                    server.send(json!({ "id": null, "error": { "code": -32603, "message": "Interner Fehler" } }));
                }
            }
            Err(_) => server.send(json!({ "id": null, "error": { "code": -32700, "message": "Parse error" } })),
        }
    }
    // stdin zu: Claude Code beendet die Session – laufende Aufrufe werden nicht mehr gebraucht
    std::process::exit(0)
}

/// Wie `${x}` in JavaScript: Text bleibt Text, fehlend wird „undefined“
fn js_text(v: Option<&Value>) -> String {
    match v {
        None => "undefined".into(),
        Some(Value::String(s)) => s.clone(),
        Some(other) => other.to_string(),
    }
}

impl Server {
    fn new(brain: bool) -> Self {
        let spec: Value = serde_json::from_str(SPEC).unwrap_or(Value::Null);
        let list = |k: &str| spec.get(k).and_then(Value::as_array).cloned().unwrap_or_default();
        let text = |k: &str| spec.get(k).and_then(Value::as_str).unwrap_or("").to_owned();
        // Gehirn aus: nur die Desktop-Werkzeuge
        let mut tools = if brain { list("brainTools") } else { Vec::new() };
        tools.extend(list("deskTools"));
        let instructions = if brain { text("brainInstructions") } else { String::new() } + &text("deskInstructions");
        let endpoint = match (endpoint::var("VIBEDESK_PORT"), endpoint::var("VIBEDESK_TOKEN")) {
            (Some(_), Some(_)) => endpoint::from_env(),
            _ => endpoint::fresh(),
        };
        Server {
            tools,
            instructions,
            protocol: text("protocol"),
            session: endpoint::var("VIBEDESK_SESSION_ID"),
            endpoint: Mutex::new(endpoint),
            cwd: std::env::current_dir().map(|d| d.to_string_lossy().into_owned()).unwrap_or_default(),
            out: Mutex::new(std::io::stdout()),
        }
    }

    /// Eine Zeile JSON-RPC, `jsonrpc` vorn wie bei `JSON.stringify({ jsonrpc: '2.0', ...msg })`
    fn send(&self, msg: Value) {
        let mut obj = Map::new();
        obj.insert("jsonrpc".into(), "2.0".into());
        if let Value::Object(m) = msg {
            obj.extend(m);
        }
        let mut line = serde_json::to_vec(&Value::Object(obj)).unwrap_or_default();
        line.push(b'\n');
        let mut out = self.out.lock().unwrap_or_else(|e| e.into_inner());
        let _ = out.write_all(&line);
        let _ = out.flush();
    }

    fn handle(self: Arc<Self>, msg: Value) {
        // Benachrichtigungen brauchen keine Antwort
        let Some(id) = msg.get("id").filter(|id| !id.is_null()).cloned() else { return };
        let params = msg.get("params");
        match msg.get("method").and_then(Value::as_str) {
            Some("initialize") => {
                let protocol = params.and_then(|p| p.get("protocolVersion")).and_then(Value::as_str).unwrap_or(&self.protocol);
                self.send(json!({ "id": id, "result": {
                    "protocolVersion": protocol,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "vibedesk-brain", "version": "1.0.0" },
                    "instructions": self.instructions
                } }));
            }
            Some("ping") => self.send(json!({ "id": id, "result": {} })),
            Some("tools/list") => self.send(json!({ "id": id, "result": { "tools": self.tools } })),
            Some("tools/call") => {
                let name = params.and_then(|p| p.get("name"));
                let known = name.and_then(Value::as_str).filter(|n| self.tools.iter().any(|t| t.get("name").and_then(Value::as_str) == Some(*n)));
                let Some(tool) = known.map(str::to_owned) else {
                    return self.send(json!({ "id": id, "error": { "code": -32602, "message": format!("Unbekanntes Werkzeug: {}", js_text(name)) } }));
                };
                let args = params.and_then(|p| p.get("arguments")).cloned().unwrap_or(Value::Null);
                std::thread::spawn(move || {
                    let reply = catch_unwind(AssertUnwindSafe(|| self.call_app(&tool, args)));
                    match reply {
                        Ok(r) => {
                            let mut content = vec![json!({ "type": "text", "text": r.text })];
                            if let Some((data, mime)) = r.image {
                                content.push(json!({ "type": "image", "data": data, "mimeType": mime }));
                            }
                            self.send(json!({ "id": id, "result": { "content": content, "isError": r.is_error } }));
                        }
                        Err(_) => self.send(json!({ "id": id, "error": { "code": -32603, "message": "Interner Fehler" } })),
                    }
                });
            }
            _ => {
                let method = js_text(msg.get("method"));
                self.send(json!({ "id": id, "error": { "code": -32601, "message": format!("Methode nicht unterstützt: {method}") } }));
            }
        }
    }

    fn call_app(&self, tool: &str, args: Value) -> Reply {
        let Some(session) = &self.session else { return Reply::error("VibeDesk ist nicht erreichbar.") };
        let args = if truthy(&args) { args } else { json!({}) };
        // mit dem Endpunkt vergleichen, den dieser Aufruf benutzt hat – parallele Aufrufe können ihn inzwischen erneuert haben
        let used = self.endpoint.lock().unwrap_or_else(|e| e.into_inner()).clone();
        if let Some(r) = used.as_ref().and_then(|ep| self.post(ep, session, tool, &args)) {
            return r;
        }
        let Some(fresh) = endpoint::fresh().filter(|f| used.as_ref() != Some(f)) else { return Reply::error(UNREACHABLE) };
        *self.endpoint.lock().unwrap_or_else(|e| e.into_inner()) = Some(fresh.clone());
        self.post(&fresh, session, tool, &args).unwrap_or_else(|| Reply::error(UNREACHABLE))
    }

    /// None = keine Verbindung, Zeitgrenze oder Token falsch – dann lohnt ein zweiter Versuch mit frischem Endpunkt
    fn post(&self, ep: &Endpoint, session: &str, tool: &str, args: &Value) -> Option<Reply> {
        // cwd: Kennt eine neu gestartete App die Session nicht, findet sie das Projekt über den Ordner
        let body = json!({ "sessionId": session, "tool": tool, "args": args, "cwd": self.cwd }).to_string();
        // Szenen und Werkzeug-Fenster warten auf die Rückmeldung bzw. ein paar Sekunden für den Schnappschuss
        let ms = if tool.starts_with("desk_scene_") || tool.starts_with("desk_app_") { 60_000 } else { 10_000 };
        let r = http::post(ep.port, "/brain", &ep.token, body.as_bytes(), Duration::from_millis(ms)).ok()?;
        if r.status == 403 {
            return None;
        }
        let unexpected = || Reply::error(format!("VibeDesk antwortete unerwartet (HTTP {}).", r.status));
        let Ok(Value::Object(v)) = serde_json::from_slice::<Value>(&r.body) else { return Some(unexpected()) };
        let text = match v.get("text") {
            None | Some(Value::Null) => String::new(),
            Some(Value::String(s)) => s.clone(),
            Some(other) => other.to_string(),
        };
        let image = v.get("image").and_then(|i| Some((i.get("data")?.as_str()?.to_owned(), i.get("mimeType")?.as_str()?.to_owned())));
        Some(Reply { text, is_error: v.get("isError").is_some_and(truthy), image })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn werkzeugliste_ist_gueltig() {
        let s = Server::new(true);
        assert!(s.tools.len() > 20, "zu wenige Werkzeuge: {}", s.tools.len());
        assert_eq!(s.tools[0]["name"], "brain_overview");
        assert!(s.tools.iter().all(|t| t["name"].is_string() && t["inputSchema"]["type"] == "object"));
        assert!(s.instructions.starts_with("Projektgedächtnis"));
        assert_eq!(s.protocol, "2025-06-18");
    }

    #[test]
    fn gehirn_aus_nur_desktop() {
        let s = Server::new(false);
        assert!(s.tools.iter().all(|t| t["name"].as_str().unwrap().starts_with("desk_")));
        assert!(s.instructions.starts_with("Den VibeDesk-Desktop"));
    }
}

//! Wo die laufende VibeDesk-App zu erreichen ist: Port und Token aus der Umgebung der Session,
//! nach einem Neustart der App (z. B. Update) aus der Endpunkt-Datei, die VibeDesk beim Start schreibt.

use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Endpoint {
    pub port: u16,
    pub token: String,
}

/// Umgebungsvariable; leer zählt wie nicht gesetzt (wie `process.env.X || …` in der JS-Fassung)
pub fn var(name: &str) -> Option<String> {
    std::env::var(name).ok().filter(|v| !v.is_empty())
}

/// Port und Token aus VIBEDESK_PORT / VIBEDESK_TOKEN. Ein ungültiger Port wird 0 und schlägt beim
/// Verbinden fehl – danach greift wie bei jeder fehlgeschlagenen Verbindung die Endpunkt-Datei.
pub fn from_env() -> Option<Endpoint> {
    Some(Endpoint { port: var("VIBEDESK_PORT")?.trim().parse().unwrap_or(0), token: var("VIBEDESK_TOKEN")? })
}

/// Sessions von vor v0.17.2 kennen VIBEDESK_ENDPOINT noch nicht – dann der Standardort in %APPDATA%
fn file() -> Option<PathBuf> {
    var("VIBEDESK_ENDPOINT")
        .map(PathBuf::from)
        .or_else(|| var("APPDATA").map(|a| PathBuf::from(a).join("vibedesk").join("endpoint.json")))
}

/// Aktueller Port + Token aus der Endpunkt-Datei
pub fn fresh() -> Option<Endpoint> {
    parse(&std::fs::read_to_string(file()?).ok()?)
}

fn parse(raw: &str) -> Option<Endpoint> {
    let v: serde_json::Value = serde_json::from_str(raw.trim_start_matches('\u{feff}')).ok()?;
    let port = u16::try_from(v.get("port")?.as_u64()?).ok()?;
    let token = v.get("token")?.as_str()?.to_owned();
    Some(Endpoint { port, token })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn liest_port_und_token() {
        assert_eq!(parse(r#"{"port":51234,"token":"abc"}"#), Some(Endpoint { port: 51234, token: "abc".into() }));
        assert_eq!(parse("\u{feff}{\"port\":1,\"token\":\"t\"}").map(|e| e.port), Some(1));
    }

    #[test]
    fn lehnt_kaputte_dateien_ab() {
        assert_eq!(parse(""), None);
        assert_eq!(parse(r#"{"port":"51234","token":"abc"}"#), None);
        assert_eq!(parse(r#"{"port":70000,"token":"abc"}"#), None);
        assert_eq!(parse(r#"{"port":1.5,"token":"abc"}"#), None);
        assert_eq!(parse(r#"{"port":1}"#), None);
    }
}

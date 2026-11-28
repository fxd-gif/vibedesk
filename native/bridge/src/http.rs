//! Kleinster HTTP/1.1-Client für 127.0.0.1 – genau genug für den Hook-Server von VibeDesk, ohne Abhängigkeiten.
//! Eine Anfrage pro Verbindung (`Connection: close`), Antwort mit Content-Length, chunked oder bis zum Ende.

use std::io::{ErrorKind, Read, Write};
use std::net::{Ipv4Addr, SocketAddr, TcpStream};
use std::time::Duration;

#[derive(Debug)]
pub struct Response {
    pub status: u16,
    pub body: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Error {
    /// keine Verbindung (App läuft nicht, Port falsch) oder abgebrochen – ein zweiter Versuch mit frischem Endpunkt lohnt
    Failed,
    /// keine Antwort innerhalb der Zeitgrenze
    Timeout,
}

/// POST mit JSON-Body und Token-Header an 127.0.0.1:`port`. `timeout` gilt fürs Verbinden und für jede Wartezeit
/// auf Daten – wie das `timeout` von Node beim Socket.
pub fn post(port: u16, path: &str, token: &str, body: &[u8], timeout: Duration) -> Result<Response, Error> {
    // Token und Pfad landen in Kopfzeilen – Zeilenumbrüche darin wären eine eingeschleuste Kopfzeile
    if port == 0 || token.contains(['\r', '\n']) || path.contains(['\r', '\n', ' ']) {
        return Err(Error::Failed);
    }
    let mut s = connect(SocketAddr::from((Ipv4Addr::LOCALHOST, port)), timeout).map_err(io)?;
    let _ = s.set_read_timeout(Some(timeout));
    let _ = s.set_write_timeout(Some(timeout));
    let _ = s.set_nodelay(true);
    let mut req = format!(
        "POST {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nX-Vibedesk-Token: {token}\r\nConnection: close\r\n\r\n",
        body.len()
    )
    .into_bytes();
    req.extend_from_slice(body);
    s.write_all(&req).map_err(io)?;
    read_response(&mut s)
}

/// Verbinden mit Zeitgrenze. Unter Windows wie bei Node (libuv): Lauscht am Port niemand, scheitert der Versuch
/// sofort statt nach ~2 s SYN-Wiederholungen. Sonst liefe ein Hook nach einem Neustart der App in die Zeitgrenze,
/// bevor er die neue App über die Endpunkt-Datei findet.
fn connect(addr: SocketAddr, timeout: Duration) -> std::io::Result<TcpStream> {
    let s = socket2::Socket::new(socket2::Domain::IPV4, socket2::Type::STREAM, Some(socket2::Protocol::TCP))?;
    #[cfg(windows)]
    {
        // Ohne SYN-Wiederholungen ist ein Loopback-Connect sofort entschieden – blockierend ist er hier am schnellsten
        // (connect_timeout wartet per poll noch ~100 ms auf die Absage). Hängen kann er nicht: Wiederholungen gibt es keine.
        if fast_loopback_fail(&s) {
            s.connect(&addr.into())?;
            return Ok(s.into());
        }
    }
    s.connect_timeout(&addr.into(), timeout)?;
    Ok(s.into())
}

/// `SIO_TCP_INITIAL_RTO` mit `TCP_INITIAL_RTO_NO_SYN_RETRANSMISSIONS`, genau wie libuv es für Loopback setzt
#[cfg(windows)]
fn fast_loopback_fail(s: &socket2::Socket) -> bool {
    use std::ffi::c_void;
    use std::os::windows::io::AsRawSocket;
    /// TCP_INITIAL_RTO_PARAMETERS aus mstcpip.h
    #[repr(C)]
    struct InitialRto {
        rtt: u16,
        max_syn_retransmissions: u8,
    }
    const SIO_TCP_INITIAL_RTO: u32 = 0x9800_0011;
    const NO_SYN_RETRANSMISSIONS: u8 = 0xFE;
    #[link(name = "ws2_32")]
    unsafe extern "system" {
        fn WSAIoctl(
            s: usize,
            code: u32,
            input: *const c_void,
            input_len: u32,
            output: *mut c_void,
            output_len: u32,
            returned: *mut u32,
            overlapped: *mut c_void,
            completion: *mut c_void,
        ) -> i32;
    }
    let p = InitialRto { rtt: NO_SYN_RETRANSMISSIONS as u16, max_syn_retransmissions: NO_SYN_RETRANSMISSIONS };
    let mut returned = 0u32;
    // Kennt ein älteres Windows das nicht (vor 10.0.16299), bleibt es beim Connect mit Zeitgrenze
    unsafe {
        0 == WSAIoctl(
            s.as_raw_socket() as usize,
            SIO_TCP_INITIAL_RTO,
            (&p as *const InitialRto).cast(),
            std::mem::size_of::<InitialRto>() as u32,
            std::ptr::null_mut(),
            0,
            &mut returned,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    }
}

fn io(e: std::io::Error) -> Error {
    match e.kind() {
        ErrorKind::TimedOut | ErrorKind::WouldBlock => Error::Timeout,
        _ => Error::Failed,
    }
}

fn read_response(s: &mut impl Read) -> Result<Response, Error> {
    let mut buf = Vec::with_capacity(4096);
    let mut chunk = [0u8; 16 * 1024];
    loop {
        match s.read(&mut chunk) {
            Ok(0) => break,
            Ok(n) => {
                buf.extend_from_slice(&chunk[..n]);
                if let Some(r) = parse(&buf, false) {
                    return Ok(r);
                }
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => {}
            Err(e) => {
                let err = io(e);
                if err == Error::Timeout {
                    return Err(err);
                }
                // abgebrochen (z. B. Reset nach der letzten Zeile): zählt, was schon vollständig da ist
                break;
            }
        }
    }
    parse(&buf, true).ok_or(Error::Failed)
}

/// Vollständige Antwort aus `buf`, sonst None. `eof`: Die Gegenseite hat die Verbindung geschlossen.
fn parse(buf: &[u8], eof: bool) -> Option<Response> {
    let head_end = find(buf, b"\r\n\r\n")?;
    let head = std::str::from_utf8(&buf[..head_end]).ok()?;
    let mut lines = head.split("\r\n");
    let status: u16 = lines.next()?.split_whitespace().nth(1)?.parse().ok()?;
    let mut length = None;
    let mut chunked = false;
    for line in lines {
        let Some((k, v)) = line.split_once(':') else { continue };
        let (k, v) = (k.trim(), v.trim());
        if k.eq_ignore_ascii_case("content-length") {
            length = Some(v.parse::<usize>().ok()?);
        } else if k.eq_ignore_ascii_case("transfer-encoding") && v.to_ascii_lowercase().contains("chunked") {
            chunked = true;
        }
    }
    let rest = &buf[head_end + 4..];
    let body = if chunked {
        dechunk(rest)?
    } else if let Some(n) = length {
        if rest.len() < n {
            return None;
        }
        rest[..n].to_vec()
    } else if eof {
        rest.to_vec()
    } else {
        return None;
    };
    Some(Response { status, body })
}

/// Body aus `Transfer-Encoding: chunked`; None, solange der letzte (leere) Block fehlt
fn dechunk(mut b: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    loop {
        let line_end = find(b, b"\r\n")?;
        let size_line = std::str::from_utf8(&b[..line_end]).ok()?;
        let size = usize::from_str_radix(size_line.split(';').next()?.trim(), 16).ok()?;
        b = &b[line_end + 2..];
        if size == 0 {
            return Some(out);
        }
        if b.len() < size + 2 {
            return None;
        }
        out.extend_from_slice(&b[..size]);
        b = &b[size + 2..];
    }
}

fn find(hay: &[u8], needle: &[u8]) -> Option<usize> {
    hay.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn content_length() {
        let r = parse(b"HTTP/1.1 200 OK\r\ncontent-length: 5\r\n\r\nhello", false).unwrap();
        assert_eq!((r.status, r.body.as_slice()), (200, &b"hello"[..]));
        assert!(parse(b"HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nhel", false).is_none());
    }

    #[test]
    fn chunked_wie_node() {
        let raw = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n4\r\n{\"a\"\r\n3\r\n:1}\r\n0\r\n\r\n";
        assert_eq!(parse(raw, false).unwrap().body, b"{\"a\":1}");
        assert!(parse(&raw[..raw.len() - 5], false).is_none());
    }

    #[test]
    fn ohne_laenge_bis_zum_ende() {
        assert!(parse(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n", false).is_none());
        let r = parse(b"HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n", true).unwrap();
        assert_eq!((r.status, r.body.len()), (403, 0));
    }

    #[test]
    fn keine_eingeschleusten_kopfzeilen() {
        assert_eq!(post(1, "/event", "a\r\nX-Evil: 1", b"{}", Duration::from_millis(50)).unwrap_err(), Error::Failed);
    }
}

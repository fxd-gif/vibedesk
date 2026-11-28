//! Harte Zeitgrenze: Läuft die Brücke zu lange, beendet sie sich still mit Exit-Code 0.
//! So hängt kein Hook Claude Code auf, egal was mit der App oder dem Netzwerk passiert.

use std::sync::OnceLock;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Duration, Instant};

static START: OnceLock<Instant> = OnceLock::new();
static DEADLINE_MS: AtomicU64 = AtomicU64::new(u64::MAX);

/// Startet den Wächter: `ms` Millisekunden nach dem Start endet der Prozess mit Exit-Code 0
pub fn start(ms: u64) {
    START.get_or_init(Instant::now);
    DEADLINE_MS.store(ms, Ordering::SeqCst);
    std::thread::spawn(|| {
        loop {
            let now = elapsed_ms();
            let deadline = DEADLINE_MS.load(Ordering::SeqCst);
            if now >= deadline {
                std::process::exit(0)
            }
            // Die Grenze wandert nur nach hinten – bis dahin schlafen und dann neu prüfen
            std::thread::sleep(Duration::from_millis(deadline - now));
        }
    });
}

/// Neue Grenze `ms` ab jetzt, z. B. für Freigaben, auf die ein Mensch antwortet
pub fn extend_from_now(ms: u64) {
    DEADLINE_MS.store(elapsed_ms().saturating_add(ms), Ordering::SeqCst);
}

fn elapsed_ms() -> u64 {
    START.get().map_or(0, |s| s.elapsed().as_millis() as u64)
}

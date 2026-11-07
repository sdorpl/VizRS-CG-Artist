//! PROTOTYP: klient HTTPS poza Linuksem – do decyzji (PLAN-platformy §7 pkt 2: `ureq` + `rustls` albo natywnie).
//! Ten sam interfejs co `src/client.rs`; wysyłka na serwer zwraca czytelny błąd.

use std::time::Duration;

#[derive(Debug)]
pub struct Reply {
    pub status: u16,
    pub body: Vec<u8>,
}

impl Reply {
    pub fn json(&self) -> Result<serde_json::Value, String> {
        serde_json::from_slice(&self.body).map_err(|e| e.to_string())
    }
    pub fn error(&self) -> String {
        format!("odpowiedź HTTP {}", self.status)
    }
}

pub fn request(
    _url: &str,
    _method: &str,
    _path: &str,
    _token: Option<&str>,
    _body: Option<(&str, &[u8])>,
    _max: usize,
    _timeout: Duration,
) -> Result<Reply, String> {
    Err("prototyp Tauri: wysyłka na serwer na tym systemie – po wyborze klienta HTTPS".into())
}

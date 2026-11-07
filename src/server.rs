//! Serwer `vizrs` z punktu widzenia okna: kto trzyma katalog danych (blokada `.vizrs.lock` w formacie
//! serwera, `src/datalock.rs` w CG System) i proste `GET` do sprawdzenia serwera przed połączeniem.
//! Artist nie uruchamia `vizrs` – pracuje na własnym magazynie (`local`), a do działającego serwera dołącza.

use std::io::{Read, Write};
use std::net::{TcpStream, ToSocketAddrs};
use std::path::Path;
use std::time::Duration;

use serde_json::Value;

/// Plik blokady katalogu danych (ten sam dla `vizrs` i magazynu Artist).
pub const LOCK_FILE: &str = ".vizrs.lock";

/// `GET` na `addr` (`host:port`), odpowiedź do 1 MB. Zwraca (kod, treść).
pub fn http_get(
    addr: &str,
    path: &str,
    token: Option<&str>,
    timeout: Duration,
) -> Result<(u16, String), String> {
    let sa = addr
        .to_socket_addrs()
        .map_err(|e| format!("{addr}: {e}"))?
        .next()
        .ok_or(format!("{addr}: brak adresu"))?;
    let mut s = TcpStream::connect_timeout(&sa, timeout).map_err(|e| format!("{addr}: {e}"))?;
    s.set_read_timeout(Some(timeout)).ok();
    let auth = token
        .map(|t| format!("Authorization: Bearer {t}\r\n"))
        .unwrap_or_default();
    write!(
        s,
        "GET {path} HTTP/1.1\r\nHost: {addr}\r\n{auth}Connection: close\r\n\r\n"
    )
    .map_err(|e| e.to_string())?;
    let mut buf = Vec::new();
    s.take(1024 * 1024)
        .read_to_end(&mut buf)
        .map_err(|e| e.to_string())?;
    let text = String::from_utf8_lossy(&buf);
    let (head, body) = text
        .split_once("\r\n\r\n")
        .ok_or("niepełna odpowiedź HTTP")?;
    let code = head
        .split_whitespace()
        .nth(1)
        .and_then(|c| c.parse().ok())
        .ok_or("to nie jest odpowiedź HTTP")?;
    Ok((code, body.to_string()))
}

fn read_lock(data: &Path) -> Option<Value> {
    let text = std::fs::read_to_string(data.join(LOCK_FILE)).ok()?;
    serde_json::from_str::<Value>(&text)
        .ok()
        .filter(|v| v["instance"].is_string())
}

/// Czy proces na pewno nie istnieje (Linux: `/proc/<pid>`).
fn pid_dead(pid: u64) -> bool {
    pid != 0 && cfg!(target_os = "linux") && !Path::new(&format!("/proc/{pid}")).exists()
}

/// Właściciel blokady żyje: proces istnieje, a `/health` pod zapisanym adresem zwraca ten sam `instance`
/// (401/403 – odpowiada, ale z innym tokenem: jak w serwerze uznajemy za żywy, żeby nie było dwóch zapisujących).
fn alive(lock: &Value, token: Option<&str>) -> Result<bool, String> {
    if pid_dead(lock["pid"].as_u64().unwrap_or(0)) {
        return Ok(false);
    }
    let (Some(addr), Some(inst)) = (lock["addr"].as_str(), lock["instance"].as_str()) else {
        return Ok(false);
    };
    match http_get(addr, "/health", token, Duration::from_millis(1500)) {
        Ok((200, body)) => Ok(serde_json::from_str::<Value>(&body)
            .map(|h| h["instance"].as_str() == Some(inst))
            .unwrap_or(false)),
        Ok((401 | 403, _)) => Err(format!(
            "serwer VizRS na {addr} wymaga tokenu – podaj --token albo ustaw VIZRS_TOKEN"
        )),
        _ => Ok(false),
    }
}

/// Opis żywego właściciela katalogu danych (dowolnego: `vizrs` albo inne okno Artist).
pub fn lock_owner(data: &Path) -> Option<String> {
    let lock = read_lock(data)?;
    if !alive(&lock, None).unwrap_or(true) {
        return None;
    }
    let who = match lock["app"].as_str() {
        Some(crate::local::APP_NAME) => "VizRS CG Artist",
        _ => "serwer vizrs",
    };
    Some(format!(
        "{who}, pid {}, {}",
        lock["pid"].as_u64().unwrap_or(0),
        lock["addr"].as_str().unwrap_or("?")
    ))
}

/// Adres działającego serwera `vizrs`, który trzyma katalog danych – okno dołącza do niego zamiast
/// otwierać magazyn lokalny (jeden zapisujący na `show.json`). Katalog otwarty w innym oknie Artist = błąd.
pub fn running_server(data: &Path, token: Option<&str>) -> Result<Option<String>, String> {
    let Some(lock) = read_lock(data) else {
        return Ok(None);
    };
    if !alive(&lock, token)? {
        return Ok(None);
    }
    if lock["app"].as_str() == Some(crate::local::APP_NAME) {
        return Err(format!(
            "Katalog danych {} jest otwarty w innym oknie VizRS CG Artist.",
            data.display()
        ));
    }
    Ok(lock["addr"].as_str().map(String::from))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn no_lock_means_no_server() {
        let d = std::env::temp_dir().join(format!("vizrs-cg-artist-{}", std::process::id()));
        std::fs::create_dir_all(&d).unwrap();
        assert_eq!(running_server(&d, None).unwrap(), None);
        std::fs::write(
            d.join(LOCK_FILE),
            r#"{"pid":1,"addr":"127.0.0.1:1","instance":"x"}"#,
        )
        .unwrap();
        assert_eq!(running_server(&d, None).unwrap(), None, "martwa blokada");
        std::fs::write(d.join(LOCK_FILE), "śmieci").unwrap();
        assert_eq!(running_server(&d, None).unwrap(), None);
        std::fs::remove_dir_all(d).ok();
    }
}

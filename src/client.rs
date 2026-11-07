//! Klient HTTP/1.1 do serwera `vizrs` (lokalnego albo na VPS): `http://` i `https://` przez `gio::SocketClient`
//! (TLS z glib-networking, ten sam co w WebKitGTK – bez nowych zależności). Token idzie w `Authorization: Bearer`
//! i nie trafia do strony. Odpowiedź z limitem rozmiaru; obsługa `Content-Length` i `Transfer-Encoding: chunked`
//! (serwer za reverse proxy).

use std::io::{Read, Write};
use std::time::Duration;

use gtk::gio;
use gtk::prelude::*;

/// Adres serwera rozłożony na części: `https://cg.example.pl:8443/vizrs` → tls, `cg.example.pl:8443`, `/vizrs`.
#[derive(Debug, Clone, PartialEq)]
pub struct Target {
    pub tls: bool,
    pub authority: String,
    pub prefix: String,
}

pub fn target(url: &str) -> Result<Target, String> {
    let (tls, rest) = if let Some(r) = url.strip_prefix("https://") {
        (true, r)
    } else if let Some(r) = url.strip_prefix("http://") {
        (false, r)
    } else {
        return Err(format!(
            "adres musi zaczynać się od http:// albo https:// („{url}”)"
        ));
    };
    let (authority, prefix) = match rest.find('/') {
        Some(i) => (&rest[..i], rest[i..].trim_end_matches('/')),
        None => (rest, ""),
    };
    let bad = |c: char| c.is_control() || c.is_whitespace() || "@/?#".contains(c);
    if authority.is_empty()
        || authority.chars().any(bad)
        || prefix.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return Err(format!("niepoprawny adres serwera „{url}”"));
    }
    Ok(Target {
        tls,
        authority: authority.to_string(),
        prefix: prefix.to_string(),
    })
}

/// Odpowiedź: kod i treść.
#[derive(Debug)]
pub struct Reply {
    pub status: u16,
    pub body: Vec<u8>,
}

impl Reply {
    pub fn json(&self) -> Result<serde_json::Value, String> {
        serde_json::from_slice(&self.body)
            .map_err(|_| "serwer nie odpowiedział JSON-em (to serwer VizRS?)".to_string())
    }
    /// Komunikat błędu serwera (`{"error": …}`) albo kod.
    pub fn error(&self) -> String {
        serde_json::from_slice::<serde_json::Value>(&self.body)
            .ok()
            .and_then(|v| v["error"].as_str().map(String::from))
            .unwrap_or_else(|| format!("odpowiedź HTTP {}", self.status))
    }
}

/// Dekoduje `Transfer-Encoding: chunked`. `None` – niepełne albo złe dane.
fn dechunk(mut b: &[u8]) -> Option<Vec<u8>> {
    let mut out = Vec::new();
    loop {
        let eol = b.windows(2).position(|w| w == b"\r\n")?;
        let size_txt = std::str::from_utf8(&b[..eol]).ok()?;
        let size = usize::from_str_radix(size_txt.split(';').next()?.trim(), 16).ok()?;
        b = &b[eol + 2..];
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

/// Rozbiór surowej odpowiedzi. `complete` – czy treść jest pełna (wg `Content-Length` albo `chunked`).
fn parse_reply(raw: &[u8]) -> Result<(Reply, bool), String> {
    let end = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or("niepełna odpowiedź HTTP")?;
    let head = String::from_utf8_lossy(&raw[..end]);
    let body = &raw[end + 4..];
    let mut lines = head.lines();
    let status = lines
        .next()
        .and_then(|l| l.split_whitespace().nth(1))
        .and_then(|c| c.parse().ok())
        .ok_or("to nie jest odpowiedź HTTP")?;
    let header = |name: &str| {
        head.lines().skip(1).find_map(|l| {
            let (k, v) = l.split_once(':')?;
            k.trim()
                .eq_ignore_ascii_case(name)
                .then(|| v.trim().to_string())
        })
    };
    if header("transfer-encoding").is_some_and(|t| t.eq_ignore_ascii_case("chunked")) {
        return Ok(match dechunk(body) {
            Some(b) => (Reply { status, body: b }, true),
            None => (
                Reply {
                    status,
                    body: vec![],
                },
                false,
            ),
        });
    }
    match header("content-length").and_then(|l| l.parse::<usize>().ok()) {
        Some(n) if body.len() >= n => Ok((
            Reply {
                status,
                body: body[..n].to_vec(),
            },
            true,
        )),
        Some(_) => Ok((
            Reply {
                status,
                body: body.to_vec(),
            },
            false,
        )),
        None => Ok((
            Reply {
                status,
                body: body.to_vec(),
            },
            true,
        )),
    }
}

/// Żądanie do serwera. `path` względem prefiksu adresu (np. `/api/show`). `max` – największa treść odpowiedzi.
/// Blokujące – wołać poza wątkiem GTK.
pub fn request(
    url: &str,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<(&str, &[u8])>,
    max: usize,
    timeout: Duration,
) -> Result<Reply, String> {
    let t = target(url)?;
    let client = gio::SocketClient::new();
    client.set_tls(t.tls);
    client.set_timeout(timeout.as_secs().clamp(1, 600) as u32);
    let scheme = if t.tls { "https" } else { "http" };
    let conn = client
        .connect_to_uri(
            &format!("{scheme}://{}", t.authority),
            if t.tls { 443 } else { 80 },
            None::<&gio::Cancellable>,
        )
        .map_err(|e| format!("Brak połączenia z {url}: {e}"))?;
    let mut head = format!(
        "{method} {}{path} HTTP/1.1\r\nHost: {}\r\nUser-Agent: vizrs-cg-artist/{}\r\nAccept: application/json\r\nConnection: close\r\n",
        t.prefix,
        t.authority,
        env!("CARGO_PKG_VERSION")
    );
    if let Some(tok) = token {
        head.push_str(&format!("Authorization: Bearer {tok}\r\n"));
    }
    let data = body.map(|(_, d)| d).unwrap_or_default();
    if let Some((ctype, d)) = body {
        head.push_str(&format!(
            "Content-Type: {ctype}\r\nContent-Length: {}\r\n",
            d.len()
        ));
    } else if method != "GET" {
        head.push_str("Content-Length: 0\r\n");
    }
    head.push_str("\r\n");
    let mut w = conn.output_stream().into_write();
    w.write_all(head.as_bytes())
        .and_then(|_| w.write_all(data))
        .and_then(|_| w.flush())
        .map_err(|e| format!("{url}: {e}"))?;
    let mut raw = Vec::new();
    let limit = (max + 64 * 1024) as u64;
    let read = conn
        .input_stream()
        .into_read()
        .take(limit)
        .read_to_end(&mut raw);
    if raw.len() as u64 >= limit {
        return Err(format!(
            "{url}: odpowiedź większa niż {} MB",
            max / 1024 / 1024
        ));
    }
    // TLS bez close_notify kończy się błędem odczytu – liczy się, czy treść jest pełna
    match (parse_reply(&raw), read) {
        (Ok((r, true)), _) => Ok(r),
        (Ok((_, false)), Err(e)) | (Err(_), Err(e)) => Err(format!("{url}: {e}")),
        (Ok((_, false)), Ok(_)) => Err(format!("{url}: niepełna odpowiedź")),
        (Err(e), Ok(_)) => Err(format!("{url}: {e}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn targets() {
        assert_eq!(
            target("https://cg.example.pl:8443/vizrs/").unwrap(),
            Target {
                tls: true,
                authority: "cg.example.pl:8443".into(),
                prefix: "/vizrs".into()
            }
        );
        assert_eq!(
            target("http://10.0.0.5:8088").unwrap(),
            Target {
                tls: false,
                authority: "10.0.0.5:8088".into(),
                prefix: "".into()
            }
        );
        assert!(target("ftp://x").is_err());
        assert!(target("http://user@evil/").is_err());
        assert!(target("http://a b").is_err());
        assert!(target("http:///x").is_err());
    }

    #[test]
    fn replies() {
        let (r, full) = parse_reply(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}").unwrap();
        assert!(full);
        assert_eq!((r.status, r.body.as_slice()), (200, b"{}".as_slice()));
        let (_, full) = parse_reply(b"HTTP/1.1 200 OK\r\nContent-Length: 9\r\n\r\n{}").unwrap();
        assert!(!full);
        let (r, full) =
            parse_reply(b"HTTP/1.1 409 Conflict\r\nTransfer-Encoding: chunked\r\n\r\n4\r\n{\"er\r\n9\r\nror\":\"x\"}\r\n0\r\n\r\n").unwrap();
        assert!(full);
        assert_eq!(r.error(), "x");
        assert!(
            !parse_reply(b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nab")
                .unwrap()
                .1
        );
        assert!(parse_reply(b"smieci").is_err());
        assert_eq!(
            Reply {
                status: 502,
                body: b"<html>".to_vec()
            }
            .error(),
            "odpowiedź HTTP 502"
        );
    }

    #[test]
    fn plain_http_round_trip() {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        let srv = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            // nagłówki i treść mogą przyjść osobno – czytaj do końca treści (2 bajty)
            let mut req = Vec::new();
            let mut buf = [0u8; 4096];
            while !req.windows(4).any(|w| w == b"\r\n\r\n") || !req.ends_with(b"{}") {
                let n = s.read(&mut buf).unwrap();
                assert!(n > 0, "połączenie zamknięte przed końcem żądania");
                req.extend_from_slice(&buf[..n]);
            }
            let req = String::from_utf8_lossy(&req).to_string();
            s.write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 11\r\n\r\n{\"ok\":true}")
                .unwrap();
            req
        });
        let r = request(
            &format!("http://{addr}/pre"),
            "PUT",
            "/api/scenes/a",
            Some("tok-1"),
            Some(("application/json", b"{}")),
            1024,
            Duration::from_secs(5),
        )
        .unwrap();
        assert_eq!(r.json().unwrap()["ok"], serde_json::json!(true));
        let req = srv.join().unwrap();
        assert!(
            req.starts_with("PUT /pre/api/scenes/a HTTP/1.1\r\n"),
            "{req}"
        );
        assert!(req.contains("Authorization: Bearer tok-1\r\n"));
        assert!(req.ends_with("\r\n\r\n{}"));
    }
}

//! Klient HTTP/1.1 do serwera `vizrs` (lokalnego albo na VPS): `http://` i `https://` przez `ureq` (TLS rustls,
//! czysty Rust – ten sam na Linux, Windows i macOS). Token idzie w `Authorization: Bearer` i nie trafia do strony.
//! Odpowiedzi z limitem rozmiaru; bez przekierowań (adres serwera wybiera użytkownik, nie serwer).

use std::io::{BufRead, BufReader};
use std::time::Duration;

use ureq::http;

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

/// Pełny adres żądania: baza serwera + ścieżka (z query).
fn full_url(url: &str, path: &str) -> Result<String, String> {
    let t = target(url)?;
    let scheme = if t.tls { "https" } else { "http" };
    Ok(format!("{scheme}://{}{}{path}", t.authority, t.prefix))
}

/// Odpowiedź: kod, typ treści i treść.
#[derive(Debug)]
pub struct Reply {
    pub status: u16,
    pub ctype: Option<String>,
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

fn agent(timeout: Option<Duration>) -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .max_redirects(0)
        .timeout_global(timeout)
        .timeout_connect(Some(Duration::from_secs(10)))
        .user_agent(format!("vizrs-cg-artist/{}", env!("CARGO_PKG_VERSION")))
        .build()
        .into()
}

fn describe(url: &str, e: ureq::Error) -> String {
    match e {
        ureq::Error::Timeout(_) => format!("{url}: serwer nie odpowiedział na czas"),
        e => format!("Brak połączenia z {url}: {e}"),
    }
}

/// Żądanie do serwera. `path` względem prefiksu adresu (np. `/api/show`), może mieć query.
/// `body` – (typ treści, dane). `max` – największa treść odpowiedzi. Blokujące – wołać poza wątkiem okna.
pub fn request(
    url: &str,
    method: &str,
    path: &str,
    token: Option<&str>,
    body: Option<(&str, &[u8])>,
    max: usize,
    timeout: Duration,
) -> Result<Reply, String> {
    let full = full_url(url, path)?;
    let mut b = http::Request::builder()
        .method(method)
        .uri(&full)
        .header("Accept", "application/json");
    if let Some(tok) = token {
        b = b.header("Authorization", format!("Bearer {tok}"));
    }
    let data: Vec<u8> = match body {
        Some((ctype, d)) => {
            b = b.header("Content-Type", ctype);
            d.to_vec()
        }
        None => vec![],
    };
    let req = b.body(data).map_err(|e| format!("{full}: {e}"))?;
    let mut res = agent(Some(timeout))
        .run(req)
        .map_err(|e| describe(url, e))?;
    let status = res.status().as_u16();
    let ctype = res
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .map(String::from);
    let body = res
        .body_mut()
        .with_config()
        .limit(max as u64)
        .read_to_vec()
        .map_err(|e| match e {
            ureq::Error::BodyExceedsLimit(_) => {
                format!("{url}: odpowiedź większa niż {} MB", max / 1024 / 1024)
            }
            e => describe(url, e),
        })?;
    Ok(Reply {
        status,
        ctype,
        body,
    })
}

/// Strumień zdarzeń serwera (`/events`, `text/event-stream`): każda linia `data: …` trafia do `on_data`,
/// dopóki zwraca `true` i połączenie trwa. Bez limitu czasu (strumień jest długi); błąd połączenia – `Err`.
pub fn events(
    url: &str,
    path: &str,
    token: Option<&str>,
    mut on_data: impl FnMut(&str) -> bool,
) -> Result<(), String> {
    let full = full_url(url, path)?;
    let mut b = http::Request::builder()
        .method("GET")
        .uri(&full)
        .header("Accept", "text/event-stream");
    if let Some(tok) = token {
        b = b.header("Authorization", format!("Bearer {tok}"));
    }
    let req = b.body(()).map_err(|e| format!("{full}: {e}"))?;
    let res = agent(None).run(req).map_err(|e| describe(url, e))?;
    if res.status() != 200 {
        return Err(format!("{full}: odpowiedź HTTP {}", res.status()));
    }
    let mut lines = BufReader::new(res.into_body().into_reader());
    let mut line = String::new();
    loop {
        line.clear();
        match lines.read_line(&mut line) {
            Ok(0) => return Ok(()),
            Ok(_) => {
                if let Some(d) = line.trim_end().strip_prefix("data:") {
                    if !on_data(d.trim_start()) {
                        return Ok(());
                    }
                }
            }
            Err(e) => return Err(format!("{full}: {e}")),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};

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
        assert_eq!(
            full_url("https://h/pre", "/api/x?a=1").unwrap(),
            "https://h/pre/api/x?a=1"
        );
    }

    /// Serwer testowy: przyjmuje jedno żądanie (nagłówki + treść wg Content-Length), oddaje `reply`.
    fn serve_once(reply: &'static [u8]) -> (String, std::thread::JoinHandle<String>) {
        let l = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        let h = std::thread::spawn(move || {
            let (mut s, _) = l.accept().unwrap();
            let mut req = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let n = s.read(&mut buf).unwrap();
                req.extend_from_slice(&buf[..n]);
                let text = String::from_utf8_lossy(&req).to_ascii_lowercase();
                if let Some(i) = text.find("\r\n\r\n") {
                    let len = text
                        .lines()
                        .find_map(|l| l.strip_prefix("content-length:"))
                        .and_then(|v| v.trim().parse::<usize>().ok())
                        .unwrap_or(0);
                    if req.len() >= i + 4 + len {
                        break;
                    }
                }
                if n == 0 {
                    break;
                }
            }
            s.write_all(reply).unwrap();
            String::from_utf8_lossy(&req).to_string()
        });
        (format!("http://{addr}"), h)
    }

    #[test]
    fn request_with_token_and_body() {
        let (url, srv) = serve_once(
            b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 11\r\nConnection: close\r\n\r\n{\"ok\":true}",
        );
        let r = request(
            &format!("{url}/pre"),
            "PUT",
            "/api/scenes/a",
            Some("tok-1"),
            Some(("application/json", b"{}")),
            1024,
            Duration::from_secs(5),
        )
        .unwrap();
        assert_eq!(r.json().unwrap()["ok"], serde_json::json!(true));
        assert_eq!(r.ctype.as_deref(), Some("application/json"));
        let req = srv.join().unwrap().to_ascii_lowercase();
        assert!(
            req.starts_with("put /pre/api/scenes/a http/1.1\r\n"),
            "{req}"
        );
        assert!(req.contains("authorization: bearer tok-1\r\n"));
        assert!(req.ends_with("\r\n\r\n{}"));
    }

    #[test]
    fn errors_and_limits() {
        let (url, srv) = serve_once(
            b"HTTP/1.1 409 Conflict\r\nContent-Type: application/json\r\nContent-Length: 13\r\nConnection: close\r\n\r\n{\"error\":\"x\"}",
        );
        let r = request(
            &url,
            "GET",
            "/api/show",
            None,
            None,
            1024,
            Duration::from_secs(5),
        )
        .unwrap();
        assert_eq!((r.status, r.error()), (409, "x".to_string()));
        srv.join().unwrap();
        let (url, srv) = serve_once(
            b"HTTP/1.1 200 OK\r\nContent-Length: 20\r\nConnection: close\r\n\r\n01234567890123456789",
        );
        let e = request(&url, "GET", "/", None, None, 8, Duration::from_secs(5)).unwrap_err();
        assert!(e.contains("większa"), "{e}");
        srv.join().unwrap();
        assert!(request(
            "http://127.0.0.1:1",
            "GET",
            "/",
            None,
            None,
            8,
            Duration::from_secs(2)
        )
        .is_err());
    }

    #[test]
    fn event_stream_lines() {
        let (url, srv) = serve_once(
            b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n: ping\n\ndata: {\"t\":\"show\"}\n\ndata: 2\n\n",
        );
        let mut got = vec![];
        events(&url, "/events", None, |d| {
            got.push(d.to_string());
            true
        })
        .unwrap();
        assert_eq!(got, ["{\"t\":\"show\"}", "2"]);
        srv.join().unwrap();
    }
}

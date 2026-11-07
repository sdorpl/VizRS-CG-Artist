//! Minimalny serwer HTTP/1.1 dla lokalnego magazynu (tylko `std`): jedno żądanie na połączenie,
//! limity nagłówków i treści, strumień `text/event-stream` dla `/events`. Słucha tylko na 127.0.0.1.

use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::time::Duration;

/// Największa treść żądania (zasób, show) – jak w serwerze `vizrs`.
pub const MAX_BODY: usize = 64 * 1024 * 1024;
const MAX_HEAD: usize = 64 * 1024;
const MAX_HEADERS: usize = 100;
/// Jednocześnie obsługiwane połączenia (okna Artist, strumienie zdarzeń).
const MAX_CONNS: usize = 64;
const KEEPALIVE: Duration = Duration::from_secs(15);

#[derive(Debug, Default)]
pub struct Request {
    pub method: String,
    /// ścieżka po dekodowaniu `%XX`, bez query
    pub path: String,
    pub query: Vec<(String, String)>,
    /// nazwy małymi literami
    pub headers: Vec<(String, String)>,
    pub body: Vec<u8>,
}

impl Request {
    pub fn q(&self, k: &str) -> Option<&str> {
        self.query
            .iter()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.as_str())
    }
    pub fn header(&self, k: &str) -> Option<&str> {
        self.headers
            .iter()
            .find(|(n, _)| n == k)
            .map(|(_, v)| v.as_str())
    }
    pub fn cookie(&self, k: &str) -> Option<&str> {
        self.header("cookie")?
            .split(';')
            .filter_map(|c| c.trim().split_once('='))
            .find(|(n, _)| *n == k)
            .map(|(_, v)| v)
    }
    /// Segmenty ścieżki: `/api/scenes/x` → `["api", "scenes", "x"]`.
    pub fn segs(&self) -> Vec<&str> {
        self.path.split('/').filter(|s| !s.is_empty()).collect()
    }
}

pub enum Body {
    Bytes(Vec<u8>),
    Static(&'static [u8]),
    /// strumień zdarzeń: każda wiadomość to jedna linia `data:`
    Events(Receiver<String>),
}

pub struct Response {
    pub status: u16,
    pub ctype: &'static str,
    pub headers: Vec<(&'static str, String)>,
    pub body: Body,
}

impl Response {
    pub fn new(status: u16, ctype: &'static str, body: Vec<u8>) -> Self {
        Self {
            status,
            ctype,
            headers: vec![],
            body: Body::Bytes(body),
        }
    }
    pub fn json(v: &serde_json::Value) -> Self {
        Self::new(
            200,
            "application/json; charset=utf-8",
            v.to_string().into_bytes(),
        )
    }
    pub fn ok() -> Self {
        Self::json(&serde_json::json!({ "ok": true }))
    }
    pub fn err(status: u16, msg: &str) -> Self {
        Self {
            status,
            ..Self::json(&serde_json::json!({ "error": msg }))
        }
    }
    pub fn with(mut self, name: &'static str, value: String) -> Self {
        self.headers.push((name, value));
        self
    }
}

fn reason(status: u16) -> &'static str {
    match status {
        200 => "OK",
        204 => "No Content",
        400 => "Bad Request",
        401 => "Unauthorized",
        403 => "Forbidden",
        404 => "Not Found",
        405 => "Method Not Allowed",
        409 => "Conflict",
        413 => "Payload Too Large",
        _ => "Error",
    }
}

/// `%XX` i `+` (w query) → tekst; zła sekwencja zostaje dosłownie.
pub fn decode(s: &str, plus: bool) -> String {
    let b = s.as_bytes();
    let hex = |c: u8| (c as char).to_digit(16).map(|d| d as u8);
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => match (hex(b[i + 1]), hex(b[i + 2])) {
                (Some(h), Some(l)) => {
                    out.push(h * 16 + l);
                    i += 3;
                    continue;
                }
                _ => out.push(b'%'),
            },
            b'+' if plus => out.push(b' '),
            c => out.push(c),
        }
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Czyta jedno żądanie. `Err` – komunikat dla odpowiedzi 400/413.
pub fn read_request(r: &mut impl BufRead) -> Result<Request, (u16, String)> {
    let bad = |m: &str| (400, m.to_string());
    let mut head = 0usize;
    let mut line = String::new();
    let mut next = |line: &mut String| -> Result<(), (u16, String)> {
        line.clear();
        let n = r
            .by_ref()
            .take((MAX_HEAD - head.min(MAX_HEAD)) as u64 + 1)
            .read_line(line)
            .map_err(|e| (400, e.to_string()))?;
        head += n;
        if head > MAX_HEAD {
            return Err((413, "za długie nagłówki".into()));
        }
        Ok(())
    };
    next(&mut line)?;
    let mut parts = line.split_whitespace();
    let (Some(method), Some(target), Some(ver)) = (parts.next(), parts.next(), parts.next()) else {
        return Err(bad("zły wiersz żądania"));
    };
    if !ver.starts_with("HTTP/1.") {
        return Err(bad("tylko HTTP/1.x"));
    }
    let (path, query) = target.split_once('?').unwrap_or((target, ""));
    let mut req = Request {
        method: method.to_string(),
        path: decode(path, false),
        query: query
            .split('&')
            .filter(|p| !p.is_empty())
            .map(|p| {
                let (k, v) = p.split_once('=').unwrap_or((p, ""));
                (decode(k, true), decode(v, true))
            })
            .collect(),
        ..Default::default()
    };
    loop {
        next(&mut line)?;
        let l = line.trim_end_matches(['\r', '\n']);
        if l.is_empty() {
            break;
        }
        if req.headers.len() >= MAX_HEADERS {
            return Err((413, "za dużo nagłówków".into()));
        }
        let (k, v) = l.split_once(':').ok_or_else(|| bad("zły nagłówek"))?;
        req.headers
            .push((k.trim().to_ascii_lowercase(), v.trim().to_string()));
    }
    if req.header("transfer-encoding").is_some() {
        return Err(bad("transfer-encoding nieobsługiwane"));
    }
    let len: usize = match req.header("content-length") {
        Some(v) => v.parse().map_err(|_| bad("zły content-length"))?,
        None => 0,
    };
    if len > MAX_BODY {
        return Err((
            413,
            format!("treść większa niż {} MB", MAX_BODY / 1024 / 1024),
        ));
    }
    req.body = vec![0; len];
    r.read_exact(&mut req.body)
        .map_err(|_| bad("niepełna treść"))?;
    Ok(req)
}

fn write_head(s: &mut TcpStream, res: &Response, len: Option<usize>) -> std::io::Result<()> {
    let mut h = format!(
        "HTTP/1.1 {} {}\r\nContent-Type: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n",
        res.status,
        reason(res.status),
        res.ctype
    );
    if let Some(n) = len {
        h.push_str(&format!("Content-Length: {n}\r\nConnection: close\r\n"));
    }
    for (k, v) in &res.headers {
        // wartości nagłówków ustawia tylko kod okna; mimo to bez znaków końca linii
        if !v.contains(['\r', '\n']) {
            h.push_str(&format!("{k}: {v}\r\n"));
        }
    }
    h.push_str("\r\n");
    s.write_all(h.as_bytes())
}

fn respond(mut s: TcpStream, res: Response) {
    match &res.body {
        Body::Bytes(b) => {
            let _ = write_head(&mut s, &res, Some(b.len())).and_then(|_| s.write_all(b));
        }
        Body::Static(b) => {
            let _ = write_head(&mut s, &res, Some(b.len())).and_then(|_| s.write_all(b));
        }
        Body::Events(_) => {
            let Body::Events(rx) = res.body else { return };
            let head = Response {
                body: Body::Bytes(vec![]),
                ..res
            };
            if write_head(&mut s, &head, None).is_err() || s.write_all(b": vizrs\n\n").is_err() {
                return;
            }
            loop {
                let chunk = match rx.recv_timeout(KEEPALIVE) {
                    Ok(m) => format!("data: {}\n\n", m.replace('\n', " ")),
                    Err(RecvTimeoutError::Timeout) => ": ping\n\n".into(),
                    Err(RecvTimeoutError::Disconnected) => return,
                };
                if s.write_all(chunk.as_bytes())
                    .and_then(|_| s.flush())
                    .is_err()
                {
                    return;
                }
            }
        }
    }
}

/// Obsługa połączeń w wątkach; `handler` dostaje żądanie, zwraca odpowiedź.
pub fn serve(listener: TcpListener, handler: Arc<dyn Fn(Request) -> Response + Send + Sync>) {
    let active = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            use std::sync::atomic::Ordering::SeqCst;
            if active.load(SeqCst) >= MAX_CONNS {
                continue; // zamknięcie bez odpowiedzi – strona ponowi
            }
            active.fetch_add(1, SeqCst);
            let (h, active) = (handler.clone(), active.clone());
            std::thread::spawn(move || {
                stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
                let mut r = BufReader::new(match stream.try_clone() {
                    Ok(s) => s,
                    Err(_) => {
                        active.fetch_sub(1, SeqCst);
                        return;
                    }
                });
                let res = match read_request(&mut r) {
                    Ok(req) => h(req),
                    Err((code, msg)) => Response::err(code, &msg),
                };
                respond(stream, res);
                active.fetch_sub(1, SeqCst);
            });
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(raw: &str) -> Result<Request, (u16, String)> {
        read_request(&mut std::io::Cursor::new(raw.as_bytes().to_vec()))
    }

    #[test]
    fn request_line_query_headers_body() {
        let r = parse("PUT /api/scenes/a%20b?who=Jan+K&x=%C5%BC HTTP/1.1\r\nHost: 127.0.0.1:1\r\nCookie: a=1; k=s3\r\nContent-Length: 4\r\n\r\n{}{}").unwrap();
        assert_eq!(r.method, "PUT");
        assert_eq!(r.path, "/api/scenes/a b");
        assert_eq!(r.segs(), ["api", "scenes", "a b"]);
        assert_eq!(r.q("who"), Some("Jan K"));
        assert_eq!(r.q("x"), Some("ż"));
        assert_eq!(r.header("host"), Some("127.0.0.1:1"));
        assert_eq!(r.cookie("k"), Some("s3"));
        assert_eq!(r.body, b"{}{}");
    }

    #[test]
    fn hostile_requests() {
        assert_eq!(parse("GET\r\n\r\n").unwrap_err().0, 400);
        assert_eq!(parse("GET / SPDY/3\r\n\r\n").unwrap_err().0, 400);
        let big = format!(
            "POST / HTTP/1.1\r\nContent-Length: {}\r\n\r\n",
            MAX_BODY + 1
        );
        assert_eq!(parse(&big).unwrap_err().0, 413);
        assert_eq!(
            parse("POST / HTTP/1.1\r\nContent-Length: 10\r\n\r\nabc")
                .unwrap_err()
                .0,
            400
        );
        let long = format!("GET / HTTP/1.1\r\nX: {}\r\n\r\n", "a".repeat(MAX_HEAD));
        assert_eq!(parse(&long).unwrap_err().0, 413);
        assert_eq!(
            parse("POST / HTTP/1.1\r\nTransfer-Encoding: chunked\r\n\r\n")
                .unwrap_err()
                .0,
            400
        );
        assert_eq!(decode("%zz%4", false), "%zz%4");
        assert_eq!(decode("%2e%2e%2f", false), "../");
    }
}

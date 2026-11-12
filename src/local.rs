//! Serwer strony w procesie okna na `127.0.0.1:<losowy port>`: strona Artist (`web`) zawsze z binarki, a API
//! z magazynu lokalnego (`store`, praca bez serwera) albo przez pośrednika z serwera `vizrs` (praca na serwerze:
//! `/api`, `/assets`, `/events` idą dalej z tokenem trzymanym w oknie). Strona mówi tym samym API
//! (`/api/show`, `/api/scenes`, `/api/assets`, `/events`…), więc nie zna różnicy. Dostęp tylko z okna: jednorazowy sekret (`?token=` → ciasteczko, jak w `vizrs`),
//! nagłówek `Host` równy adresowi (DNS rebinding), `Origin` przy zmianach. Katalog danych dostaje blokadę
//! `.vizrs.lock` w formacie serwera – `vizrs` nie wystartuje na katalogu otwartym w Artist.

use std::fs::OpenOptions;
use std::io::Write;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use crate::http::{Body, Request, Response};
use crate::store::{Store, KINDS};

pub const APP_NAME: &str = "vizrs-cg-artist";
const COOKIE: &str = "vizrs_local";

/// Działający magazyn lokalny. Blokada katalogu znika przy zakończeniu (`Drop`).
pub struct Local {
    pub base: String,
    pub secret: String,
    lock: Option<PathBuf>,
    instance: String,
}

impl Drop for Local {
    fn drop(&mut self) {
        if let Some(p) = &self.lock {
            let ours = std::fs::read_to_string(p)
                .ok()
                .and_then(|t| serde_json::from_str::<Value>(&t).ok())
                .is_some_and(|v| v["instance"].as_str() == Some(self.instance.as_str()));
            if ours {
                std::fs::remove_file(p).ok();
            }
        }
    }
}

/// Losowy tekst szesnastkowy z generatora systemu (Linux, Windows, macOS – `getrandom`).
pub fn random_hex(bytes: usize) -> Result<String, String> {
    let mut b = vec![0u8; bytes];
    getrandom::fill(&mut b).map_err(|e| format!("losowanie sekretu: {e}"))?;
    Ok(b.iter().map(|x| format!("{x:02x}")).collect())
}

/// Serwer zdalny dla pośrednika: adres i token (tylko w oknie).
struct Remote {
    url: String,
    token: Option<String>,
}

struct State {
    /// magazyn lokalny albo `None` (pośrednik do serwera)
    store: Option<Mutex<Store>>,
    remote: Option<Remote>,
    subs: Mutex<Vec<Sender<String>>>,
    secret: String,
    instance: String,
    hosts: [String; 2],
    origin: String,
}

impl State {
    fn broadcast(&self, ev: &Value) {
        let msg = ev.to_string();
        if let Ok(mut subs) = self.subs.lock() {
            subs.retain(|s| s.send(msg.clone()).is_ok());
        }
    }
}

/// Wynik operacji magazynu → odpowiedź (jak `res` w serwerze: konflikt 409, zapis 500, reszta 400).
fn res<T>(r: Result<T, String>, f: impl FnOnce(T) -> Response) -> Response {
    match r {
        Ok(v) => f(v),
        Err(e) if e.starts_with("zapis") => Response::err(500, &e),
        Err(e) if e.starts_with("konflikt") => Response::err(409, &e),
        Err(e) => Response::err(400, &e),
    }
}

fn handle(st: &State, req: Request) -> Response {
    let host = req.header("host").unwrap_or("");
    if !st.hosts.iter().any(|h| h == host) {
        return Response::err(403, "zły nagłówek Host");
    }
    let m = req.method.as_str();
    if req.path == "/health" && m == "GET" {
        return Response::json(
            &json!({ "status": "ok", "instance": st.instance, "app": APP_NAME }),
        );
    }
    let by_query = req.q("token") == Some(st.secret.as_str());
    if !(by_query || req.cookie(COOKIE) == Some(st.secret.as_str())) {
        return Response::err(401, "tylko okno VizRS CG Artist");
    }
    if !matches!(m, "GET" | "HEAD") {
        if let Some(o) = req.header("origin") {
            if o != st.origin {
                return Response::err(403, "zmiany tylko ze strony Artist");
            }
        }
    }
    let r = route(st, &req);
    if by_query {
        r.with(
            "Set-Cookie",
            format!("{COOKIE}={}; Path=/; HttpOnly; SameSite=Strict", st.secret),
        )
    } else {
        r
    }
}

/// Plik strony z binarki (wspólne dla magazynu i pośrednika).
fn page(req: &Request) -> Response {
    match crate::web::get(&req.path) {
        Some((d, t)) => Response {
            status: 200,
            ctype: t,
            headers: vec![],
            body: Body::Static(d),
        },
        None => Response::err(404, "nie znaleziono"),
    }
}

/// Query z powrotem w adresie (bez sekretu okna).
fn query_string(req: &Request) -> String {
    let enc = |s: &str| crate::url_escape(s);
    let q: Vec<String> = req
        .query
        .iter()
        .filter(|(k, _)| k != "token")
        .map(|(k, v)| format!("{}={}", enc(k), enc(v)))
        .collect();
    if q.is_empty() {
        String::new()
    } else {
        format!("?{}", q.join("&"))
    }
}

/// Pośrednik do serwera `vizrs`: strona z binarki, reszta do serwera z tokenem okna.
fn proxy(r: &Remote, req: &Request) -> Response {
    let m = req.method.as_str();
    let s = req.segs();
    let api = matches!(s.first(), Some(&"api") | Some(&"assets"));
    if m == "GET" && req.path == "/events" {
        let (tx, rx) = channel::<String>();
        let (url, token) = (r.url.clone(), r.token.clone());
        std::thread::spawn(move || {
            // koniec strumienia serwera = koniec strumienia strony; EventSource połączy się ponownie
            let _ = crate::client::events(&url, "/events", token.as_deref(), |d| {
                tx.send(d.to_string()).is_ok()
            });
        });
        return Response {
            status: 200,
            ctype: "text/event-stream",
            headers: vec![],
            body: Body::Events(rx),
        };
    }
    if m == "GET" && !api {
        return page(req);
    }
    if !api {
        return Response::err(405, "niedozwolona metoda");
    }
    let path = s
        .iter()
        .map(|seg| crate::url_escape(seg))
        .collect::<Vec<_>>()
        .join("/");
    let target = format!("/{path}{}", query_string(req));
    let ctype = req
        .header("content-type")
        .unwrap_or("application/octet-stream");
    let body = (!matches!(m, "GET" | "HEAD")).then_some((ctype, req.body.as_slice()));
    match crate::client::request(
        &r.url,
        m,
        &target,
        r.token.as_deref(),
        body,
        crate::http::MAX_BODY,
        std::time::Duration::from_secs(60),
    ) {
        Ok(rep) => {
            let json = rep.ctype.as_deref().is_some_and(|t| t.contains("json"));
            let ctype = if json {
                "application/json; charset=utf-8"
            } else if s.first() == Some(&"assets") {
                crate::web::mime(s.last().unwrap_or(&""))
            } else {
                "text/plain; charset=utf-8"
            };
            Response::new(rep.status, ctype, rep.body)
        }
        Err(e) => Response::err(502, &e),
    }
}

fn route(st: &State, req: &Request) -> Response {
    if let Some(r) = &st.remote {
        return proxy(r, req);
    }
    let Some(store_m) = &st.store else {
        return Response::err(500, "magazyn niedostępny");
    };
    let m = req.method.as_str();
    let s = req.segs();
    if m == "GET" {
        if req.path == "/events" {
            let (tx, rx) = channel();
            if let Ok(mut subs) = st.subs.lock() {
                subs.push(tx);
            }
            return Response {
                status: 200,
                ctype: "text/event-stream",
                headers: vec![],
                body: Body::Events(rx),
            };
        }
        if let ["assets", name] = s.as_slice() {
            let data = store_m.lock().ok().and_then(|g| g.asset(name));
            return match data {
                Some(d) => Response::new(200, crate::web::mime(name), d),
                None => Response::err(404, "nie znaleziono"),
            };
        }
        if s.first() != Some(&"api") {
            return page(req);
        }
    }
    if s.first() != Some(&"api") {
        return Response::err(405, "niedozwolona metoda");
    }
    let Ok(mut store) = store_m.lock() else {
        return Response::err(500, "magazyn niedostępny");
    };
    let body = || -> Result<Value, String> {
        if req.body.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&req.body).map_err(|e| format!("zły JSON: {e}"))
    };
    match (m, &s[1..]) {
        ("GET", ["show"]) => Response::json(store.show()),
        ("PUT", ["show"]) => res(
            body().and_then(|b| store.put_show(b, req.q("force") == Some("1"))),
            |_| {
                st.broadcast(&json!({ "t": "show" }));
                Response::ok()
            },
        ),
        ("GET", ["state"]) => Response::json(&json!({
            "mode": "local", "rev": store.show()["rev"], "layers": [], "preview": [],
        })),
        ("GET", ["deploy", "servers"]) => Response::json(&crate::deploy::servers()),
        ("POST", ["deploy", "check"]) => {
            let b = match body() {
                Ok(b) => b,
                Err(e) => return Response::err(400, &e),
            };
            let srv = match crate::deploy::server(b["server"].as_str().unwrap_or("")) {
                Ok(s) => s,
                Err(e) => return Response::err(400, &e),
            };
            let scenes: Vec<Value> = ids(&b["scenes"])
                .iter()
                .filter_map(|id| store.scene(id))
                .collect();
            let recorded = store.deployed(&srv.url);
            drop(store); // sieć bez blokady magazynu
            res(crate::deploy::check(&srv, &scenes, &recorded), |j| {
                Response::json(&j)
            })
        }
        ("POST", ["deploy"]) => {
            let b = match body() {
                Ok(b) => b,
                Err(e) => return Response::err(400, &e),
            };
            drop(store);
            deploy(store_m, &b)
        }
        // jedno okno na katalog danych (instancja) – blokady scen zawsze przyznane
        ("POST" | "PUT", ["lock", _, _]) => Response::json(&json!({ "ok": true })),
        ("POST" | "DELETE", ["unlock", _, _]) => {
            Response::json(&json!({ "ok": true, "released": true }))
        }
        ("GET", ["locks"]) => Response::json(&json!([])),
        ("GET", ["animpresets"]) => Response::json(&store.anim_presets()),
        ("PUT", ["animpresets"]) => res(body().and_then(|b| store.put_anim_presets(b)), |j| {
            Response::json(&j)
        }),
        ("GET", ["assets"]) => Response::json(&store.assets()),
        ("POST", ["assets"]) => res(
            store.put_asset(req.q("name").unwrap_or(""), &req.body),
            |j| Response::json(&j),
        ),
        ("DELETE", ["assets", name]) => {
            store.delete_asset(name);
            Response::ok()
        }
        ("POST" | "PUT", [kind]) if KINDS.contains(kind) => {
            res(body().and_then(|b| store.upsert(kind, b)), |it| {
                st.broadcast(&json!({ "t": "show", "kind": kind, "id": it["id"] }));
                Response::json(&it)
            })
        }
        ("PUT", [kind, id]) if KINDS.contains(kind) => res(
            body().and_then(|mut b| {
                if !b.is_object() {
                    return Err("zły typ obiektu".to_string());
                }
                b["id"] = json!(id);
                store.upsert(kind, b)
            }),
            |it| {
                st.broadcast(&json!({ "t": "show", "kind": kind, "id": it["id"] }));
                Response::json(&it)
            },
        ),
        ("DELETE", [kind, id]) if KINDS.contains(kind) => res(store.delete(kind, id), |_| {
            st.broadcast(&json!({ "t": "show" }));
            Response::ok()
        }),
        _ => Response::err(404, "nie znaleziono"),
    }
}

/// Identyfikatory scen z listy (do 500, bez pustych).
fn ids(v: &Value) -> Vec<String> {
    v.as_array()
        .into_iter()
        .flatten()
        .filter_map(|x| x.as_str().or_else(|| x["id"].as_str()))
        .filter(|s| !s.is_empty() && s.len() <= 100)
        .take(500)
        .map(String::from)
        .collect()
}

/// Wysyłka scen: `{server, scenes: [{id, assets: [nazwy], overwrite}]}` → wynik dla każdej sceny.
/// Wysyłana jest scena zapisana na dysku; zasoby z `assets/`; magazyn zablokowany tylko na odczyt danych.
fn deploy(store_m: &Mutex<Store>, b: &Value) -> Response {
    let srv = match crate::deploy::server(b["server"].as_str().unwrap_or("")) {
        Ok(s) => s,
        Err(e) => return Response::err(400, &e),
    };
    let remote_assets = match crate::deploy::remote_assets(&srv) {
        Ok(a) => a,
        Err(e) => return Response::err(502, &e),
    };
    let mut placer = crate::deploy::Placer::new(&srv, &remote_assets);
    let mut results = vec![];
    for item in b["scenes"].as_array().into_iter().flatten().take(500) {
        let id = item["id"].as_str().unwrap_or_default().to_string();
        let names: Vec<String> = item["assets"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|n| n.as_str().map(String::from))
            .take(1000)
            .collect();
        let (scene, assets, expect) = {
            let Ok(store) = store_m.lock() else {
                return Response::err(500, "magazyn niedostępny");
            };
            let assets: Vec<(String, Vec<u8>)> = names
                .iter()
                .filter_map(|n| store.asset(n).map(|d| (n.clone(), d)))
                .collect();
            (
                store.scene(&id),
                assets,
                store.deployed(&srv.url)[&id].as_f64(),
            )
        };
        let Some(scene) = scene else {
            results.push(json!({ "id": id, "ok": false, "error": "scena niezapisana – zapisz ją przed wysyłką" }));
            continue;
        };
        let overwrite = item["overwrite"].as_bool().unwrap_or(false);
        match crate::deploy::send(&srv, &mut placer, &scene, &assets, expect, overwrite) {
            Ok(sent) => {
                let saved = store_m
                    .lock()
                    .map_err(|_| "magazyn niedostępny".to_string())
                    .and_then(|s| s.set_deployed(&srv.url, &id, sent.rev));
                results.push(json!({
                    "id": id, "ok": true, "rev": sent.rev, "uploaded": sent.uploaded, "skipped": sent.skipped, "renamed": sent.renamed,
                    "warning": saved.err(),
                }));
            }
            Err(e) => results.push(
                json!({ "id": id, "ok": false, "conflict": e.starts_with("konflikt"), "error": e }),
            ),
        }
    }
    Response::json(&json!({ "server": srv.url, "results": results }))
}

/// Zakłada blokadę `.vizrs.lock` (format serwera). Błąd = katalog trzyma działający program.
fn take_lock(data: &Path, addr: &str, instance: &str) -> Result<Option<PathBuf>, String> {
    let path = data.join(crate::server::LOCK_FILE);
    let body = json!({
        "pid": std::process::id(), "addr": addr, "instance": instance,
        "version": env!("CARGO_PKG_VERSION"), "app": APP_NAME,
    })
    .to_string();
    for _ in 0..3 {
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(mut f) => {
                return Ok(f
                    .write_all(body.as_bytes())
                    .and_then(|_| f.sync_all())
                    .is_ok()
                    .then_some(path));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                if let Some(owner) = crate::server::lock_owner(data) {
                    return Err(format!(
                        "Katalog danych {} jest otwarty w innym programie ({owner}).",
                        data.display()
                    ));
                }
                std::fs::remove_file(&path).ok(); // martwa blokada (awaria, kill -9)
            }
            // katalog tylko do odczytu itp. – praca bez blokady, jak w serwerze
            Err(_) => return Ok(None),
        }
    }
    Ok(None)
}

/// Otwiera magazyn na `data` i uruchamia serwer strony.
pub fn start(data: &Path) -> Result<Local, String> {
    let store = Store::open(data)?;
    serve(Some(store), None, Some(data))
}

/// Pośrednik do serwera `vizrs` pod `url` (token tylko w oknie) – strona z binarki, API z serwera.
pub fn start_remote(url: &str, token: Option<String>) -> Result<Local, String> {
    crate::client::target(url)?;
    serve(
        None,
        Some(Remote {
            url: url.trim_end_matches('/').to_string(),
            token,
        }),
        None,
    )
}

fn serve(
    store: Option<Store>,
    remote: Option<Remote>,
    data: Option<&Path>,
) -> Result<Local, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|e| format!("serwer strony: {e}"))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("serwer strony: {e}"))?
        .port();
    let addr = format!("127.0.0.1:{port}");
    let secret = random_hex(24)?;
    let instance = random_hex(12)?;
    let lock = match data {
        Some(d) => take_lock(d, &addr, &instance)?,
        None => None,
    };
    let base = format!("http://{addr}");
    let st = Arc::new(State {
        store: store.map(Mutex::new),
        remote,
        subs: Mutex::new(vec![]),
        secret: secret.clone(),
        instance: instance.clone(),
        hosts: [addr.clone(), format!("localhost:{port}")],
        origin: base.clone(),
    });
    crate::http::serve(listener, Arc::new(move |req| handle(&st, req)));
    Ok(Local {
        base,
        secret,
        lock,
        instance,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, Read};
    use std::net::TcpStream;

    fn call(addr: &str, raw: &str) -> (u16, String, String) {
        let mut s = TcpStream::connect(addr).unwrap();
        s.write_all(raw.as_bytes()).unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).unwrap();
        let (head, body) = out.split_once("\r\n\r\n").unwrap();
        let code = head.split_whitespace().nth(1).unwrap().parse().unwrap();
        (code, head.to_string(), body.to_string())
    }

    #[test]
    fn local_api_end_to_end() {
        let d = std::env::temp_dir().join(format!("vizrs-cg-artist-local-{}", std::process::id()));
        std::fs::remove_dir_all(&d).ok();
        let l = start(&d).unwrap();
        let addr = l.base.trim_start_matches("http://").to_string();
        let k = &l.secret;
        let get = |path: &str, extra: &str| {
            call(
                &addr,
                &format!("GET {path} HTTP/1.1\r\nHost: {addr}\r\n{extra}\r\n"),
            )
        };

        // blokada w formacie serwera, /health bez sekretu (vizrs sprawdza właściciela)
        let lock: Value =
            serde_json::from_str(&std::fs::read_to_string(d.join(".vizrs.lock")).unwrap()).unwrap();
        let (c, _, b) = get("/health", "");
        assert_eq!(c, 200);
        assert_eq!(
            serde_json::from_str::<Value>(&b).unwrap()["instance"],
            lock["instance"]
        );
        assert!(crate::server::lock_owner(&d)
            .unwrap()
            .starts_with("VizRS CG Artist"));
        assert!(start(&d).is_err(), "drugi magazyn na tym samym katalogu");

        // bez sekretu nic; zły Host (DNS rebinding) nic
        assert_eq!(get("/artist", "").0, 401);
        assert_eq!(get("/api/show", "Cookie: vizrs_local=zly\r\n").0, 401);
        assert_eq!(
            call(
                &addr,
                &format!("GET /artist?token={k} HTTP/1.1\r\nHost: evil.example:80\r\n\r\n")
            )
            .0,
            403
        );
        // sekret w adresie strony → ciasteczko; dalej samo ciasteczko
        let (c, head, html) = get(&format!("/artist?token={k}"), "");
        assert_eq!(c, 200);
        assert!(head.contains(&format!(
            "Set-Cookie: vizrs_local={k}; Path=/; HttpOnly; SameSite=Strict"
        )));
        assert!(html.contains("<title>"));
        let ck = format!("Cookie: vizrs_local={k}\r\n");
        assert_eq!(get("/renderer.js", &ck).0, 200);
        assert_eq!(get("/fonts/fonts.css", &ck).0, 200);
        assert_eq!(get("/trio", &ck).0, 404);

        // scena: zapis, konflikt rev → 409, strony Trio → 400
        let put = |path: &str, body: &str, origin: &str| {
            call(
                &addr,
                &format!(
                    "PUT {path} HTTP/1.1\r\nHost: {addr}\r\n{ck}{origin}Content-Length: {}\r\n\r\n{body}",
                    body.len()
                ),
            )
        };
        let (c, _, b) = put("/api/scenes/s1", r#"{"name":"Belka"}"#, "");
        assert_eq!(c, 200, "{b}");
        assert_eq!(
            serde_json::from_str::<Value>(&b).unwrap()["rev"],
            json!(1.0)
        );
        assert_eq!(put("/api/scenes/s1", r#"{"rev":7}"#, "").0, 409);
        assert_eq!(put("/api/pages/p1", r#"{"scene":"s1"}"#, "").0, 400);
        assert_eq!(
            put(
                "/api/scenes/s1",
                r#"{"rev":1}"#,
                "Origin: http://evil.example\r\n"
            )
            .0,
            403
        );
        assert_eq!(put("/api/scenes/s1", "{zły", "").0, 400);
        let (_, _, show) = get("/api/show", &ck);
        assert_eq!(
            serde_json::from_str::<Value>(&show).unwrap()["scenes"][0]["id"],
            json!("s1")
        );

        // zasoby
        let (c, _, b) = call(
            &addr,
            &format!("POST /api/assets?name=logo.png HTTP/1.1\r\nHost: {addr}\r\n{ck}Content-Length: 3\r\n\r\nPNG"),
        );
        assert_eq!(c, 200, "{b}");
        let (c, head, b) = get("/assets/logo.png", &ck);
        assert_eq!((c, b.as_str()), (200, "PNG"));
        assert!(head.contains("image/png"));
        assert_eq!(get("/assets/..%2fshow.json", &ck).0, 404);

        // zdarzenia: zapis sceny trafia do strumienia
        let mut es = TcpStream::connect(&addr).unwrap();
        write!(es, "GET /events HTTP/1.1\r\nHost: {addr}\r\n{ck}\r\n").unwrap();
        let mut r = std::io::BufReader::new(es);
        let mut line = String::new();
        while line != ": vizrs\n" {
            line.clear();
            r.read_line(&mut line).unwrap();
        }
        put("/api/scenes/s2", "{}", "");
        while line.trim().is_empty() || line.starts_with(':') {
            line.clear();
            r.read_line(&mut line).unwrap();
        }
        assert!(
            line.starts_with("data: {") && line.contains("\"s2\""),
            "{line}"
        );

        drop(l);
        assert!(!d.join(".vizrs.lock").exists(), "blokada zwolniona");
        std::fs::remove_dir_all(d).ok();
    }

    #[test]
    fn remote_proxy_forwards_with_token() {
        // serwer „vizrs”: zapamiętuje żądanie, oddaje JSON
        let up = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let up_addr = up.local_addr().unwrap();
        let srv = std::thread::spawn(move || {
            let (mut s, _) = up.accept().unwrap();
            let mut buf = vec![0u8; 8192];
            let n = s.read(&mut buf).unwrap();
            s.write_all(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 15\r\nConnection: close\r\n\r\n{\"scenes\":[11]}")
                .unwrap();
            String::from_utf8_lossy(&buf[..n]).to_ascii_lowercase()
        });
        let l = start_remote(&format!("http://{up_addr}"), Some("tok-zdalny".into())).unwrap();
        let addr = l.base.trim_start_matches("http://").to_string();
        let ck = format!("Cookie: vizrs_local={}\r\n", l.secret);
        let (c, _, html) = call(
            &addr,
            &format!("GET /artist HTTP/1.1\r\nHost: {addr}\r\n{ck}\r\n"),
        );
        assert_eq!(c, 200);
        assert!(html.contains("<title>"), "strona z binarki, nie z serwera");
        let (c, head, body) = call(
            &addr,
            &format!("GET /api/show?x=a%20b&token=sekret HTTP/1.1\r\nHost: {addr}\r\n{ck}\r\n"),
        );
        assert_eq!((c, body.as_str()), (200, "{\"scenes\":[11]}"));
        assert!(head.contains("application/json"));
        let up_req = srv.join().unwrap();
        assert!(
            up_req.starts_with("get /api/show?x=a%20b http/1.1"),
            "{up_req}"
        );
        assert!(up_req.contains("authorization: bearer tok-zdalny"));
        // bez sekretu okna – nic nie idzie do serwera
        assert_eq!(
            call(
                &addr,
                &format!("GET /api/show HTTP/1.1\r\nHost: {addr}\r\n\r\n")
            )
            .0,
            401
        );
    }
}

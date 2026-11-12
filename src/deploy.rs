//! Wysyłka scen z pracy lokalnej na serwer `vizrs` (VPS, studio). Tylko na serwery z listy zapisanych
//! (okno „Połącz z serwerem”); token bierzemy stamtąd i nie trafia do strony.
//!
//! Rewizje: serwer numeruje `rev` każdej sceny osobno. Po udanej wysyłce zapamiętujemy rewizję sceny na serwerze
//! (`deploy.json` w katalogu danych). Kolejna wysyłka podaje ją serwerowi – gdy ktoś zmienił scenę na serwerze
//! w międzyczasie, serwer odpowiada 409 i scena czeka na świadome „nadpisz”. Zasoby sceny idą wg reguł plików
//! paczki `.cgpack` (`cgpack.assetPlacer` w `web/cgpack.js`, ta sama kolejność): czcionka już obecna na serwerze
//! (ta sama treść) nie jest wysyłana drugi raz, plik o tej samej nazwie i treści jest pomijany, nic nie jest
//! nadpisywane (zajęta nazwa z inną treścią → `nazwa_2.ext`), a odnośniki w wysyłanej scenie wskazują plik na serwerze.

use std::collections::HashMap;
use std::time::Duration;

use serde_json::{json, Value};

use crate::client;
use crate::connect::Saved;

const TIMEOUT: Duration = Duration::from_secs(20);
/// Największy show czytany z serwera (jak limit treści serwera).
const MAX_SHOW: usize = 64 * 1024 * 1024;
const MAX_SMALL: usize = 4 * 1024 * 1024;

/// Serwer wysyłki: adres z listy zapisanych i jego token.
pub struct Server {
    pub url: String,
    token: Option<String>,
}

/// Lista dla strony: adresy i to, czy token jest zapamiętany (bez tokenów).
pub fn servers() -> Value {
    Value::Array(
        Saved::load()
            .servers
            .iter()
            .map(|(u, t)| json!({ "url": u, "hasToken": t.is_some() }))
            .collect(),
    )
}

pub fn server(url: &str) -> Result<Server, String> {
    let saved = Saved::load();
    if !saved.servers.iter().any(|(u, _)| u == url) {
        return Err("serwer spoza listy zapisanych – dodaj go w Plik → Połącz z serwerem".into());
    }
    Ok(Server {
        url: url.to_string(),
        token: saved.token_for(url),
    })
}

impl Server {
    fn call(
        &self,
        method: &str,
        path: &str,
        body: Option<(&str, &[u8])>,
        max: usize,
    ) -> Result<client::Reply, String> {
        let r = client::request(
            &self.url,
            method,
            path,
            self.token.as_deref(),
            body,
            max,
            TIMEOUT,
        )?;
        match r.status {
            401 => Err(if self.token.is_some() {
                "serwer odrzucił zapamiętany token".into()
            } else {
                "serwer wymaga tokenu – zapisz go w Plik → Połącz z serwerem („zapamiętaj token”)"
                    .into()
            }),
            403 => Err("ten token nie pozwala edytować (to token wyjścia OBS?)".into()),
            _ => Ok(r),
        }
    }

    fn get_json(&self, path: &str, max: usize) -> Result<Value, String> {
        let r = self.call("GET", path, None, max)?;
        if r.status != 200 {
            return Err(format!("{path}: {}", r.error()));
        }
        r.json()
    }
}

/// Stan sceny wobec serwera.
fn status(remote: Option<&Value>, recorded: Option<f64>) -> &'static str {
    match (remote, recorded) {
        (None, _) => "new",
        (Some(r), Some(rev)) if r["rev"].as_f64() == Some(rev) => "same",
        (Some(_), Some(_)) => "changed",
        // scena o tym id jest na serwerze, ale nie wysłana stąd (np. import paczki)
        (Some(_), None) => "foreign",
    }
}

/// Sprawdzenie przed wysyłką: dla każdej sceny stan na serwerze i warstwy, na których jest na antenie.
/// `recorded` – zapamiętane rewizje dla tego serwera (`{id: rev}`).
pub fn check(srv: &Server, scenes: &[Value], recorded: &Value) -> Result<Value, String> {
    let show = srv.get_json("/api/show", MAX_SHOW)?;
    let state = srv.get_json("/api/state", MAX_SMALL).unwrap_or(Value::Null);
    let assets = remote_assets(srv)?;
    let remote = show["scenes"].as_array().cloned().unwrap_or_default();
    let list: Vec<Value> = scenes
        .iter()
        .map(|s| {
            let id = s["id"].as_str().unwrap_or_default();
            let r = remote.iter().find(|x| x["id"].as_str() == Some(id));
            let on_air: Vec<Value> = state["layers"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|l| l["page"]["scene"].as_str() == Some(id))
                .map(|l| l["layer"].clone())
                .collect();
            json!({
                "id": id, "name": s["name"],
                "status": status(r, recorded[id].as_f64()),
                "remoteName": r.map(|r| r["name"].clone()),
                "onAir": on_air,
            })
        })
        .collect();
    Ok(json!({ "server": srv.url, "scenes": list, "assets": assets }))
}

/// Nazwy zasobów na serwerze.
pub fn remote_assets(srv: &Server) -> Result<Vec<String>, String> {
    Ok(srv
        .get_json("/api/assets", MAX_SMALL)?
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|x| x["name"].as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default())
}

/// Wynik wysyłki jednej sceny.
pub struct Sent {
    pub rev: f64,
    pub uploaded: Vec<String>,
    pub skipped: Vec<String>,
    /// `[nazwa lokalna, nazwa na serwerze]` – plik zapisany pod inną nazwą albo zastąpiony istniejącym.
    pub renamed: Vec<(String, String)>,
}

/// Serwer widziany przez reguły plików (w testach – atrapa).
pub trait Remote {
    /// Treść zasobu, gdy ma najwyżej `max` bajtów (większy albo niedostępny → `None`).
    fn get(&self, name: &str, max: usize) -> Option<Vec<u8>>;
    /// Zapis zasobu; zwraca nazwę zapisaną przez serwer.
    fn put(&self, name: &str, data: &[u8]) -> Result<String, String>;
}

impl Remote for Server {
    fn get(&self, name: &str, max: usize) -> Option<Vec<u8>> {
        let r = self
            .call(
                "GET",
                &format!("/assets/{}", crate::url_escape(name)),
                None,
                max,
            )
            .ok()?;
        (r.status == 200).then_some(r.body)
    }
    fn put(&self, name: &str, data: &[u8]) -> Result<String, String> {
        let r = self.call(
            "POST",
            &format!("/api/assets?name={}", crate::url_escape(name)),
            Some(("application/octet-stream", data)),
            MAX_SMALL,
        )?;
        if r.status != 200 {
            return Err(format!("zasób {name}: {}", r.error()));
        }
        Ok(r.json()
            .ok()
            .and_then(|j| j["name"].as_str().map(String::from))
            .unwrap_or_else(|| name.to_string()))
    }
}

/// Największa czcionka porównywana z serwerem (większe traktujemy jako różne).
const MAX_FONT: usize = 32 * 1024 * 1024;

fn ext_of(n: &str) -> String {
    n.rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default()
}
fn is_font(n: &str) -> bool {
    matches!(ext_of(n).as_str(), "ttf" | "otf" | "woff" | "woff2")
}

/// Jak umieszczono plik: `same` – był już pod tą nazwą, `reused` – ta sama treść pod inną nazwą,
/// `new` / `renamed` – wysłany (pod tą samą / inną nazwą).
#[derive(Debug, PartialEq)]
pub enum Placed {
    Same(String),
    Reused(String),
    New(String),
    Renamed(String),
}
impl Placed {
    pub fn name(&self) -> &str {
        match self {
            Placed::Same(n) | Placed::Reused(n) | Placed::New(n) | Placed::Renamed(n) => n,
        }
    }
}

/// Reguły plików paczki (`cgpack.assetPlacer`) wobec jednego serwera; jedna instancja na całą wysyłkę.
pub struct Placer<'a, R: Remote> {
    remote: &'a R,
    /// nazwa małymi literami → nazwa (Windows i macOS nie rozróżniają wielkości liter)
    taken: HashMap<String, String>,
    /// czcionki na serwerze z treścią (wczytane przy pierwszej czcionce)
    fonts: Option<Vec<(String, Vec<u8>)>>,
}

impl<'a, R: Remote> Placer<'a, R> {
    pub fn new(remote: &'a R, existing: &[String]) -> Self {
        let taken = existing
            .iter()
            .map(|n| (n.to_lowercase(), n.clone()))
            .collect();
        Placer {
            remote,
            taken,
            fonts: None,
        }
    }

    fn same_remote(&self, name: &str, data: &[u8]) -> bool {
        // +1: klient zgłasza przekroczenie limitu już przy treści równej limitowi
        self.remote
            .get(name, data.len() + 1)
            .is_some_and(|d| d == data)
    }

    pub fn place(&mut self, from: &str, data: &[u8]) -> Result<Placed, String> {
        let want =
            crate::store::safe_name(from).ok_or_else(|| format!("niedozwolona nazwa {from}"))?;
        if data.is_empty() {
            return Err(format!("{from}: pusty plik"));
        }
        let lc = want.to_lowercase();
        let (stem, ext) = want.rsplit_once('.').unwrap_or((want.as_str(), ""));
        let (stem, ext) = (
            stem.to_string(),
            if ext.is_empty() {
                String::new()
            } else {
                format!(".{ext}")
            },
        );
        if is_font(&want) {
            if self.fonts.is_none() {
                let names: Vec<String> = self
                    .taken
                    .values()
                    .filter(|n| is_font(n))
                    .cloned()
                    .collect();
                let list = names
                    .into_iter()
                    .filter_map(|n| self.remote.get(&n, MAX_FONT).map(|d| (n, d)))
                    .collect();
                self.fonts = Some(list);
            }
            let fonts = self.fonts.as_deref().unwrap_or_default();
            let mut hits: Vec<&String> = fonts
                .iter()
                .filter(|(n, d)| ext_of(n) == ext_of(&want) && d.as_slice() == data)
                .map(|(n, _)| n)
                .collect();
            hits.sort_by_key(|n| n.to_lowercase() != lc); // najpierw ta sama nazwa
            if let Some(n) = hits.first() {
                return Ok(if n.to_lowercase() == lc {
                    Placed::Same((*n).clone())
                } else {
                    Placed::Reused((*n).clone())
                });
            }
        }
        let mut target = want.clone();
        if let Some(cur) = self.taken.get(&lc).cloned() {
            if !is_font(&want) && self.same_remote(&cur, data) {
                return Ok(Placed::Same(cur));
            }
            // wcześniejsza kopia pod nazwą `nazwa_N.ext` (np. poprzednia wysyłka) – użyj jej zamiast kolejnej
            let mut i = 2;
            loop {
                let keep = 120usize.saturating_sub(ext.len() + i.to_string().len() + 1);
                let cand = format!("{}_{i}{ext}", &stem[..stem.len().min(keep)]);
                match self.taken.get(&cand.to_lowercase()).cloned() {
                    Some(n) => {
                        if !is_font(&want) && self.same_remote(&n, data) {
                            return Ok(Placed::Reused(n));
                        }
                    }
                    None => {
                        target = cand;
                        break;
                    }
                }
                i += 1;
            }
        }
        let got = self.remote.put(&target, data)?;
        self.taken.insert(got.to_lowercase(), got.clone());
        if is_font(&got) {
            if let Some(f) = self.fonts.as_mut() {
                f.push((got.clone(), data.to_vec()));
            }
        }
        Ok(if got == from {
            Placed::New(got)
        } else {
            Placed::Renamed(got)
        })
    }
}

/// Podmienia nazwy plików w scenie (jak `cgpack.renameAssets`): teksty równe nazwie i odnośniki `/assets/<nazwa>`.
/// Nazwy są bezpieczne (`safe_name`), więc w adresie wyglądają tak samo jak w tekście.
pub fn rename_assets(v: &mut Value, map: &HashMap<String, String>) {
    if map.is_empty() {
        return;
    }
    match v {
        Value::String(s) => {
            if let Some(n) = map.get(s.as_str()) {
                *s = n.clone();
            } else if s.contains("/assets/") {
                let mut out = String::with_capacity(s.len());
                let mut rest = s.as_str();
                while let Some(i) = rest.find("/assets/") {
                    out.push_str(&rest[..i + 8]);
                    rest = &rest[i + 8..];
                    let end = rest
                        .find(|c: char| {
                            matches!(c, '"' | '\'' | ')' | '?' | '#') || c.is_whitespace()
                        })
                        .unwrap_or(rest.len());
                    match map.get(&rest[..end]) {
                        Some(n) => out.push_str(n),
                        None => out.push_str(&rest[..end]),
                    }
                    rest = &rest[end..];
                }
                out.push_str(rest);
                *s = out;
            }
        }
        Value::Array(a) => a.iter_mut().for_each(|x| rename_assets(x, map)),
        Value::Object(o) => o.values_mut().for_each(|x| rename_assets(x, map)),
        _ => {}
    }
}

/// Wysyła zasoby wg reguł plików i scenę (z odnośnikami do plików na serwerze). `expect` – zapamiętana rewizja
/// na serwerze (konflikt → błąd zaczynający się od „konflikt”), `overwrite` – świadome nadpisanie bez sprawdzania rewizji.
pub fn send<R: Remote>(
    srv: &Server,
    placer: &mut Placer<R>,
    scene: &Value,
    assets: &[(String, Vec<u8>)],
    expect: Option<f64>,
    overwrite: bool,
) -> Result<Sent, String> {
    let id = scene["id"].as_str().ok_or("scena bez id")?;
    let (mut uploaded, mut skipped, mut renamed) = (vec![], vec![], vec![]);
    let mut map = HashMap::new();
    for (name, data) in assets {
        let p = placer.place(name, data)?;
        if p.name() != name {
            map.insert(name.clone(), p.name().to_string());
            renamed.push((name.clone(), p.name().to_string()));
        }
        match p {
            Placed::Same(n) | Placed::Reused(n) => skipped.push(n),
            Placed::New(n) | Placed::Renamed(n) => uploaded.push(n),
        }
    }
    let mut body = scene.clone();
    rename_assets(&mut body, &map);
    match (overwrite, expect) {
        (false, Some(rev)) => body["rev"] = json!(rev),
        _ => {
            if let Some(o) = body.as_object_mut() {
                o.remove("rev");
            }
        }
    }
    let text = body.to_string();
    let r = srv.call(
        "PUT",
        &format!("/api/scenes/{}", crate::url_escape(id)),
        Some(("application/json", text.as_bytes())),
        MAX_SHOW,
    )?;
    match r.status {
        200 => Ok(Sent {
            rev: r.json()?["rev"].as_f64().unwrap_or(0.0),
            uploaded,
            skipped,
            renamed,
        }),
        409 => Err(format!(
            "konflikt: scena zmieniona na serwerze ({})",
            r.error()
        )),
        _ => Err(r.error()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn statuses() {
        let r = json!({ "id": "a", "rev": 3.0 });
        assert_eq!(status(None, None), "new");
        assert_eq!(status(None, Some(2.0)), "new");
        assert_eq!(status(Some(&r), Some(3.0)), "same");
        assert_eq!(status(Some(&r), Some(2.0)), "changed");
        assert_eq!(status(Some(&r), None), "foreign");
    }

    /// Atrapa serwera: katalog zasobów z regułą nazw serwera.
    struct Fake(std::cell::RefCell<HashMap<String, Vec<u8>>>);
    impl Fake {
        fn new(files: &[(&str, &[u8])]) -> Self {
            Fake(std::cell::RefCell::new(
                files
                    .iter()
                    .map(|(n, d)| (n.to_string(), d.to_vec()))
                    .collect(),
            ))
        }
        fn names(&self) -> Vec<String> {
            let mut v: Vec<String> = self.0.borrow().keys().cloned().collect();
            v.sort();
            v
        }
    }
    impl Remote for Fake {
        fn get(&self, name: &str, max: usize) -> Option<Vec<u8>> {
            self.0
                .borrow()
                .get(name)
                .filter(|d| d.len() <= max)
                .cloned()
        }
        fn put(&self, name: &str, data: &[u8]) -> Result<String, String> {
            let n = crate::store::safe_name(name).ok_or("nazwa")?;
            self.0.borrow_mut().insert(n.clone(), data.to_vec());
            Ok(n)
        }
    }

    #[test]
    fn placer_rules() {
        let srv = Fake::new(&[("Oswald_Bold.woff2", b"FONT"), ("logo.png", b"IMG1")]);
        let mut p = Placer::new(&srv, &srv.names());
        // czcionka już na serwerze pod inną nazwą → istniejąca, nic nie wysłane
        assert_eq!(
            p.place("kopia.woff2", b"FONT").unwrap(),
            Placed::Reused("Oswald_Bold.woff2".into())
        );
        // ta sama nazwa i treść → pominięta
        assert_eq!(
            p.place("logo.png", b"IMG1").unwrap(),
            Placed::Same("logo.png".into())
        );
        // zajęta nazwa (też inną wielkością liter), inna treść → nowa nazwa, stary plik nietknięty
        assert_eq!(
            p.place("Logo.png", b"IMG2").unwrap(),
            Placed::Renamed("Logo_2.png".into())
        );
        assert_eq!(srv.get("logo.png", 99).unwrap(), b"IMG1");
        // ponowna wysyłka tej samej treści → wcześniejsza kopia, nie kolejna
        let mut p2 = Placer::new(&srv, &srv.names());
        assert_eq!(
            p2.place("logo.png", b"IMG2").unwrap(),
            Placed::Reused("Logo_2.png".into())
        );
        // inne rozszerzenie czcionki nie jest łączone
        assert_eq!(
            p2.place("Oswald_Bold.ttf", b"FONT").unwrap(),
            Placed::New("Oswald_Bold.ttf".into())
        );
        assert_eq!(srv.names().len(), 4);
    }

    #[test]
    fn rename_in_scene() {
        let mut s = json!({ "nodes": [{ "props": { "font": "a.ttf", "text": "url(/assets/a.ttf) /assets/a.ttfx" } }], "packAssets": ["a.ttf"] });
        let map = HashMap::from([("a.ttf".to_string(), "b.ttf".to_string())]);
        rename_assets(&mut s, &map);
        assert_eq!(s["nodes"][0]["props"]["font"], "b.ttf");
        assert_eq!(
            s["nodes"][0]["props"]["text"],
            "url(/assets/b.ttf) /assets/a.ttfx"
        );
        assert_eq!(s["packAssets"][0], "b.ttf");
    }
}

//! Wysyłka scen z pracy lokalnej na serwer `vizrs` (VPS, studio). Tylko na serwery z listy zapisanych
//! (okno „Połącz z serwerem”); token bierzemy stamtąd i nie trafia do strony.
//!
//! Rewizje: serwer numeruje `rev` każdej sceny osobno. Po udanej wysyłce zapamiętujemy rewizję sceny na serwerze
//! (`deploy.json` w katalogu danych). Kolejna wysyłka podaje ją serwerowi – gdy ktoś zmienił scenę na serwerze
//! w międzyczasie, serwer odpowiada 409 i scena czeka na świadome „nadpisz”. Zasoby sceny: wysyłane tylko te,
//! których na serwerze nie ma (istniejącego pliku o tej samej nazwie nie nadpisujemy).

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
}

/// Wysyła zasoby (brakujące na serwerze) i scenę. `expect` – zapamiętana rewizja na serwerze (konflikt → błąd
/// zaczynający się od „konflikt”), `overwrite` – świadome nadpisanie bez sprawdzania rewizji.
pub fn send(
    srv: &Server,
    scene: &Value,
    assets: &[(String, Vec<u8>)],
    remote_assets: &[String],
    expect: Option<f64>,
    overwrite: bool,
) -> Result<Sent, String> {
    let id = scene["id"].as_str().ok_or("scena bez id")?;
    let (mut uploaded, mut skipped) = (vec![], vec![]);
    for (name, data) in assets {
        if remote_assets.contains(name) {
            skipped.push(name.clone());
            continue;
        }
        let r = srv.call(
            "POST",
            &format!("/api/assets?name={}", crate::url_escape(name)),
            Some(("application/octet-stream", data)),
            MAX_SMALL,
        )?;
        if r.status != 200 {
            return Err(format!("zasób {name}: {}", r.error()));
        }
        uploaded.push(name.clone());
    }
    let mut body = scene.clone();
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
}

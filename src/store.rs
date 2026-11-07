//! Lokalny magazyn Artist: show (`show.json`), zasoby (`assets/`), presety animacji (`animpresets.json`)
//! w katalogu danych. Ten sam układ plików i te same reguły co w serwerze `vizrs` (rewizje `rev`, konflikt
//! przy rozbieżnej rewizji, bezpieczne nazwy zasobów, zapis atomowy), więc katalog można później otworzyć
//! serwerem. Artist tworzy tylko sceny – strony, playlisty i rundowny należą do Trio i zostają nietknięte.

use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde_json::{json, Value};

/// Rodzaje obiektów show (jak w serwerze); Artist zmienia tylko `scenes`.
pub const KINDS: [&str; 5] = ["scenes", "pages", "playlists", "rundowns", "macros"];
const ASSET_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "mp4", "webm", "ttf", "otf", "woff", "woff2",
];
/// Łączny rozmiar katalogu zasobów (jak w serwerze).
const MAX_ASSETS_TOTAL: u64 = 2 * 1024 * 1024 * 1024;
const MAX_ID: usize = 100;
const MAX_NAME: usize = 200;
const MAX_PRESETS: usize = 500;
/// Kopie zapasowe show: nie częściej niż co tyle, najwyżej tyle plików.
const BACKUP_EVERY: Duration = Duration::from_secs(300);
const BACKUPS_KEPT: usize = 20;
pub const NOT_IN_ARTIST: &str =
    "strony, playlisty i rundowny należą do Trio (VizRS CG System) – Artist tworzy tylko sceny";

pub struct Store {
    dir: PathBuf,
    show: Value,
    id_ctr: u64,
    last_backup: Option<SystemTime>,
}

fn now_ms() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0)
}

fn rev(v: &Value) -> f64 {
    v["rev"].as_f64().unwrap_or(0.0)
}

fn normalize(mut show: Value) -> Value {
    if !show["rev"].is_number() {
        show["rev"] = json!(0);
    }
    if !show["name"].is_string() {
        show["name"] = json!("Artist");
    }
    for k in KINDS {
        if !show[k].is_array() {
            show[k] = json!([]);
        }
    }
    show
}

fn text_ok(v: &Value, what: &str, max: usize) -> Result<(), String> {
    match v {
        Value::Null => Ok(()),
        Value::String(s) if s.chars().count() <= max && !s.chars().any(char::is_control) => Ok(()),
        _ => Err(format!(
            "{what}: tekst do {max} znaków bez znaków sterujących"
        )),
    }
}

/// Podstawowa kontrola sceny. Pełna walidacja (jak w serwerze) – po wydzieleniu `vizrs-model` (LUKI).
pub fn check_scene(s: &Value) -> Result<(), String> {
    if !s.is_object() {
        return Err("scena musi być obiektem".into());
    }
    text_ok(&s["id"], "scena.id", MAX_ID)?;
    text_ok(&s["name"], "scena.name", MAX_NAME)?;
    if !(s["nodes"].is_null() || s["nodes"].is_array()) {
        return Err("scena.nodes musi być listą".into());
    }
    for k in ["width", "height"] {
        if let Some(n) = s.get(k).filter(|v| !v.is_null()) {
            if !n.as_f64().is_some_and(|n| (1.0..=16_384.0).contains(&n)) {
                return Err(format!("scena.{k}: liczba 1–16384"));
            }
        }
    }
    Ok(())
}

fn check_show(s: &Value) -> Result<(), String> {
    if !s.is_object() {
        return Err("show musi być obiektem".into());
    }
    text_ok(&s["name"], "show.name", MAX_NAME)?;
    for k in KINDS {
        if !(s[k].is_null() || s[k].is_array()) {
            return Err(format!("show.{k} musi być listą"));
        }
    }
    s["scenes"]
        .as_array()
        .map(|l| l.iter().try_for_each(check_scene))
        .unwrap_or(Ok(()))
}

/// Nazwa zasobu jak w serwerze: litery ASCII, cyfry, `.`, `-`, `_`; bez kropek na początku.
pub fn safe_name(name: &str) -> Option<String> {
    let n: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let n = n.trim_start_matches('.').to_string();
    (!n.is_empty() && n.len() <= 120).then_some(n)
}

impl Store {
    /// Otwiera (albo zakłada) magazyn. Uszkodzony `show.json` = błąd – nie nadpisujemy pracy użytkownika.
    pub fn open(dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(dir.join("assets"))
            .map_err(|e| format!("{}: {e}", dir.display()))?;
        let path = dir.join("show.json");
        let show = match std::fs::read_to_string(&path) {
            Ok(t) => {
                let v: Value = serde_json::from_str(&t).map_err(|e| {
                    format!(
                        "{} jest uszkodzony ({e}). Kopie zapasowe: {}",
                        path.display(),
                        dir.join("kopie").display()
                    )
                })?;
                check_show(&v).map_err(|e| format!("{}: {e}", path.display()))?;
                v
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => json!({}),
            Err(e) => return Err(format!("{}: {e}", path.display())),
        };
        Ok(Self {
            dir: dir.to_path_buf(),
            show: normalize(show),
            id_ctr: 0,
            last_backup: None,
        })
    }

    pub fn show(&self) -> &Value {
        &self.show
    }

    fn new_id(&mut self, prefix: &str) -> String {
        self.id_ctr += 1;
        format!("{prefix}{:x}{:x}", now_ms() % 0xffff_ffff, self.id_ctr)
    }

    fn backup(&mut self) {
        let now = SystemTime::now();
        if self
            .last_backup
            .is_some_and(|t| now.duration_since(t).unwrap_or_default() < BACKUP_EVERY)
        {
            return;
        }
        let src = self.dir.join("show.json");
        if !src.is_file() {
            return;
        }
        let dir = self.dir.join("kopie");
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let secs = now
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if std::fs::copy(&src, dir.join(format!("show-{secs}.json"))).is_ok() {
            self.last_backup = Some(now);
        }
        let mut old: Vec<PathBuf> = std::fs::read_dir(&dir)
            .map(|rd| {
                rd.flatten()
                    .map(|e| e.path())
                    .filter(|p| {
                        p.file_name()
                            .and_then(|n| n.to_str())
                            .is_some_and(|n| n.starts_with("show-") && n.ends_with(".json"))
                    })
                    .collect()
            })
            .unwrap_or_default();
        old.sort();
        let excess = old.len().saturating_sub(BACKUPS_KEPT);
        for p in old.into_iter().take(excess) {
            std::fs::remove_file(p).ok();
        }
    }

    fn save(&mut self) -> Result<(), String> {
        self.backup();
        let text = serde_json::to_string_pretty(&self.show).map_err(|e| e.to_string())?;
        crate::paths::write_atomic(&self.dir.join("show.json"), &text)
            .map_err(|e| format!("zapis na dysk nieudany: {e}"))
    }

    fn bump(&mut self) {
        self.show["rev"] = json!(rev(&self.show) + 1.0);
    }

    /// Podmienia cały show (import). Rozbieżny `rev` = konflikt, chyba że `force`.
    pub fn put_show(&mut self, show: Value, force: bool) -> Result<(), String> {
        check_show(&show)?;
        let sent = show["rev"].as_f64();
        let cur = rev(&self.show);
        if let Some(r) = sent.filter(|r| !force && *r != cur) {
            return Err(format!(
                "konflikt: show zmieniony w międzyczasie (rev {r} ≠ {cur}); użyj force=1, by nadpisać"
            ));
        }
        let mut show = normalize(show);
        show["rev"] = json!(cur + 1.0);
        self.show = show;
        self.save()
    }

    /// Dodaje albo podmienia scenę. `rev` sceny różny od zapisanego = konflikt (ktoś zmienił ją w międzyczasie).
    pub fn upsert(&mut self, kind: &str, mut item: Value) -> Result<Value, String> {
        if kind != "scenes" {
            return Err(NOT_IN_ARTIST.into());
        }
        check_scene(&item)?;
        if item["id"].as_str().is_none_or(str::is_empty) {
            item["id"] = json!(self.new_id("s"));
        }
        let id = item["id"].as_str().unwrap_or_default().to_string();
        let list = self.show["scenes"].as_array_mut().ok_or("show bez scen")?;
        let existing = list.iter().position(|x| x["id"].as_str() == Some(&id));
        let have = existing.map(|i| rev(&list[i]));
        if let (Some(have), Some(sent)) = (have, item["rev"].as_f64()) {
            if have != sent {
                return Err(format!(
                    "konflikt: obiekt zmieniony w międzyczasie (rev {sent} ≠ {have})"
                ));
            }
        }
        item["rev"] = json!(have.unwrap_or(0.0) + 1.0);
        match existing {
            Some(i) => list[i] = item.clone(),
            None => list.push(item.clone()),
        }
        self.bump();
        self.save()?;
        Ok(item)
    }

    /// Usuwa scenę; jak w serwerze kaskadowo strony z tym szablonem i ich pozycje w playlistach/rundownach.
    pub fn delete(&mut self, kind: &str, id: &str) -> Result<(), String> {
        if kind != "scenes" {
            return Err(NOT_IN_ARTIST.into());
        }
        let mut removed: Vec<String> = vec![];
        if let Some(pages) = self.show["pages"].as_array_mut() {
            pages.retain(|p| {
                let keep = p["scene"].as_str() != Some(id);
                if !keep {
                    removed.push(p["id"].as_str().unwrap_or_default().to_string());
                }
                keep
            });
        }
        if let Some(list) = self.show["scenes"].as_array_mut() {
            list.retain(|s| s["id"].as_str() != Some(id));
        }
        for k in ["playlists", "rundowns"] {
            for pl in self.show[k].as_array_mut().into_iter().flatten() {
                if let Some(items) = pl["items"].as_array_mut() {
                    items.retain(|it| !removed.iter().any(|r| it["page"].as_str() == Some(r)));
                }
            }
        }
        self.bump();
        self.save()
    }

    /// Zapisana scena (do wysyłki na serwer – wysyłamy to, co jest na dysku, nie stan edytora).
    pub fn scene(&self, id: &str) -> Option<Value> {
        self.show["scenes"]
            .as_array()?
            .iter()
            .find(|s| s["id"].as_str() == Some(id))
            .cloned()
    }

    fn deploy_file(&self) -> PathBuf {
        self.dir.join("deploy.json")
    }

    /// Rewizje scen na serwerze `url` po ostatniej udanej wysyłce: `{id: rev}`.
    pub fn deployed(&self, url: &str) -> Value {
        std::fs::read_to_string(self.deploy_file())
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .map(|v| v[url].clone())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}))
    }

    pub fn set_deployed(&self, url: &str, id: &str, rev: f64) -> Result<(), String> {
        let mut all = std::fs::read_to_string(self.deploy_file())
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| json!({}));
        if !all[url].is_object() {
            all[url] = json!({});
        }
        all[url][id] = json!(rev);
        crate::paths::write_atomic(&self.deploy_file(), &all.to_string())
            .map_err(|e| format!("zapis na dysk nieudany: {e}"))
    }

    pub fn anim_presets(&self) -> Value {
        std::fs::read_to_string(self.dir.join("animpresets.json"))
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .filter(Value::is_array)
            .unwrap_or_else(|| json!([]))
    }

    pub fn put_anim_presets(&self, list: Value) -> Result<Value, String> {
        let items = list.as_array().ok_or("presety: lista")?;
        if items.len() > MAX_PRESETS || !items.iter().all(Value::is_object) {
            return Err(format!("presety: do {MAX_PRESETS} obiektów"));
        }
        let text = serde_json::to_string_pretty(&list).map_err(|e| e.to_string())?;
        crate::paths::write_atomic(&self.dir.join("animpresets.json"), &text)
            .map_err(|e| format!("zapis na dysk nieudany: {e}"))?;
        Ok(list)
    }

    fn assets_dir(&self) -> PathBuf {
        self.dir.join("assets")
    }

    pub fn assets(&self) -> Value {
        let mut names: Vec<String> = std::fs::read_dir(self.assets_dir())
            .map(|rd| {
                rd.flatten()
                    .filter(|e| e.path().is_file())
                    .filter_map(|e| e.file_name().into_string().ok())
                    .filter(|n| safe_name(n).as_deref() == Some(n.as_str()))
                    .collect()
            })
            .unwrap_or_default();
        names.sort();
        Value::Array(
            names
                .into_iter()
                .map(|n| json!({ "name": n, "url": format!("/assets/{n}") }))
                .collect(),
        )
    }

    pub fn put_asset(&self, name: &str, data: &[u8]) -> Result<Value, String> {
        let name = safe_name(name).ok_or("podaj ?name=plik.png")?;
        if data.is_empty() {
            return Err("pusty plik".into());
        }
        let ext = name.rsplit_once('.').map(|(_, e)| e.to_ascii_lowercase());
        if !ext.as_deref().is_some_and(|e| ASSET_EXT.contains(&e)) {
            return Err(format!(
                "niedozwolony typ pliku (dozwolone: {})",
                ASSET_EXT.join(", ")
            ));
        }
        let total: u64 = std::fs::read_dir(self.assets_dir())
            .map(|rd| {
                rd.flatten()
                    .filter_map(|e| e.metadata().ok())
                    .map(|m| m.len())
                    .sum()
            })
            .unwrap_or(0);
        if total + data.len() as u64 > MAX_ASSETS_TOTAL {
            return Err("przekroczony limit rozmiaru katalogu assets".into());
        }
        let p = self.assets_dir().join(&name);
        let tmp = self.assets_dir().join(format!(".{name}.tmp"));
        std::fs::write(&tmp, data)
            .and_then(|_| std::fs::rename(&tmp, &p))
            .map_err(|e| e.to_string())?;
        Ok(json!({ "name": name, "url": format!("/assets/{name}") }))
    }

    pub fn delete_asset(&self, name: &str) {
        if let Some(n) = safe_name(name) {
            std::fs::remove_file(self.assets_dir().join(n)).ok();
        }
    }

    /// Treść zasobu (tylko pliki o bezpiecznej nazwie z `assets/`).
    pub fn asset(&self, name: &str) -> Option<Vec<u8>> {
        let n = safe_name(name).filter(|n| n == name)?;
        std::fs::read(self.assets_dir().join(n)).ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "vizrs-cg-artist-store-{tag}-{}",
            std::process::id()
        ));
        std::fs::remove_dir_all(&d).ok();
        d
    }

    #[test]
    fn scenes_revisions_and_conflicts() {
        let d = tmp("rev");
        let mut s = Store::open(&d).unwrap();
        assert_eq!(s.show()["scenes"], json!([]));
        let a = s.upsert("scenes", json!({ "name": "Belka" })).unwrap();
        let id = a["id"].as_str().unwrap().to_string();
        assert_eq!(a["rev"], json!(1.0));
        let b = s
            .upsert("scenes", json!({ "id": id, "name": "Belka 2", "rev": 1.0 }))
            .unwrap();
        assert_eq!(b["rev"], json!(2.0));
        let e = s
            .upsert("scenes", json!({ "id": id, "rev": 1.0 }))
            .unwrap_err();
        assert!(e.starts_with("konflikt"), "{e}");
        // bez rev = świadome nadpisanie (strona: zapis „mimo to”)
        assert!(s.upsert("scenes", json!({ "id": id, "name": "x" })).is_ok());
        // zapisane na dysku, odczyt po ponownym otwarciu
        let again = Store::open(&d).unwrap();
        assert_eq!(again.show()["scenes"][0]["name"], json!("x"));
        assert_eq!(again.show()["rev"], s.show()["rev"]);
        std::fs::remove_dir_all(d).ok();
    }

    #[test]
    fn trio_objects_are_not_created_but_kept() {
        let d = tmp("trio");
        let mut s = Store::open(&d).unwrap();
        assert_eq!(
            s.upsert("pages", json!({ "scene": "x" })).unwrap_err(),
            NOT_IN_ARTIST
        );
        s.put_show(
            json!({ "scenes": [{ "id": "s1" }, { "id": "s2" }], "pages": [{ "id": "p1", "scene": "s1" }, { "id": "p2", "scene": "s2" }],
                    "playlists": [{ "id": "l", "items": [{ "page": "p1" }, { "page": "p2" }] }] }),
            true,
        )
        .unwrap();
        s.delete("scenes", "s1").unwrap();
        assert_eq!(s.show()["pages"], json!([{ "id": "p2", "scene": "s2" }]));
        assert_eq!(s.show()["playlists"][0]["items"], json!([{ "page": "p2" }]));
        std::fs::remove_dir_all(d).ok();
    }

    #[test]
    fn show_conflict_and_bad_input() {
        let d = tmp("show");
        let mut s = Store::open(&d).unwrap();
        s.put_show(json!({ "scenes": [] }), false).unwrap();
        assert!(s
            .put_show(json!({ "scenes": [], "rev": 0 }), false)
            .unwrap_err()
            .starts_with("konflikt"));
        assert!(s.put_show(json!({ "scenes": [], "rev": 1 }), false).is_ok());
        assert!(s.put_show(json!([]), true).is_err());
        assert!(s.put_show(json!({ "scenes": [1] }), true).is_err());
        assert!(s.upsert("scenes", json!({ "id": "a\u{0}" })).is_err());
        assert!(s.upsert("scenes", json!({ "width": 1e9 })).is_err());
        // uszkodzony plik nie jest nadpisywany pustym show
        std::fs::write(d.join("show.json"), "{zły").unwrap();
        assert!(Store::open(&d).is_err());
        assert_eq!(
            std::fs::read_to_string(d.join("show.json")).unwrap(),
            "{zły"
        );
        std::fs::remove_dir_all(d).ok();
    }

    #[test]
    fn assets_are_confined() {
        let d = tmp("assets");
        let s = Store::open(&d).unwrap();
        assert_eq!(
            s.put_asset("../../x.png", b"x").unwrap()["name"],
            json!("_.._x.png")
        );
        assert!(s.put_asset("a.html", b"<script>").is_err());
        assert!(s.put_asset("a.js", b"x").is_err());
        assert!(s.put_asset("bez", b"x").is_err());
        assert!(s.put_asset("a.png", b"").is_err());
        assert!(s.put_asset("Logo.PNG", b"png").is_ok());
        assert_eq!(s.asset("Logo.PNG").unwrap(), b"png");
        assert!(s.asset("../show.json").is_none());
        assert_eq!(s.assets().as_array().unwrap().len(), 2);
        s.delete_asset("Logo.PNG");
        assert!(s.asset("Logo.PNG").is_none());
        std::fs::remove_dir_all(d).ok();
    }

    #[test]
    fn deploy_revisions_per_server() {
        let d = tmp("deploy");
        let mut s = Store::open(&d).unwrap();
        s.upsert("scenes", json!({ "id": "a", "name": "A" }))
            .unwrap();
        assert_eq!(s.scene("a").unwrap()["name"], json!("A"));
        assert!(s.scene("b").is_none());
        assert_eq!(s.deployed("https://x"), json!({}));
        s.set_deployed("https://x", "a", 4.0).unwrap();
        s.set_deployed("https://y", "a", 1.0).unwrap();
        assert_eq!(s.deployed("https://x"), json!({ "a": 4.0 }));
        assert_eq!(s.deployed("https://y")["a"], json!(1.0));
        std::fs::remove_dir_all(d).ok();
    }

    #[test]
    fn presets_and_backups() {
        let d = tmp("presets");
        let mut s = Store::open(&d).unwrap();
        assert_eq!(s.anim_presets(), json!([]));
        assert!(s.put_anim_presets(json!({})).is_err());
        assert!(s.put_anim_presets(json!([1])).is_err());
        s.put_anim_presets(json!([{ "id": "a", "name": "Wjazd" }]))
            .unwrap();
        assert_eq!(s.anim_presets()[0]["name"], json!("Wjazd"));
        s.upsert("scenes", json!({})).unwrap();
        s.upsert("scenes", json!({})).unwrap();
        // pierwsza kopia przed drugim zapisem (pliku nie było przed pierwszym), kolejne najwyżej co 5 min
        assert_eq!(std::fs::read_dir(d.join("kopie")).unwrap().count(), 1);
        std::fs::remove_dir_all(d).ok();
    }
}

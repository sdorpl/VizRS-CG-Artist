//! VizRS CG Artist – samodzielny edytor grafik i animacji pakietu VizRS na Tauri 2 (Linux, Windows, macOS).
//!
//! Strona Artist (kanwa `renderer.js`, panele) zostaje w JS i jest wkompilowana (`web`). Okno ładuje ją zawsze
//! z serwera strony w procesie (`local`): z magazynem lokalnym (praca bez serwera) albo jako pośrednik do serwera
//! `vizrs` (token zostaje w oknie). Okno daje to, czego przeglądarka nie ma: menu, systemowe „Zapisz jako”,
//! pytanie przy zamknięciu, kopię roboczą, jedną instancję, skojarzenia plików, okno „Połącz z serwerem”.
//! Strona nie ma dostępu do systemu – tylko komunikaty z białej listy (`bridge`) przez komendę `ipc`.
//! Trio i wyjście należą do VizRS CG System i nie są tu dostarczane.

mod bridge;
mod client;
mod connect;
mod deploy;
mod http;
mod local;
mod paths;
mod server;
mod store;
mod web;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, PageLoadEvent};
use tauri::{
    AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_dialog::DialogExt;

/// Największy plik przekazywany stronie (paczka, obraz).
const MAX_FILE: u64 = 512 * 1024 * 1024;
/// Po takim czasie bez odpowiedzi strony kolejne zamknięcie nie pyta.
const CLOSE_PATIENCE: Duration = Duration::from_secs(5);
const RELEASES: &str = "https://github.com/sdorpl/VizRS-CG-Artist/releases";
/// Klucz w `window.json`.
const STATE_KEY: &str = "cg-artist";
const CONNECT: &str = "connect";
const LOCAL_NOTE: &str = "praca lokalna (bez serwera)";
const NOT_CONNECTED: &str = "nie połączono – wybierz serwer (Plik → Połącz z serwerem)";
/// Komendy menu wysyłane do strony (`__vizrsCmd`): akcja, etykieta (skróty edycji obsługuje strona).
const PAGE_CMDS: &[(&str, &str)] = &[
    ("new", "Nowa scena"),
    ("save", "Zapisz (Ctrl+S)"),
    ("export", "Eksportuj scenę…"),
    ("pack", "Paczka .cgpack…"),
    ("deploy", "Wyślij na serwer…"),
    ("undo", "Cofnij (Ctrl+Z)"),
    ("redo", "Ponów (Ctrl+Y)"),
    ("dup", "Duplikuj (Ctrl+D)"),
    ("del", "Usuń (Delete)"),
    ("fit", "Dopasuj kanwę (Shift+1)"),
    ("z100", "Kanwa 100% (Shift+2)"),
    ("zsel", "Kanwa do zaznaczenia (Shift+3)"),
    ("play", "Odtwórz / zatrzymaj (Spacja)"),
    ("marker", "Dodaj marker (M)"),
];
/// Most strony: `window.__vizrsPost(tekst)` → komenda `ipc`. `window.ipc` należy w Tauri do wry/Tauri
/// (niezapisywalny), więc strona (`web/native.js`) i okno połączenia wołają `__vizrsPost`.
const IPC_SHIM: &str = r#"(() => {
  window.__vizrsPost = (m) => { window.__TAURI_INTERNALS__.invoke('ipc', { body: String(m) }).catch((e) => console.error('ipc', e)); };
  window.__vizrsShell = { version: '__VERSION__', app: 'cg-artist' };
})();"#;

/// Kodowanie identyfikatora w adresie.
fn url_escape(s: &str) -> String {
    s.bytes()
        .map(|b| {
            if b.is_ascii_alphanumeric() || b"-_.".contains(&b) {
                (b as char).to_string()
            } else {
                format!("%{b:02X}")
            }
        })
        .collect()
}

/// Gdzie pracuje okno.
#[derive(Clone, PartialEq, Debug)]
enum Mode {
    /// magazyn lokalny na katalogu danych
    Local,
    /// serwer vizrs (zdalny albo na katalogu danych) przez pośrednika
    Remote { url: String, token: Option<String> },
    /// `connect` przed wyborem
    None,
}

/// Stan okna Artist zgłaszany przez stronę.
#[derive(Default)]
struct Win {
    dirty: bool,
    undo: bool,
    redo: bool,
    scene: Option<String>,
    /// kiedy zapytano stronę o zamknięcie
    asked: Option<Instant>,
    /// plik do przekazania po wczytaniu strony
    pending: Option<PathBuf>,
    /// strona zgodziła się zamknąć okno
    closing: bool,
    zoom: f64,
}

struct App {
    mode: Mode,
    note: String,
    data: PathBuf,
    user_token: Option<String>,
    /// magazyn lokalny (żyje, póki program działa – blokada katalogu; zwalniany w `RunEvent::Exit`)
    store: Option<local::Local>,
    /// pośrednik do serwera (osobny przy każdym przełączeniu)
    proxy: Option<local::Local>,
    probe: Option<(String, PathBuf)>,
    wins: HashMap<String, Win>,
    focused: Option<String>,
    next: u32,
    quitting: bool,
    undo_item: Option<MenuItem<tauri::Wry>>,
    redo_item: Option<MenuItem<tauri::Wry>>,
}

type Shared = Mutex<App>;
/// Pobrania w toku: adres → plik tymczasowy (macOS nie podaje ścieżki w zdarzeniu końca).
type Downloads = Mutex<HashMap<String, PathBuf>>;

impl App {
    /// Serwer strony dla bieżącego trybu: (baza, sekret).
    fn page_server(&self) -> Option<(&str, &str)> {
        let l = match self.mode {
            Mode::Local => self.store.as_ref(),
            Mode::Remote { .. } => self.proxy.as_ref(),
            Mode::None => None,
        }?;
        Some((l.base.as_str(), l.secret.as_str()))
    }

    /// Adres strony Artist; w pracy lokalnej wraca do ostatniej sceny.
    fn start_url(&self) -> Option<String> {
        let (base, secret) = self.page_server()?;
        let mut url = format!("{base}/artist?token={secret}");
        if self.mode == Mode::Local {
            if let Some(s) = paths::load(STATE_KEY).scene {
                url.push_str(&format!("&scene={}", url_escape(&s)));
            }
        }
        Some(url)
    }

    fn title(&self) -> String {
        match &self.mode {
            Mode::Remote { url, .. } => format!(
                "VizRS CG Artist – {}",
                url.split("://").nth(1).unwrap_or(url)
            ),
            _ => "VizRS CG Artist".into(),
        }
    }

    /// Klucz kopii roboczej: katalog danych (praca lokalna) albo adres serwera – port serwera strony jest losowy.
    fn draft_key(&self) -> String {
        match &self.mode {
            Mode::Remote { url, .. } => url.clone(),
            _ => {
                let d = std::fs::canonicalize(&self.data).unwrap_or_else(|_| self.data.clone());
                format!("lokalny:{}", d.display())
            }
        }
    }

    /// Okno Artist, do którego trafiają komendy menu: aktywne, inaczej dowolne.
    fn target_label(&self) -> Option<String> {
        self.focused
            .clone()
            .filter(|l| self.wins.contains_key(l))
            .or_else(|| self.wins.keys().next().cloned())
    }
}

fn state(app: &AppHandle) -> std::sync::MutexGuard<'_, App> {
    app.state::<Shared>()
        .inner()
        .lock()
        .unwrap_or_else(|p| p.into_inner())
}

fn eval_in(app: &AppHandle, label: &str, js: &str) {
    if let Some(w) = app.get_webview_window(label) {
        let _ = w.eval(js);
    }
}

fn error(app: &AppHandle, msg: &str) {
    eprintln!("{msg}");
    app.dialog()
        .message(msg.to_string())
        .title("VizRS CG Artist")
        .show(|_| {});
}

/// Adres albo katalog w programie systemowym.
fn open_external(target: &str) {
    #[cfg(target_os = "windows")]
    let r = std::process::Command::new("explorer").arg(target).spawn();
    #[cfg(target_os = "macos")]
    let r = std::process::Command::new("open").arg(target).spawn();
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let r = std::process::Command::new("xdg-open").arg(target).spawn();
    if let Err(e) = r {
        eprintln!("nie mogę otworzyć {target}: {e}");
    }
}

// ------------------------------------------------------------------ argumenty

#[derive(Debug, Clone, Copy, PartialEq)]
enum Kind {
    Artist,
    Connect,
}

struct Args {
    kind: Kind,
    data: PathBuf,
    token: Option<String>,
    connect: Option<String>,
    local: bool,
    probe: Option<(PathBuf, PathBuf)>,
    file: Option<PathBuf>,
}

fn help() -> &'static str {
    "vizrs-cg-artist – VizRS CG Artist, edytor grafik i animacji VizRS (Tauri 2)

Użycie: vizrs-cg-artist [connect] [opcje] [PLIK]   (connect – najpierw wybór serwera; PLIK .cgpack albo .vizrs.json – import)

  --data KAT      katalog danych Artist (VIZRS_ARTIST_DATA; domyślnie katalog danych użytkownika/vizrs-cg-artist)
  --token T       token serwera (VIZRS_TOKEN)
  --connect URL   serwer zdalny, np. https://cg.example.pl (VIZRS_CONNECT)
  --local         praca lokalna, nawet gdy zapisano łączenie z serwerem przy uruchomieniu

Bez serwera: sceny, zasoby i presety w katalogu danych (show.json, assets/). Gdy na tym katalogu działa serwer
vizrs, okno dołącza do niego. Trio i wyjście dla OBS – VizRS CG System."
}

fn parse_args(argv: &[String]) -> Result<Args, String> {
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
    let mut a = Args {
        kind: Kind::Artist,
        data: env("VIZRS_ARTIST_DATA")
            .map(PathBuf::from)
            .unwrap_or_else(paths::default_data),
        token: env("VIZRS_TOKEN"),
        connect: env("VIZRS_CONNECT"),
        local: false,
        probe: None,
        file: None,
    };
    let (mut pj, mut po) = (None, None);
    let mut i = 0;
    while i < argv.len() {
        let flag = argv[i].clone();
        let mut val = || -> Result<String, String> {
            i += 1;
            argv.get(i).cloned().ok_or(format!("{flag}: brak wartości"))
        };
        match flag.as_str() {
            "artist" => a.kind = Kind::Artist,
            "connect" => a.kind = Kind::Connect,
            "--data" => a.data = PathBuf::from(val()?),
            "--token" => a.token = Some(val()?),
            "--connect" => a.connect = Some(val()?),
            "--local" => a.local = true,
            // narzędzie testowe: po wczytaniu strony wykonaj skrypt, zapisz wynik `probe:…`, zakończ
            "--probe" => pj = Some(PathBuf::from(val()?)),
            "--probe-out" => po = Some(PathBuf::from(val()?)),
            "--help" | "-h" => {
                println!("{}", help());
                std::process::exit(0);
            }
            "--version" | "-V" => {
                println!("vizrs-cg-artist {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            // macOS dopisuje przy pierwszym uruchomieniu z Findera `-psn_…`
            o if o.starts_with("-psn_") => {}
            o if !o.starts_with('-') && Path::new(o).is_file() => a.file = Some(PathBuf::from(o)),
            o => return Err(format!("nieznany argument {o} (vizrs-cg-artist --help)")),
        }
        i += 1;
    }
    if let Some(c) = &a.connect {
        a.connect = Some(connect::normalize_url(c).map_err(|e| format!("--connect: {e}"))?);
    }
    a.probe = match (pj, po) {
        (Some(j), Some(o)) => Some((j, o)),
        (None, None) => None,
        _ => return Err("--probe i --probe-out podaje się razem".into()),
    };
    Ok(a)
}

// ------------------------------------------------------------------ tryb pracy

/// Praca lokalna: serwer `vizrs` działający na katalogu danych (jeden zapisujący na `show.json` – okno dołącza
/// przez pośrednika) albo magazyn lokalny.
fn start_local(app: &AppHandle) -> Result<(), String> {
    let (data, token, has_store) = {
        let a = state(app);
        (a.data.clone(), a.user_token.clone(), a.store.is_some())
    };
    if !has_store {
        if let Some(addr) = server::running_server(&data, token.as_deref())? {
            let url = format!("http://{addr}");
            let proxy = local::start_remote(&url, token.clone())?;
            let mut a = state(app);
            a.proxy = Some(proxy);
            a.mode = Mode::Remote { url, token };
            a.note =
                format!("dołączono do serwera vizrs, który pracuje na katalogu danych ({addr})");
            return Ok(());
        }
        let l = local::start(&data)?;
        state(app).store = Some(l);
    }
    let mut a = state(app);
    a.mode = Mode::Local;
    a.note = LOCAL_NOTE.into();
    Ok(())
}

fn start_remote(
    app: &AppHandle,
    url: String,
    token: Option<String>,
    note: String,
) -> Result<(), String> {
    let proxy = local::start_remote(&url, token.clone())?;
    let mut a = state(app);
    a.proxy = Some(proxy);
    a.mode = Mode::Remote { url, token };
    a.note = note;
    Ok(())
}

// ------------------------------------------------------------------ okna

fn script() -> String {
    IPC_SHIM.replace("__VERSION__", env!("CARGO_PKG_VERSION"))
}

fn open_artist(app: &AppHandle, pending: Option<PathBuf>) {
    let (url, title, label) = {
        let mut a = state(app);
        let Some(url) = a.start_url() else {
            drop(a);
            return open_connect(app);
        };
        a.next += 1;
        let label = format!("artist-{}", a.next);
        a.wins.insert(
            label.clone(),
            Win {
                pending,
                zoom: 1.0,
                ..Default::default()
            },
        );
        (url, a.title(), label)
    };
    let st = paths::load(STATE_KEY);
    let parsed = match url.parse() {
        Ok(u) => u,
        Err(_) => return error(app, "zły adres strony"),
    };
    let (w, h) = st.size.unwrap_or((1600.0, 900.0));
    let app_dl = app.clone();
    let built = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(parsed))
        .title(&title)
        .inner_size(w, h)
        // Artist to stanowisko pracy – bez zapisanego wyglądu od razu na cały ekran
        .maximized(st.maximized.unwrap_or(true))
        .initialization_script(script())
        .devtools(true)
        .on_download(move |_, ev| on_download(&app_dl, ev))
        .on_page_load(|w, p| {
            if p.event() == PageLoadEvent::Finished {
                page_loaded(w.app_handle(), w.label());
            }
        })
        .build();
    match built {
        Ok(w) => {
            if let Some(z) = st.zoom.filter(|z| (*z - 1.0).abs() > 0.01) {
                let _ = w.set_zoom(z);
                if let Some(win) = state(app).wins.get_mut(&label) {
                    win.zoom = z;
                }
            }
            let _ = w.set_focus();
            spell_pl(&w);
        }
        Err(e) => {
            state(app).wins.remove(&label);
            error(app, &format!("Nie udało się otworzyć okna: {e}"));
        }
    }
}

/// Pisownia polska w polach tekstowych (Linux: WebKitGTK + enchant; Windows/macOS: słownik systemu WebView).
fn spell_pl(w: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    let _ = w.with_webview(|pv| {
        use webkit2gtk::{WebContextExt, WebViewExt};
        if let Some(ctx) = pv.inner().context() {
            ctx.set_spell_checking_enabled(true);
            ctx.set_spell_checking_languages(&["pl_PL"]);
        }
    });
    #[cfg(not(target_os = "linux"))]
    let _ = w;
}

fn page_loaded(app: &AppHandle, label: &str) {
    let (probe, pending) = {
        let mut a = state(app);
        let probe = a.probe.as_ref().map(|(c, _)| c.clone());
        let pending = a.wins.get_mut(label).and_then(|w| w.pending.take());
        (probe, pending)
    };
    if let Some(code) = probe {
        eval_in(app, label, &code);
    }
    if let Some(p) = pending {
        send_file(app, label, &p);
    }
}

fn open_connect(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(CONNECT) {
        let _ = w.set_focus();
        return;
    }
    let data = {
        let a = state(app);
        let (current, token, local): (String, Option<String>, Option<&str>) = match &a.mode {
            Mode::Remote { url, token } => (url.clone(), token.clone(), None),
            Mode::Local => ("lokalnie".into(), None, Some("lokalnie")),
            Mode::None => (String::new(), None, None),
        };
        connect::page_data(&connect::Saved::load(), &current, token.as_deref(), local)
    };
    let built = WebviewWindowBuilder::new(app, CONNECT, WebviewUrl::App("connect.html".into()))
        .title("VizRS CG Artist – połącz z serwerem")
        .inner_size(560.0, 600.0)
        .initialization_script(format!("{}\n{data}", script()))
        .build();
    match built {
        Ok(w) => {
            let _ = w.set_focus();
            let probe = state(app).probe.as_ref().map(|(c, _)| c.clone());
            if let Some(code) = probe {
                // okno połączenia też dostaje sondę (test w działaniu)
                let w2 = w.clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(600));
                    let _ = w2.eval(&code);
                });
            }
        }
        Err(e) => error(app, &format!("Nie udało się otworzyć okna połączenia: {e}")),
    }
}

fn close_connect(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(CONNECT) {
        let _ = w.destroy();
    }
}

fn conn_error(app: &AppHandle, msg: &str) {
    eval_in(
        app,
        CONNECT,
        &format!(
            "window.__vizrsConnError && window.__vizrsConnError({})",
            Value::from(msg)
        ),
    );
}

/// Przełącza okna Artist na bieżący tryb (okno połączenia się zamyka); bez okien – otwiera Artist.
fn switch(app: &AppHandle) {
    close_connect(app);
    let (url, title, labels) = {
        let a = state(app);
        (
            a.start_url(),
            a.title(),
            a.wins.keys().cloned().collect::<Vec<_>>(),
        )
    };
    if labels.is_empty() {
        return open_artist(app, None);
    }
    let Some(url) = url else { return };
    for l in labels {
        if let Some(w) = app.get_webview_window(&l) {
            let _ = w.set_title(&title);
            let _ = w.eval(format!("location.replace({})", Value::from(url.clone())));
        }
    }
}

/// Przekazuje plik stronie porcjami (strona składa `File` i decyduje o imporcie).
fn send_file(app: &AppHandle, label: &str, path: &Path) {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let data = match std::fs::metadata(path) {
        Ok(m) if m.len() > MAX_FILE => {
            return error(
                app,
                &format!("{name}: plik większy niż {} MB", MAX_FILE / 1024 / 1024),
            )
        }
        _ => std::fs::read(path),
    };
    let data = match data {
        Ok(d) => d,
        Err(e) => return error(app, &format!("{}: {e}", path.display())),
    };
    eval_in(
        app,
        label,
        &format!("window.__vizrsFile.begin({})", Value::from(name)),
    );
    for c in data.chunks(3 * 1024 * 1024) {
        eval_in(
            app,
            label,
            &format!("window.__vizrsFile.chunk('{}')", bridge::base64(c)),
        );
    }
    eval_in(app, label, "window.__vizrsFile.end()");
}

/// Plik trafia do okna Artist: istniejącego albo nowego (po wczytaniu strony).
fn open_file(app: &AppHandle, path: PathBuf) {
    let target = state(app).target_label();
    match target {
        Some(l) => {
            if let Some(w) = app.get_webview_window(&l) {
                let _ = w.set_focus();
            }
            send_file(app, &l, &path);
        }
        None => open_artist(app, Some(path)),
    }
}

/// Prośba kolejnego uruchomienia (wtyczka jednej instancji) albo pliku z Findera.
fn on_remote(app: &AppHandle, argv: &[String]) {
    let args = parse_args(argv).ok();
    if state(app).mode == Mode::None {
        return open_connect(app);
    }
    if let Some(f) = args.as_ref().and_then(|a| a.file.clone()) {
        return open_file(app, f);
    }
    if args.as_ref().is_some_and(|a| a.kind == Kind::Connect) {
        return open_connect(app);
    }
    let target = state(app).target_label();
    match target.and_then(|l| app.get_webview_window(&l)) {
        Some(w) => {
            let _ = w.unminimize();
            let _ = w.set_focus();
        }
        None => open_artist(app, None),
    }
}

// ------------------------------------------------------------------ most

#[tauri::command]
fn ipc(app: AppHandle, webview: tauri::Webview, body: String) {
    if let Some(rest) = body.strip_prefix("probe:") {
        let out = state(&app).probe.as_ref().map(|(_, o)| o.clone());
        if let Some(out) = out {
            if let Err(e) = std::fs::write(&out, rest) {
                eprintln!("{}: {e}", out.display());
            }
            app.exit(0);
        }
        return;
    }
    let label = webview.label().to_string();
    if label == CONNECT {
        return on_conn(&app, &body);
    }
    let Some(rest) = body.strip_prefix("app:") else {
        return;
    };
    // tylko strona z serwera strony tego okna (adres zmienia się przy przełączeniu)
    let from = webview.url().map(|u| u.to_string()).unwrap_or_default();
    let (base, key) = {
        let a = state(&app);
        let Some((base, _)) = a.page_server() else {
            return;
        };
        (base.to_string(), a.draft_key())
    };
    if !from.starts_with(&format!("{base}/")) {
        return;
    }
    let Some(msg) = bridge::parse(rest) else {
        return;
    };
    match msg {
        bridge::Msg::State {
            title,
            dirty,
            undo,
            redo,
            scene,
        } => {
            let draft = {
                let mut a = state(&app);
                let suffix = a
                    .title()
                    .strip_prefix("VizRS CG Artist")
                    .unwrap_or("")
                    .to_string();
                if let Some(w) = app.get_webview_window(&label) {
                    let _ = w.set_title(&format!("{title}{suffix}"));
                }
                let Some(w) = a.wins.get_mut(&label) else {
                    return;
                };
                (w.dirty, w.undo, w.redo) = (dirty, undo, redo);
                let mut draft = None;
                if scene.is_some() && scene != w.scene {
                    w.scene = scene.clone();
                    draft = scene
                        .and_then(|s| std::fs::read_to_string(bridge::draft_path(&key, &s)).ok());
                }
                draft
            };
            if let Some(text) = draft {
                eval_in(
                    &app,
                    &label,
                    &format!(
                        "window.__vizrsCmd && window.__vizrsCmd('draft', {})",
                        Value::from(text)
                    ),
                );
            }
            sync_menu(&app);
        }
        bridge::Msg::Close => {
            let quitting = {
                let mut a = state(&app);
                if let Some(w) = a.wins.get_mut(&label) {
                    w.closing = true;
                }
                a.quitting
            };
            if let Some(w) = app.get_webview_window(&label) {
                let _ = w.close();
            }
            if quitting {
                quit_step(&app);
            }
        }
        bridge::Msg::Stay => {
            let mut a = state(&app);
            a.quitting = false;
            if let Some(w) = a.wins.get_mut(&label) {
                w.asked = None;
            }
        }
        bridge::Msg::Draft { id, data } => {
            let p = bridge::draft_path(&key, &id);
            match data {
                Some(d) => {
                    if let Err(e) = paths::write_atomic(&p, &d) {
                        eprintln!("kopia robocza: {e}");
                    }
                }
                None => {
                    std::fs::remove_file(p).ok();
                }
            }
        }
    }
}

fn on_conn(app: &AppHandle, body: &str) {
    let msg = match connect::parse_msg(body) {
        Ok(m) => m,
        Err(e) => return conn_error(app, &e),
    };
    match msg {
        connect::Msg::Cancel => close_connect(app),
        connect::Msg::Forget(url) => {
            let mut saved = connect::Saved::load();
            saved.forget(&url);
            if let Err(e) = saved.save() {
                conn_error(app, &e);
            }
        }
        connect::Msg::Local => match start_local(app) {
            Ok(()) => switch(app),
            Err(e) => conn_error(app, &e),
        },
        connect::Msg::Connect(mut req) => {
            // puste pole tokenu = token zapamiętany dla tego serwera
            if req.token.is_none() {
                req.token = connect::Saved::load().token_for(&req.url);
            }
            let app = app.clone();
            std::thread::spawn(move || {
                let err = check_server(&req.url, req.token.as_deref()).err();
                let app2 = app.clone();
                let _ = app.run_on_main_thread(move || on_checked(&app2, req, err));
            });
        }
    }
}

fn on_checked(app: &AppHandle, req: connect::Request, err: Option<String>) {
    if let Some(e) = err {
        return conn_error(app, &e);
    }
    let connect::Request {
        url,
        token,
        keep_token,
        auto,
    } = req;
    let mut saved = connect::Saved::load();
    saved.remember(&url, token.as_deref(), keep_token, auto);
    if let Err(e) = saved.save() {
        eprintln!("zapis listy serwerów: {e}");
    }
    match start_remote(
        app,
        url,
        token,
        "serwer zdalny (Plik → Połącz z serwerem)".into(),
    ) {
        Ok(()) => switch(app),
        Err(e) => conn_error(app, &e),
    }
}

/// Przed przełączeniem: `GET /api/state` z tokenem (`http://` i `https://`) – dostępność, token, czy to VizRS.
fn check_server(url: &str, token: Option<&str>) -> Result<(), String> {
    let r = client::request(
        url,
        "GET",
        "/api/state",
        token,
        None,
        1024 * 1024,
        Duration::from_secs(5),
    )?;
    match r.status {
        200 if r.json().is_ok_and(|v| v.is_object()) => Ok(()),
        200 => Err(format!("{url} odpowiada, ale to nie jest serwer VizRS")),
        401 => Err(if token.is_some() {
            "Serwer odrzucił token.".into()
        } else {
            "Serwer wymaga tokenu.".into()
        }),
        403 => Err("Ten token nie pozwala edytować (to token wyjścia OBS?).".into()),
        code => Err(format!("{url}: odpowiedź HTTP {code}")),
    }
}

// ------------------------------------------------------------------ zamykanie

/// Zamknięcie okna Artist: ze zmianami pyta przez stronę (ona zna stan i umie zapisać); strona bez odpowiedzi
/// nie zatrzyma okna na zawsze. `true` = wstrzymaj zamknięcie.
fn close_request(app: &AppHandle, label: &str) -> bool {
    let mut a = state(app);
    let Some(w) = a.wins.get_mut(label) else {
        return false;
    };
    let waited = w.asked.is_some_and(|t| t.elapsed() >= CLOSE_PATIENCE);
    if w.dirty && !w.closing && !waited {
        if w.asked.is_none() {
            w.asked = Some(Instant::now());
            drop(a);
            eval_in(
                app,
                label,
                "window.__vizrsCmd && window.__vizrsCmd('close')",
            );
        }
        return true;
    }
    false
}

/// Okno zniknęło: zapamiętaj wygląd (rozmiar, maksymalizacja, powiększenie, scena).
fn window_gone(app: &AppHandle, label: &str, w: &tauri::Window) {
    let win = state(app).wins.remove(label);
    let Some(win) = win else { return };
    let old = paths::load(STATE_KEY);
    let maximized = w.is_maximized().unwrap_or(false);
    let size = w
        .inner_size()
        .ok()
        .zip(w.scale_factor().ok())
        .map(|(s, f)| (s.width as f64 / f, s.height as f64 / f))
        .filter(|(ww, _)| *ww >= 1.0);
    paths::save(
        STATE_KEY,
        &paths::WinState {
            size: if maximized {
                old.size
            } else {
                size.or(old.size)
            },
            pos: old.pos,
            maximized: Some(maximized),
            zoom: Some(win.zoom),
            scene: win.scene.or(old.scene),
        },
    );
}

/// Zakończ: okna bez zmian od razu, ze zmianami po kolei.
fn quit_step(app: &AppHandle) {
    let (clean, asking, next) = {
        let a = state(app);
        let clean: Vec<String> = a
            .wins
            .iter()
            .filter(|(_, w)| !w.dirty || w.closing)
            .map(|(l, _)| l.clone())
            .collect();
        let asking = a.wins.values().any(|w| w.asked.is_some());
        let next = a
            .wins
            .iter()
            .find(|(_, w)| w.dirty && !w.closing)
            .map(|(l, _)| l.clone());
        (clean, asking, next)
    };
    for l in clean {
        if let Some(w) = app.get_webview_window(&l) {
            let _ = w.close();
        }
    }
    close_connect(app);
    if !asking {
        if let Some(l) = next.and_then(|l| app.get_webview_window(&l)) {
            let _ = l.close();
        }
    }
    if state(app).wins.is_empty() {
        app.exit(0);
    }
}

// ------------------------------------------------------------------ pobrania

/// Pobranie strony (eksport, paczka): najpierw do pliku tymczasowego, po zakończeniu systemowe „Zapisz jako”
/// (blokujące okno w wywołaniu zwrotnym pobrania mogłoby zakleszczyć wątek okna).
fn on_download(app: &AppHandle, ev: DownloadEvent<'_>) -> bool {
    match ev {
        DownloadEvent::Requested { url, destination } => {
            let name = destination
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .filter(|n| !n.is_empty())
                .unwrap_or_else(|| {
                    url.path()
                        .rsplit('/')
                        .next()
                        .filter(|n| !n.is_empty())
                        .unwrap_or("vizrs-eksport")
                        .to_string()
                });
            let dir = std::env::temp_dir().join(format!("vizrs-cg-artist-{}", std::process::id()));
            std::fs::create_dir_all(&dir).ok();
            *destination = dir.join(name);
            if let Ok(mut m) = app.state::<Downloads>().lock() {
                m.insert(url.to_string(), destination.clone());
            }
            true
        }
        DownloadEvent::Finished { url, path, success } => {
            let remembered = app
                .state::<Downloads>()
                .lock()
                .ok()
                .and_then(|mut m| m.remove(url.as_str()));
            let Some(tmp) = path.or(remembered) else {
                return true;
            };
            if !success {
                std::fs::remove_file(&tmp).ok();
                error(app, "Nie udało się pobrać pliku ze strony.");
                return true;
            }
            let name = tmp
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let app2 = app.clone();
            app.dialog()
                .file()
                .set_title("Zapisz plik")
                .set_file_name(&name)
                .save_file(move |f| {
                    if let Some(dst) = f.and_then(|f| f.into_path().ok()) {
                        let moved = std::fs::rename(&tmp, &dst)
                            .or_else(|_| std::fs::copy(&tmp, &dst).map(|_| ()));
                        if let Err(e) = moved {
                            error(
                                &app2,
                                &format!("Nie udało się zapisać {}: {e}", dst.display()),
                            );
                        }
                    }
                    std::fs::remove_file(&tmp).ok();
                });
            true
        }
        _ => true,
    }
}

// ------------------------------------------------------------------ menu

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    type Item = dyn tauri::menu::IsMenuItem<tauri::Wry>;
    let item =
        |id: &str, label: &str, accel: Option<&str>| MenuItem::with_id(app, id, label, true, accel);
    let cmd = |id: &str| -> tauri::Result<MenuItem<tauri::Wry>> {
        let label = PAGE_CMDS
            .iter()
            .find(|(i, _)| *i == id)
            .map(|(_, l)| *l)
            .unwrap_or(id);
        item(&format!("page:{id}"), label, None)
    };
    let sep = || PredefinedMenuItem::separator(app);
    let (new, save, import, export, pack, deploy) = (
        cmd("new")?,
        cmd("save")?,
        item("import", "Importuj…", None)?,
        cmd("export")?,
        cmd("pack")?,
        cmd("deploy")?,
    );
    let connect = item("connect", "Połącz z serwerem…", Some("CmdOrCtrl+Shift+K"))?;
    let new_window = item("new-window", "Nowe okno Artist", None)?;
    let close = item("close", "Zamknij okno", Some("CmdOrCtrl+W"))?;
    let quit = item("quit", "Zakończ", Some("CmdOrCtrl+Q"))?;
    let (s1, s2, s3, s4) = (sep()?, sep()?, sep()?, sep()?);
    let file: [&Item; 14] = [
        &new,
        &save,
        &import,
        &export,
        &pack,
        &deploy,
        &s1,
        &connect,
        &s2,
        &new_window,
        &s3,
        &close,
        &s4,
        &quit,
    ];
    let (undo, redo, dup, del) = (cmd("undo")?, cmd("redo")?, cmd("dup")?, cmd("del")?);
    let s5 = sep()?;
    let edit: [&Item; 5] = [&undo, &redo, &s5, &dup, &del];
    let (fit, z100, zsel) = (cmd("fit")?, cmd("z100")?, cmd("zsel")?);
    let reload = item("reload", "Odśwież", Some("F5"))?;
    let full = item("fullscreen", "Pełny ekran", Some("F11"))?;
    let zin = item("zoom-in", "Powiększ", Some("CmdOrCtrl+="))?;
    let zout = item("zoom-out", "Pomniejsz", Some("CmdOrCtrl+-"))?;
    let z0 = item("zoom-reset", "Rozmiar 100%", Some("CmdOrCtrl+0"))?;
    let dev = item(
        "devtools",
        "Narzędzia deweloperskie",
        Some("CmdOrCtrl+Shift+I"),
    )?;
    let (s6, s7, s8) = (sep()?, sep()?, sep()?);
    let view: [&Item; 12] = [
        &fit, &z100, &zsel, &s6, &reload, &full, &s7, &zin, &zout, &z0, &s8, &dev,
    ];
    let (play, marker) = (cmd("play")?, cmd("marker")?);
    let logs = item("logs", "Pokaż logi", None)?;
    let data_dir = item("data-dir", "Otwórz katalog danych", None)?;
    let updates = item("updates", "Sprawdź aktualizacje", None)?;
    let about = item("about", "O programie", None)?;
    let s9 = sep()?;
    let help: [&Item; 5] = [&logs, &data_dir, &s9, &updates, &about];
    // lista rośnie tylko na macOS (menu aplikacji, „Tekst”)
    #[allow(unused_mut, clippy::useless_vec)]
    let mut subs = vec![
        Submenu::with_items(app, "Plik", true, &file)?,
        Submenu::with_items(app, "Edycja", true, &edit)?,
        Submenu::with_items(app, "Widok", true, &view)?,
        Submenu::with_items(app, "Scena", true, &[&play as &Item, &marker])?,
        Submenu::with_items(app, "Pomoc", true, &help)?,
    ];
    // macOS: pierwsze podmenu to menu aplikacji (O programie, Ukryj, Zakończ) + standardowa edycja tekstu
    #[cfg(target_os = "macos")]
    {
        let about_mac = item("about", "O programie VizRS CG Artist", None)?;
        let app_menu = Submenu::with_items(
            app,
            "VizRS CG Artist",
            true,
            &[
                &about_mac as &Item,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, None)?,
                &PredefinedMenuItem::hide_others(app, None)?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::quit(app, None)?,
            ],
        )?;
        let text = Submenu::with_items(
            app,
            "Tekst",
            true,
            &[
                &PredefinedMenuItem::cut(app, None)? as &Item,
                &PredefinedMenuItem::copy(app, None)?,
                &PredefinedMenuItem::paste(app, None)?,
                &PredefinedMenuItem::select_all(app, None)?,
            ],
        )?;
        subs.insert(0, app_menu);
        subs.insert(3, text);
    }
    {
        let mut a = state(app);
        a.undo_item = Some(undo.clone());
        a.redo_item = Some(redo.clone());
    }
    let refs: Vec<&Item> = subs.iter().map(|s| s as &Item).collect();
    Menu::with_items(app, &refs)
}

/// Cofnij / Ponów zgodnie ze stanem aktywnego okna Artist.
fn sync_menu(app: &AppHandle) {
    let a = state(app);
    let w = a.target_label().and_then(|l| a.wins.get(&l));
    let (u, r) = w.map(|w| (w.undo, w.redo)).unwrap_or((false, false));
    if let Some(i) = &a.undo_item {
        let _ = i.set_enabled(u);
    }
    if let Some(i) = &a.redo_item {
        let _ = i.set_enabled(r);
    }
}

fn on_menu(app: &AppHandle, id: &str) {
    let target = state(app).target_label();
    if let Some(cmd) = id.strip_prefix("page:") {
        if let Some(l) = target {
            eval_in(
                app,
                &l,
                &format!("window.__vizrsCmd && window.__vizrsCmd('{cmd}')"),
            );
        }
        return;
    }
    let win = target.as_deref().and_then(|l| app.get_webview_window(l));
    let zoom = |f: fn(f64) -> f64| {
        let (Some(l), Some(w)) = (target.as_deref(), win.as_ref()) else {
            return;
        };
        let z = {
            let mut a = state(app);
            let Some(st) = a.wins.get_mut(l) else { return };
            st.zoom = f(st.zoom).clamp(0.3, 3.0);
            st.zoom
        };
        let _ = w.set_zoom(z);
    };
    match id {
        "new-window" => open_artist(app, None),
        "connect" => open_connect(app),
        "import" => {
            let app2 = app.clone();
            app.dialog()
                .file()
                .set_title("Importuj")
                .add_filter(
                    "Paczka, scena, obraz, czcionka",
                    &[
                        "cgpack", "json", "png", "jpg", "jpeg", "webp", "gif", "svg", "mp4",
                        "webm", "ttf", "otf", "woff", "woff2",
                    ],
                )
                .pick_file(move |f| {
                    if let Some(p) = f.and_then(|f| f.into_path().ok()) {
                        open_file(&app2, p);
                    }
                });
        }
        "close" => {
            if let Some(w) = win {
                let _ = w.close();
            }
        }
        "quit" => {
            state(app).quitting = true;
            quit_step(app);
        }
        "zoom-in" => zoom(|z| z * 1.1),
        "zoom-out" => zoom(|z| z / 1.1),
        "zoom-reset" => zoom(|_| 1.0),
        "reload" => {
            if let Some(w) = win {
                let _ = w.eval("location.reload()");
            }
        }
        "fullscreen" => {
            if let Some(w) = win {
                let _ = w.set_fullscreen(!w.is_fullscreen().unwrap_or(false));
            }
        }
        "devtools" => {
            if let Some(w) = win {
                w.open_devtools();
            }
        }
        "logs" => open_external(&paths::state_dir().to_string_lossy()),
        "data-dir" => {
            let d = state(app).data.clone();
            std::fs::create_dir_all(&d).ok();
            open_external(&std::fs::canonicalize(&d).unwrap_or(d).to_string_lossy());
        }
        "updates" => open_external(RELEASES),
        "about" => {
            let msg = {
                let a = state(app);
                format!(
                    "VizRS CG Artist {} (Tauri {})\nModuły rysowania: VizRS CG System {}\n{}\nDane: {}",
                    env!("CARGO_PKG_VERSION"),
                    tauri::VERSION,
                    web::cg_version(),
                    a.note,
                    a.data.display()
                )
            };
            app.dialog().message(msg).title("O programie").show(|_| {});
        }
        _ => {}
    }
}

// ------------------------------------------------------------------ start

fn main() {
    let argv: Vec<String> = std::env::args().skip(1).collect();
    let args = match parse_args(&argv) {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    };
    let probe = args
        .probe
        .as_ref()
        .map(|(js, out)| match std::fs::read_to_string(js) {
            Ok(code) => (code, out.clone()),
            Err(e) => {
                eprintln!("{}: {e}", js.display());
                std::process::exit(2);
            }
        });
    let auto = if args.connect.is_none() && !args.local {
        connect::Saved::load().auto
    } else {
        None
    };
    let app_state = App {
        mode: Mode::None,
        note: NOT_CONNECTED.into(),
        data: args.data.clone(),
        user_token: args.token.clone(),
        store: None,
        proxy: None,
        probe,
        wins: HashMap::new(),
        focused: None,
        next: 0,
        quitting: false,
        undo_item: None,
        redo_item: None,
    };
    let mut builder = tauri::Builder::default();
    if args.probe.is_none() {
        // jedna instancja: kolejne uruchomienie przekazuje prośbę (plik, okno połączenia) i kończy pracę
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            let argv: Vec<String> = argv.into_iter().skip(1).collect();
            on_remote(app, &argv);
        }));
    }
    let first_kind = args.kind;
    let first_file = args.file.clone();
    let connect_url = args.connect.clone();
    let token = args.token.clone();
    let built = builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(app_state))
        .manage(Downloads::default())
        .invoke_handler(tauri::generate_handler![ipc])
        .setup(move |app| {
            let h = app.handle().clone();
            let menu = build_menu(&h)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()));
            // serwer: zdalny (--connect albo zapisany „przy uruchomieniu”), inaczej praca lokalna
            let started = if let Some(c) = connect_url {
                start_remote(&h, c, token, "serwer zdalny (--connect)".into())
            } else if let Some(a) = auto {
                let t = connect::Saved::load().token_for(&a);
                start_remote(
                    &h,
                    a,
                    t,
                    "serwer zdalny (łączenie przy uruchomieniu; praca lokalna: --local)".into(),
                )
            } else if first_kind == Kind::Connect {
                Ok(())
            } else {
                start_local(&h)
            };
            if let Err(e) = started {
                eprintln!("{e}");
                let h2 = h.clone();
                h.dialog()
                    .message(e)
                    .title("VizRS CG Artist")
                    .show(move |_| h2.exit(1));
                return Ok(());
            }
            if first_kind == Kind::Connect {
                open_connect(&h);
            } else {
                open_artist(&h, first_file);
            }
            Ok(())
        })
        .on_window_event(|w, ev| {
            let label = w.label().to_string();
            let app = w.app_handle();
            match ev {
                WindowEvent::CloseRequested { api, .. } if label != CONNECT => {
                    if close_request(app, &label) {
                        api.prevent_close();
                    }
                }
                WindowEvent::Focused(true) if label != CONNECT => {
                    state(app).focused = Some(label);
                    sync_menu(app);
                }
                WindowEvent::Destroyed => {
                    if label != CONNECT {
                        window_gone(app, &label, w);
                        let quitting = state(app).quitting;
                        if quitting {
                            quit_step(app);
                        }
                    }
                    if app.webview_windows().is_empty() {
                        app.exit(0);
                    }
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!());
    let app = match built {
        Ok(a) => a,
        Err(e) => {
            eprintln!("VizRS CG Artist: {e}");
            std::process::exit(1);
        }
    };
    app.run(|app, ev| match ev {
        // macOS: plik otwarty z Findera (skojarzenie .cgpack) przychodzi jako zdarzenie, nie argument
        #[cfg(target_os = "macos")]
        RunEvent::Opened { urls } => {
            for u in urls {
                if let Ok(p) = u.to_file_path() {
                    open_file(app, p);
                }
            }
        }
        // app.exit() nie zwalnia stanu – blokada katalogu danych musi zniknąć jawnie
        RunEvent::Exit => {
            let mut a = state(app);
            a.store.take();
            a.proxy.take();
        }
        _ => {}
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(v: &[&str]) -> Result<Args, String> {
        parse_args(&v.iter().map(|s| s.to_string()).collect::<Vec<_>>())
    }

    #[test]
    fn command_line() {
        let a = args(&["connect", "--data", "/tmp/x", "--token", "t"]).unwrap();
        assert_eq!(a.kind, Kind::Connect);
        assert_eq!(a.data, PathBuf::from("/tmp/x"));
        assert_eq!(a.token.as_deref(), Some("t"));
        assert_eq!(
            args(&["--connect", "cg.example.pl"])
                .unwrap()
                .connect
                .as_deref(),
            Some("https://cg.example.pl")
        );
        assert!(args(&["--probe", "a.js"]).is_err());
        assert!(args(&["--nieznana"]).is_err());
        assert!(args(&["-psn_0_12345"]).is_ok());
    }

    #[test]
    fn scene_escape() {
        assert_eq!(url_escape("belka-1"), "belka-1");
        assert_eq!(url_escape("a b/ć"), "a%20b%2F%C4%87");
    }

    #[test]
    fn titles_and_draft_keys() {
        let mut a = App {
            mode: Mode::Remote {
                url: "https://cg.example.pl".into(),
                token: None,
            },
            note: String::new(),
            data: PathBuf::from("/nie/ma"),
            user_token: None,
            store: None,
            proxy: None,
            probe: None,
            wins: HashMap::new(),
            focused: None,
            next: 0,
            quitting: false,
            undo_item: None,
            redo_item: None,
        };
        assert_eq!(a.title(), "VizRS CG Artist – cg.example.pl");
        assert_eq!(a.draft_key(), "https://cg.example.pl");
        assert!(a.start_url().is_none(), "bez serwera strony nie ma adresu");
        a.mode = Mode::Local;
        assert_eq!(a.title(), "VizRS CG Artist");
        assert_eq!(a.draft_key(), "lokalny:/nie/ma");
    }
}

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
mod gpu;
mod http;
mod ipc;
mod local;
mod menu;
mod paths;
mod scale;
mod screen;
mod server;
mod store;
mod web;
mod window;

use ipc::*;
use menu::*;
use window::*;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde_json::Value;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, PageLoadEvent};
#[cfg(not(target_os = "linux"))]
use tauri::window::Color;
use tauri::{
    AppHandle, Manager, RunEvent, Theme, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    WindowEvent,
};
use tauri_plugin_dialog::{
    DialogExt, MessageDialogButtons, MessageDialogKind, MessageDialogResult,
};

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
/// Narzędzia deweloperskie WebView: w kompilacji testowej albo z `VIZRS_DEVTOOLS=1` (w zwykłym programie
/// nie ma ich w menu ani w menu kontekstowym – to część przeglądarki, nie edytora).
fn devtools_enabled() -> bool {
    cfg!(debug_assertions) || std::env::var("VIZRS_DEVTOOLS").is_ok_and(|v| v == "1")
}

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
    /// okno ma się pokazać zmaksymalizowane (tworzone niewidoczne – Windows gubi maksymalizację przy pokazaniu)
    maximize: bool,
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
    /// nieudane łączenie przy starcie (--connect, „przy uruchomieniu”): adres i komunikat dla okna połączenia
    start_error: Option<(String, String)>,
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
        .kind(MessageDialogKind::Error)
        .show(|_| {});
}

/// Pytanie strony w systemowym oknie dialogowym (modalnym dla okna strony). Odpowiedź: numer przycisku
/// (`window.__vizrsDialog(id, n)`); zamknięcie okna dialogowego = ostatni przycisk („anuluj”).
fn ask(
    app: &AppHandle,
    label: &str,
    id: u32,
    kind: bridge::Kind,
    title: String,
    text: String,
    buttons: Vec<String>,
) {
    let last = buttons.len().saturating_sub(1);
    let reply = {
        let app = app.clone();
        let label = label.to_string();
        move |n: usize| {
            eval_in(
                &app,
                &label,
                &format!("window.__vizrsDialog && window.__vizrsDialog({id}, {n})"),
            )
        }
    };
    // test w działaniu: nikt nie kliknie – odpowiedź „anuluj” od razu
    if state(app).probe.is_some() {
        return reply(last);
    }
    let title = if title.is_empty() {
        "VizRS CG Artist".to_string()
    } else {
        title
    };
    let mut b = buttons.clone().into_iter();
    let first = b.next().unwrap_or_else(|| "OK".into());
    let kinds = match buttons.len() {
        1 => MessageDialogButtons::OkCustom(first),
        2 => MessageDialogButtons::OkCancelCustom(first, b.next().unwrap_or_default()),
        _ => MessageDialogButtons::YesNoCancelCustom(
            first,
            b.next().unwrap_or_default(),
            b.next().unwrap_or_default(),
        ),
    };
    let mut d = app
        .dialog()
        .message(text)
        .title(title)
        .kind(match kind {
            bridge::Kind::Info => MessageDialogKind::Info,
            bridge::Kind::Warning => MessageDialogKind::Warning,
            bridge::Kind::Error => MessageDialogKind::Error,
        })
        .buttons(kinds);
    if let Some(w) = app.get_webview_window(label) {
        d = d.parent(&w);
    }
    d.show_with_result(move |r| {
        let n = match r {
            MessageDialogResult::Custom(s) => buttons.iter().position(|b| *b == s).unwrap_or(last),
            MessageDialogResult::Ok | MessageDialogResult::Yes => 0,
            MessageDialogResult::No if buttons.len() == 3 => 1,
            _ => last,
        };
        reply(n);
    });
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

Użycie: vizrs-cg-artist [connect] [opcje] [PLIK]   (connect – najpierw wybór serwera; PLIK .cgpack albo dawny .vizrs.json – import)

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
    a.proxy = None; // pośrednik do poprzedniego serwera przestaje nasłuchiwać
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

// ------------------------------------------------------------------ start

fn main() {
    // akceleracja WebKitGTK: zmienne środowiska przed startem GTK i przed powstaniem wątków (gpu.rs)
    let gpu_note = gpu::prepare(None);
    if !gpu_note.is_empty() {
        eprintln!("GPU: {gpu_note}");
    }
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
        start_error: None,
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
        .invoke_handler(tauri::generate_handler![ipc::ipc])
        .setup(move |app| {
            let h = app.handle().clone();
            // interfejs jest ciemny, więc i to, co rysuje system: Linux – ciemny wariant motywu GTK (pasek menu,
            // okna dialogowe, „Zapisz jako”; tao stosuje go tylko dla całego programu), Windows – ciemne menu
            // i paski tytułu, macOS – ciemny wygląd programu (także NSAlert, NSSavePanel)
            h.set_theme(Some(Theme::Dark));
            let menu = build_menu(&h)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()));
            // serwer: zdalny (--connect albo zapisany „przy uruchomieniu”), inaczej praca lokalna; zdalny najpierw
            // sprawdzony jak w oknie połączenia – zły token albo brak serwera = okno połączenia z powodem, nie pusty edytor
            let mut first_kind = first_kind;
            let mut remote = |url: String, tok: Option<String>, note: &str| match check_server(
                &url,
                tok.as_deref(),
            ) {
                Ok(()) => start_remote(&h, url, tok, note.into()),
                Err(e) => {
                    eprintln!("{url}: {e}");
                    state(&h).start_error = Some((url, e));
                    first_kind = Kind::Connect;
                    Ok(())
                }
            };
            let started = if let Some(c) = connect_url {
                // bez --token: token zapisany dla tego adresu (albo hosta) – jak w oknie połączenia
                let t = token.or_else(|| connect::Saved::load().token_for_or_host(&c));
                remote(c, t, "serwer zdalny (--connect)")
            } else if let Some(a) = auto {
                let t = connect::Saved::load().token_for_or_host(&a);
                remote(
                    a,
                    t,
                    "serwer zdalny (łączenie przy uruchomieniu; praca lokalna: --local)",
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
            start_error: None,
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

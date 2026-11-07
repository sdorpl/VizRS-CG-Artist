//! VizRS CG Artist – samodzielny edytor grafik i animacji pakietu VizRS: GTK 4 + WebKitGTK 6.0.
//!
//! Strona Artist (kanwa `renderer.js`, panele) zostaje w JS i jest wkompilowana (`web`). Domyślnie pracuje na
//! magazynie lokalnym w procesie okna (`local`, `store`) – bez serwera `vizrs`; serwer zdalny wybiera okno
//! połączenia. Okno daje to, czego przeglądarka nie ma: menu, systemowe „Zapisz jako”, pytanie przy zamknięciu,
//! kopię roboczą, jedną instancję, skojarzenia plików. Strona nie ma dostępu do systemu – tylko komunikaty
//! z białej listy (`bridge`). Trio i wyjście należą do VizRS CG System i nie są tu dostarczane.

mod bridge;
mod client;
mod connect;
mod deploy;
mod desktop;
mod http;
mod instance;
mod local;
mod paths;
mod server;
mod store;
mod web;

use std::cell::RefCell;
use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::time::{Duration, Instant};

use gtk::prelude::*;
use gtk::{gdk, gio, glib};
use serde_json::Value;
use webkit6::prelude::*;

const APP_ID: &str = "pl.vizrs.CgArtist";
const ICON_PNG: &[u8] = include_bytes!("../assets/vizrs-256.png");
/// Największy plik przekazywany stronie (paczka, obraz).
const MAX_FILE: u64 = 512 * 1024 * 1024;
/// Po takim czasie bez odpowiedzi strony kolejne zamknięcie nie pyta.
const CLOSE_PATIENCE: Duration = Duration::from_secs(5);
const RELEASES: &str = "https://github.com/sdorpl/VizRS-CG-Artist/releases";
/// Klucz w `window.json` (osobny od okna `vizrs-shell`).
const STATE_KEY: &str = "cg-artist";
const NOT_CONNECTED: &str = "nie połączono – wybierz serwer (Plik → Połącz z serwerem)";
/// Komendy menu wysyłane do strony (`__vizrsCmd`): akcja, etykieta.
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
/// `window.ipc.postMessage` jak w oknie wry – strony serwera (`native.js`) i okno połączenia mówią tym samym mostem.
const IPC_SHIM: &str = "window.ipc = { postMessage: (m) => window.webkit.messageHandlers.ipc.postMessage(String(m)) }; window.__vizrsPost = (m) => window.ipc.postMessage(m);";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
    gpu: Option<bool>,
    file: Option<PathBuf>,
}

fn help() -> &'static str {
    "vizrs-cg-artist – VizRS CG Artist, edytor grafik i animacji VizRS (GTK 4 + WebKitGTK 6.0)

Użycie: vizrs-cg-artist [connect] [opcje] [PLIK]   (connect – najpierw wybór serwera; PLIK .cgpack albo .vizrs.json – import)

  --data KAT      katalog danych Artist (VIZRS_ARTIST_DATA; domyślnie ~/.local/share/vizrs-cg-artist)
  --token T       token serwera (VIZRS_TOKEN)
  --connect URL   serwer zdalny, np. https://cg.example.pl (VIZRS_CONNECT)
  --local         praca lokalna, nawet gdy zapisano łączenie z serwerem zdalnym przy uruchomieniu
  --gpu TRYB      akceleracja GPU strony: on, off, auto (VIZRS_GPU)
  --probe JS --probe-out JSON   narzędzie testowe: po wczytaniu strony wykonaj skrypt, zapisz wynik, zakończ

Bez serwera: sceny, zasoby i presety w katalogu danych (show.json, assets/). Gdy na tym katalogu działa serwer
vizrs, okno dołącza do niego. Trio i wyjście dla OBS – VizRS CG System."
}

fn parse_args() -> Result<Args, String> {
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
        gpu: match env("VIZRS_GPU").as_deref() {
            Some("on") => Some(true),
            Some("off") => Some(false),
            _ => None,
        },
        file: None,
    };
    let (mut probe_js, mut probe_out) = (None, None);
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let flag = args[i].clone();
        let mut val = || -> Result<String, String> {
            i += 1;
            args.get(i).cloned().ok_or(format!("{flag}: brak wartości"))
        };
        match flag.as_str() {
            "artist" => a.kind = Kind::Artist,
            "connect" => a.kind = Kind::Connect,
            "--data" => a.data = PathBuf::from(val()?),
            "--token" => a.token = Some(val()?),
            "--connect" => a.connect = Some(val()?),
            "--local" => a.local = true,
            "--gpu" => {
                a.gpu = match val()?.as_str() {
                    "on" => Some(true),
                    "off" => Some(false),
                    "auto" => None,
                    _ => return Err("--gpu: podaj on, off albo auto".into()),
                }
            }
            "--probe" => probe_js = Some(PathBuf::from(val()?)),
            "--probe-out" => probe_out = Some(PathBuf::from(val()?)),
            "--help" | "-h" => {
                println!("{}", help());
                std::process::exit(0);
            }
            "--version" | "-V" => {
                println!("vizrs-cg-artist {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            other if !other.starts_with('-') && Path::new(other).is_file() => {
                a.file = Some(PathBuf::from(other))
            }
            other => {
                return Err(format!(
                    "nieznany argument {other} (vizrs-cg-artist --help)"
                ))
            }
        }
        i += 1;
    }
    if let Some(c) = &a.connect {
        a.connect = Some(connect::normalize_url(c).map_err(|e| format!("--connect: {e}"))?);
    }
    a.probe = match (probe_js, probe_out) {
        (Some(j), Some(o)) => Some((j, o)),
        (None, None) => None,
        _ => return Err("--probe i --probe-out podaje się razem".into()),
    };
    Ok(a)
}

/// Adres strony: baza serwera + ścieżka + token.
fn page_url(base: &str, path: &str, token: Option<&str>) -> String {
    match token {
        Some(t) => format!(
            "{base}{path}{}token={t}",
            if path.contains('?') { '&' } else { '?' }
        ),
        None => format!("{base}{path}"),
    }
}

/// Czy adres należy do serwera VizRS okna (inne otwiera przeglądarka systemowa).
fn same_origin(base: &str, u: &str) -> bool {
    u.starts_with(&format!("{base}/"))
        || u == base
        || u.starts_with("about:")
        || u.starts_with("blob:")
        || u.starts_with("data:")
}

/// Kodowanie identyfikatora sceny w adresie.
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

/// Adres albo katalog w programie systemowym.
fn open_external(target: &str) {
    let uri = if target.contains("://") {
        target.to_string()
    } else {
        gio::File::for_path(target).uri().to_string()
    };
    if let Err(e) = gio::AppInfo::launch_default_for_uri(&uri, None::<&gio::AppLaunchContext>) {
        eprintln!("nie mogę otworzyć {target}: {e}");
    }
}

/// Stan okna Artist zgłaszany przez stronę.
#[derive(Default)]
struct PageState {
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
}

struct Win {
    window: gtk::ApplicationWindow,
    view: webkit6::WebView,
    kind: Kind,
    zoom: f64,
    st: PageState,
}

struct App {
    gtk: gtk::Application,
    base: String,
    token: Option<String>,
    /// praca lokalna: adres magazynu w oknie albo serwera `vizrs` na tym katalogu danych
    local: Option<String>,
    local_token: Option<String>,
    /// magazyn lokalny (żyje do końca programu; zwalnia blokadę katalogu)
    store: Option<local::Local>,
    /// token z `--token` / `VIZRS_TOKEN` (do serwera `vizrs` na katalogu danych)
    user_token: Option<String>,
    server_note: String,
    data: PathBuf,
    gpu: Option<bool>,
    probe: Option<(String, PathBuf)>,
    wins: Vec<Win>,
    quitting: bool,
}

type Shared = Rc<RefCell<App>>;

thread_local! {
    /// Wątki pomocnicze (instancja, sprawdzanie serwera) wracają do pętli GTK przez `MainContext::invoke`.
    static APP: RefCell<Option<Shared>> = const { RefCell::new(None) };
}

fn with_app(f: impl FnOnce(&Shared)) {
    let app = APP.with(|a| a.borrow().clone());
    if let Some(a) = app {
        f(&a);
    }
}

fn error_dialog(parent: Option<&gtk::ApplicationWindow>, msg: &str) {
    eprintln!("{msg}");
    gtk::AlertDialog::builder()
        .modal(true)
        .message("VizRS CG Artist")
        .detail(msg)
        .build()
        .show(parent);
}

fn run_js(view: &webkit6::WebView, js: &str) {
    view.evaluate_javascript(js, None, None, None::<&gio::Cancellable>, |_| {});
}

impl App {
    fn title(&self, kind: Kind) -> String {
        match kind {
            Kind::Connect => "VizRS CG Artist – połącz z serwerem".into(),
            Kind::Artist if self.local.as_deref() == Some(self.base.as_str()) => {
                "VizRS CG Artist".into()
            }
            Kind::Artist => format!(
                "VizRS CG Artist – {}",
                self.base.split("://").nth(1).unwrap_or(&self.base)
            ),
        }
    }

    /// Adres Artist; na serwerze lokalnym wraca do ostatniej sceny.
    fn start_url(&self) -> String {
        let url = page_url(&self.base, "/artist", self.token.as_deref());
        let last = (self.local.as_deref() == Some(self.base.as_str()))
            .then(|| paths::load(STATE_KEY).scene)
            .flatten();
        match last {
            Some(s) => format!(
                "{url}{}scene={}",
                if url.contains('?') { '&' } else { '?' },
                url_escape(&s)
            ),
            None => url,
        }
    }

    /// Klucz kopii roboczej: magazyn lokalny ma losowy port, więc liczy się katalog danych, nie adres.
    fn draft_key(&self) -> String {
        match &self.store {
            Some(l) if l.base == self.base => {
                let d = std::fs::canonicalize(&self.data).unwrap_or_else(|_| self.data.clone());
                format!("lokalny:{}", d.display())
            }
            _ => self.base.clone(),
        }
    }

    fn win(&self, w: &gtk::ApplicationWindow) -> Option<&Win> {
        self.wins.iter().find(|x| &x.window == w)
    }

    fn win_mut(&mut self, w: &gtk::ApplicationWindow) -> Option<&mut Win> {
        self.wins.iter_mut().find(|x| &x.window == w)
    }

    fn focused(&self) -> Option<&Win> {
        let active = self.gtk.active_window();
        self.wins
            .iter()
            .find(|w| active.as_ref() == Some(w.window.upcast_ref()))
            .or(self.wins.first())
    }

    fn remember(&self, w: &Win) {
        if w.kind != Kind::Artist {
            return;
        }
        let old = paths::load(STATE_KEY);
        let maximized = w.window.is_maximized();
        let (ww, wh) = (w.window.width() as f64, w.window.height() as f64);
        paths::save(
            STATE_KEY,
            &paths::WinState {
                size: if maximized || ww < 1.0 {
                    old.size
                } else {
                    Some((ww, wh))
                },
                // GTK 4 nie podaje położenia okna (Wayland) – zostaje zapisane wcześniej
                pos: old.pos,
                maximized: Some(maximized),
                zoom: Some(w.zoom),
                scene: w.st.scene.clone().or(old.scene),
            },
        );
    }
}

/// Stan pozycji menu zależnych od strony.
fn sync_actions(app: &App) {
    let w = app.focused();
    let artist = w.is_some_and(|w| w.kind == Kind::Artist);
    for (name, _) in PAGE_CMDS {
        let on = match *name {
            "undo" => artist && w.is_some_and(|w| w.st.undo),
            "redo" => artist && w.is_some_and(|w| w.st.redo),
            _ => artist,
        };
        if let Some(a) = app
            .gtk
            .lookup_action(name)
            .and_downcast::<gio::SimpleAction>()
        {
            a.set_enabled(on);
        }
    }
}

fn section(items: &[(&str, &str)]) -> gio::Menu {
    let m = gio::Menu::new();
    for (action, label) in items {
        m.append(Some(label), Some(&format!("app.{action}")));
    }
    m
}

fn build_menu() -> gio::Menu {
    let menu = gio::Menu::new();
    let file = gio::Menu::new();
    file.append_section(
        None,
        &section(&[
            ("new-window", "Nowe okno Artist"),
            ("connect", "Połącz z serwerem…"),
        ]),
    );
    let s2 = section(&PAGE_CMDS[..5]);
    s2.append(Some("Importuj…"), Some("app.import"));
    file.append_section(None, &s2);
    file.append_section(None, &section(&[("data-dir", "Otwórz katalog danych")]));
    file.append_section(
        None,
        &section(&[("close", "Zamknij okno"), ("quit", "Zakończ")]),
    );
    menu.append_submenu(Some("Plik"), &file);
    menu.append_submenu(Some("Edycja"), &section(&PAGE_CMDS[5..9]));
    let view = gio::Menu::new();
    view.append_section(None, &section(&PAGE_CMDS[9..]));
    view.append_section(
        None,
        &section(&[
            ("zoom-in", "Powiększ"),
            ("zoom-out", "Pomniejsz"),
            ("zoom-reset", "Rozmiar 100%"),
            ("reload", "Odśwież"),
            ("fullscreen", "Pełny ekran"),
            ("devtools", "Narzędzia deweloperskie"),
        ]),
    );
    menu.append_submenu(Some("Widok"), &view);
    menu.append_submenu(
        Some("Pomoc"),
        &section(&[
            ("logs", "Pokaż logi"),
            ("updates", "Sprawdź aktualizacje"),
            ("about", "O programie"),
        ]),
    );
    menu
}

fn add_action(gapp: &gtk::Application, name: &str, accels: &[&str], f: impl Fn(&Shared) + 'static) {
    let a = gio::SimpleAction::new(name, None);
    a.connect_activate(move |_, _| with_app(&f));
    gapp.add_action(&a);
    if !accels.is_empty() {
        gapp.set_accels_for_action(&format!("app.{name}"), accels);
    }
}

fn focused_window(app: &Shared) -> Option<gtk::ApplicationWindow> {
    app.borrow().focused().map(|w| w.window.clone())
}

fn install_actions(gapp: &gtk::Application) {
    // skróty edycji zostają w stronie: akcelerator menu przechwyciłby Ctrl+Z i Ctrl+S także w polach tekstowych
    for (name, _) in PAGE_CMDS {
        let n = name.to_string();
        add_action(gapp, name, &[], move |app| {
            if let Some(w) = app.borrow().focused() {
                run_js(
                    &w.view,
                    &format!("window.__vizrsCmd && window.__vizrsCmd('{n}')"),
                );
            }
        });
    }
    add_action(gapp, "new-window", &[], |app| {
        let url = app.borrow().start_url();
        open_window(app, Kind::Artist, url);
    });
    add_action(gapp, "connect", &["<Control><Shift>k"], open_connect);
    add_action(gapp, "import", &[], |app| {
        let filter = gtk::FileFilter::new();
        filter.set_name(Some("Paczka, scena, obraz, czcionka"));
        for e in [
            "cgpack", "json", "png", "jpg", "jpeg", "webp", "gif", "svg", "mp4", "webm", "ttf",
            "otf", "woff", "woff2",
        ] {
            filter.add_suffix(e);
        }
        let filters = gio::ListStore::new::<gtk::FileFilter>();
        filters.append(&filter);
        let dlg = gtk::FileDialog::builder()
            .title("Importuj")
            .modal(true)
            .filters(&filters)
            .build();
        dlg.open(
            focused_window(app).as_ref(),
            None::<&gio::Cancellable>,
            |r| {
                if let Some(p) = r.ok().and_then(|f| f.path()) {
                    with_app(|app| open_file(app, p));
                }
            },
        );
    });
    add_action(gapp, "data-dir", &[], |app| {
        let d = app.borrow().data.clone();
        open_external(&std::fs::canonicalize(&d).unwrap_or(d).to_string_lossy());
    });
    add_action(gapp, "logs", &[], |_| {
        open_external(&paths::state_dir().to_string_lossy())
    });
    add_action(gapp, "updates", &[], |_| open_external(RELEASES));
    add_action(gapp, "about", &[], |app| {
        let msg = {
            let a = app.borrow();
            format!(
                "vizrs-cg-artist {} (moduły rysowania: VizRS CG System {})\n{}\nDane: {}",
                env!("CARGO_PKG_VERSION"),
                web::cg_version(),
                a.server_note,
                a.data.display()
            )
        };
        gtk::AlertDialog::builder()
            .modal(true)
            .message("O programie")
            .detail(msg)
            .build()
            .show(focused_window(app).as_ref());
    });
    add_action(gapp, "close", &["<Control>w"], |app| {
        if let Some(w) = focused_window(app) {
            w.close();
        }
    });
    add_action(gapp, "quit", &["<Control>q"], |app| {
        app.borrow_mut().quitting = true;
        quit_step(app);
    });
    add_action(gapp, "reload", &["F5"], |app| {
        if let Some(w) = app.borrow().focused() {
            w.view.reload();
        }
    });
    add_action(gapp, "fullscreen", &["F11"], |app| {
        if let Some(w) = focused_window(app) {
            w.set_fullscreened(!w.is_fullscreen());
        }
    });
    for (name, accel) in [
        ("zoom-in", "<Control>equal"),
        ("zoom-out", "<Control>minus"),
        ("zoom-reset", "<Control>0"),
    ] {
        add_action(gapp, name, &[accel], move |app| {
            let Some(win) = focused_window(app) else {
                return;
            };
            let mut a = app.borrow_mut();
            let Some(w) = a.win_mut(&win) else { return };
            w.zoom = match name {
                "zoom-in" => (w.zoom * 1.1).min(3.0),
                "zoom-out" => (w.zoom / 1.1).max(0.3),
                _ => 1.0,
            };
            w.view.set_zoom_level(w.zoom);
        });
    }
    add_action(gapp, "devtools", &["<Control><Shift>i"], |app| {
        if let Some(i) = app.borrow().focused().and_then(|w| w.view.inspector()) {
            i.show();
        }
    });
}

fn current_window() -> Option<gtk::ApplicationWindow> {
    let mut out = None;
    with_app(|app| out = focused_window(app));
    out
}

/// Systemowe „Zapisz jako” dla pobrań strony (eksport sceny, paczka).
fn on_download(d: &webkit6::Download) {
    d.connect_decide_destination(|d, suggested| {
        let name = if suggested.is_empty() {
            "vizrs-eksport".to_string()
        } else {
            suggested.to_string()
        };
        let dlg = gtk::FileDialog::builder()
            .title("Zapisz plik")
            .modal(true)
            .initial_name(name)
            .build();
        let d = d.clone();
        dlg.save(
            current_window().as_ref(),
            None::<&gio::Cancellable>,
            move |r| match r.ok().and_then(|f| f.path()) {
                Some(p) => {
                    d.set_allow_overwrite(true);
                    d.set_destination(&p.to_string_lossy());
                }
                None => d.cancel(),
            },
        );
        true
    });
    d.connect_failed(|_, e| {
        if !e.matches(webkit6::DownloadError::CancelledByUser) {
            error_dialog(
                current_window().as_ref(),
                &format!("Nie udało się zapisać pliku: {e}"),
            );
        }
    });
}

fn script(src: &str) -> webkit6::UserScript {
    webkit6::UserScript::new(
        src,
        webkit6::UserContentInjectedFrames::TopFrame,
        webkit6::UserScriptInjectionTime::Start,
        &[],
        &[],
    )
}

fn open_window(app: &Shared, kind: Kind, url: String) {
    let (gapp, title, gpu, base) = {
        let a = app.borrow();
        (a.gtk.clone(), a.title(kind), a.gpu, a.base.clone())
    };
    let st = if kind == Kind::Artist {
        paths::load(STATE_KEY)
    } else {
        paths::WinState::default()
    };
    let (w, h) = match kind {
        Kind::Connect => (560, 600),
        Kind::Artist => st
            .size
            .map(|(w, h)| (w as i32, h as i32))
            .unwrap_or((1600, 900)),
    };
    let window = gtk::ApplicationWindow::builder()
        .application(&gapp)
        .title(title)
        .default_width(w)
        .default_height(h)
        .show_menubar(kind == Kind::Artist)
        .build();
    // Artist to stanowisko pracy – bez zapisanego wyglądu od razu na cały ekran
    if kind == Kind::Artist && st.maximized.unwrap_or(true) {
        window.maximize();
    }

    let ucm = webkit6::UserContentManager::new();
    ucm.add_script(&script(IPC_SHIM));
    // znacznik okna natywnego: strona chowa zakładki „Artist / Trio / Wyjście” i menu przeglądarki
    ucm.add_script(&script(&format!(
        "window.__vizrsShell = {{ version: '{}', app: 'cg-artist' }};",
        env!("CARGO_PKG_VERSION")
    )));
    if kind == Kind::Connect {
        let a = app.borrow();
        ucm.add_script(&script(&connect::page_data(
            &connect::Saved::load(),
            &a.base,
            a.token.as_deref(),
            a.local.as_deref(),
        )));
    }
    ucm.register_script_message_handler("ipc", None);
    let view = webkit6::WebView::builder()
        .user_content_manager(&ucm)
        .build();
    if let Some(s) = WebViewExt::settings(&view) {
        s.set_enable_developer_extras(true);
        s.set_javascript_can_access_clipboard(true);
        if let Some(on) = gpu {
            s.set_hardware_acceleration_policy(if on {
                webkit6::HardwareAccelerationPolicy::Always
            } else {
                webkit6::HardwareAccelerationPolicy::Never
            });
        }
    }
    // pisownia polska w polach tekstowych (słownik hunspell pl_PL z systemu, przez enchant)
    if let Some(ctx) = view.web_context() {
        ctx.set_spell_checking_enabled(true);
        ctx.set_spell_checking_languages(&["pl_PL"]);
    }
    let zoom = if kind == Kind::Artist {
        st.zoom.unwrap_or(1.0)
    } else {
        1.0
    };
    view.set_zoom_level(zoom);

    // odnośniki poza serwer VizRS i nowe okna otwiera przeglądarka systemowa
    view.connect_decide_policy(move |_, decision, ty| {
        let Some(nd) = decision.downcast_ref::<webkit6::NavigationPolicyDecision>() else {
            return false;
        };
        let uri = nd
            .navigation_action()
            .and_then(|a| a.request())
            .and_then(|r| r.uri())
            .map(|u| u.to_string())
            .unwrap_or_default();
        if ty == webkit6::PolicyDecisionType::NewWindowAction || !same_origin(&base, &uri) {
            if !uri.is_empty() {
                open_external(&uri);
            }
            decision.ignore();
            return true;
        }
        false
    });
    if let Some(ns) = view.network_session() {
        ns.connect_download_started(|_, d| on_download(d));
    }
    let win = window.clone();
    view.connect_load_changed(move |_, ev| {
        if ev == webkit6::LoadEvent::Finished {
            with_app(|app| page_loaded(app, &win));
        }
    });
    let win = window.clone();
    ucm.connect_script_message_received(Some("ipc"), move |_, v| {
        let body = v.to_str().to_string();
        with_app(|app| on_ipc(app, &win, &body));
    });
    let win = window.clone();
    window.connect_close_request(move |_| {
        let mut stop = false;
        with_app(|app| stop = close_request(app, &win));
        if stop {
            glib::Propagation::Stop
        } else {
            glib::Propagation::Proceed
        }
    });
    window.connect_is_active_notify(|_| with_app(|app| sync_actions(&app.borrow())));

    window.set_child(Some(&view));
    if kind == Kind::Connect {
        view.load_html(connect::PAGE, Some("about:blank"));
    } else {
        view.load_uri(&url);
    }
    app.borrow_mut().wins.push(Win {
        window: window.clone(),
        view,
        kind,
        zoom,
        st: PageState::default(),
    });
    window.present();
    sync_actions(&app.borrow());
}

/// Zamknięcie okna: ze zmianami pyta przez stronę (ona zna stan i umie zapisać); strona bez odpowiedzi
/// nie zatrzyma okna na zawsze. `true` = wstrzymaj zamknięcie.
fn close_request(app: &Shared, window: &gtk::ApplicationWindow) -> bool {
    let mut a = app.borrow_mut();
    let Some(w) = a.win_mut(window) else {
        return false;
    };
    let waited = w.st.asked.is_some_and(|t| t.elapsed() >= CLOSE_PATIENCE);
    if w.st.dirty && !w.st.closing && !waited {
        if w.st.asked.is_none() {
            w.st.asked = Some(Instant::now());
            run_js(&w.view, "window.__vizrsCmd && window.__vizrsCmd('close')");
        }
        return true;
    }
    if let Some(i) = a.wins.iter().position(|x| &x.window == window) {
        let w = a.wins.remove(i);
        a.remember(&w);
    }
    false
}

/// Zakończ: okna bez zmian od razu, ze zmianami po kolei.
fn quit_step(app: &Shared) {
    let (clean, asking, next) = {
        let a = app.borrow();
        let clean: Vec<_> = a
            .wins
            .iter()
            .filter(|w| !w.st.dirty)
            .map(|w| w.window.clone())
            .collect();
        let asking = a.wins.iter().any(|w| w.st.asked.is_some());
        let next = a.wins.iter().find(|w| w.st.dirty).map(|w| w.window.clone());
        (clean, asking, next)
    };
    for w in clean {
        w.close();
    }
    if !asking {
        if let Some(w) = next {
            w.close();
        }
    }
}

fn page_loaded(app: &Shared, window: &gtk::ApplicationWindow) {
    let (probe, pending, view) = {
        let mut a = app.borrow_mut();
        let probe = a.probe.as_ref().map(|(c, _)| c.clone());
        let Some(w) = a.win_mut(window) else { return };
        (probe, w.st.pending.take(), w.view.clone())
    };
    if let Some(code) = probe {
        run_js(&view, &code);
    }
    if let Some(p) = pending {
        send_file(&view, &p);
    }
}

/// Most strona → okno. `probe:` – wynik skryptu testowego; okno połączenia – wybór serwera;
/// `app:` – tylko strona Artist z serwera okna.
fn on_ipc(app: &Shared, window: &gtk::ApplicationWindow, body: &str) {
    if let Some(rest) = body.strip_prefix("probe:") {
        let out = app.borrow().probe.as_ref().map(|(_, o)| o.clone());
        if let Some(out) = out {
            if let Err(e) = std::fs::write(&out, rest) {
                eprintln!("{}: {e}", out.display());
            }
            app.borrow().gtk.quit();
        }
        return;
    }
    let (kind, from, base, draft_key) = {
        let a = app.borrow();
        let Some(w) = a.win(window) else { return };
        (
            w.kind,
            w.view.uri().map(|u| u.to_string()).unwrap_or_default(),
            a.base.clone(),
            a.draft_key(),
        )
    };
    if kind == Kind::Connect {
        return on_conn(app, body);
    }
    let Some(rest) = body.strip_prefix("app:") else {
        return;
    };
    if !(from.starts_with("http") && same_origin(&base, &from)) {
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
            {
                let mut a = app.borrow_mut();
                let suffix = a
                    .title(Kind::Artist)
                    .strip_prefix("VizRS CG Artist")
                    .unwrap_or("")
                    .to_string();
                let Some(w) = a.win_mut(window) else { return };
                w.window.set_title(Some(&format!("{title}{suffix}")));
                (w.st.dirty, w.st.undo, w.st.redo) = (dirty, undo, redo);
                if scene.is_some() && scene != w.st.scene {
                    w.st.scene = scene.clone();
                    let saved = scene.and_then(|s| {
                        std::fs::read_to_string(bridge::draft_path(&draft_key, &s)).ok()
                    });
                    if let Some(text) = saved {
                        run_js(
                            &w.view,
                            &format!(
                                "window.__vizrsCmd && window.__vizrsCmd('draft', {})",
                                Value::from(text)
                            ),
                        );
                    }
                }
            }
            sync_actions(&app.borrow());
        }
        bridge::Msg::Close => {
            let quitting = {
                let mut a = app.borrow_mut();
                if let Some(w) = a.win_mut(window) {
                    w.st.closing = true;
                }
                a.quitting
            };
            window.close();
            if quitting {
                quit_step(app);
            }
        }
        bridge::Msg::Stay => {
            let mut a = app.borrow_mut();
            a.quitting = false;
            if let Some(w) = a.win_mut(window) {
                w.st.asked = None;
            }
        }
        bridge::Msg::Draft { id, data } => {
            let p = bridge::draft_path(&draft_key, &id);
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

/// Przekazuje plik stronie porcjami (strona składa `File` i decyduje o imporcie).
fn send_file(view: &webkit6::WebView, path: &Path) {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let data = match std::fs::metadata(path) {
        Ok(m) if m.len() > MAX_FILE => {
            return error_dialog(
                current_window().as_ref(),
                &format!("{name}: plik większy niż {} MB", MAX_FILE / 1024 / 1024),
            )
        }
        _ => std::fs::read(path),
    };
    let data = match data {
        Ok(d) => d,
        Err(e) => {
            return error_dialog(
                current_window().as_ref(),
                &format!("{}: {e}", path.display()),
            )
        }
    };
    run_js(
        view,
        &format!("window.__vizrsFile.begin({})", Value::from(name)),
    );
    for c in data.chunks(3 * 1024 * 1024) {
        run_js(
            view,
            &format!("window.__vizrsFile.chunk('{}')", bridge::base64(c)),
        );
    }
    run_js(view, "window.__vizrsFile.end()");
}

/// Plik trafia do okna Artist: istniejącego albo nowego (po wczytaniu strony).
fn open_file(app: &Shared, path: PathBuf) {
    let found = app
        .borrow()
        .wins
        .iter()
        .find(|w| w.kind == Kind::Artist)
        .map(|w| (w.window.clone(), w.view.clone()));
    if let Some((win, view)) = found {
        win.present();
        return send_file(&view, &path);
    }
    let url = app.borrow().start_url();
    open_window(app, Kind::Artist, url);
    if let Some(w) = app.borrow_mut().wins.last_mut() {
        w.st.pending = Some(path);
    }
}

/// Prośba kolejnego uruchomienia: istniejące okno na wierzch albo nowe.
fn on_remote(app: &Shared, body: &str) {
    let Ok(v) = serde_json::from_str::<Value>(body) else {
        return;
    };
    // serwer jeszcze niewybrany: najpierw okno połączenia
    if app.borrow().base.is_empty() {
        return open_connect(app);
    }
    if let Some(f) = v["file"].as_str() {
        return open_file(app, PathBuf::from(f));
    }
    if v["kind"].as_str() == Some("connect") {
        return open_connect(app);
    }
    let found = app
        .borrow()
        .wins
        .iter()
        .find(|w| w.kind == Kind::Artist)
        .map(|w| w.window.clone());
    match found {
        Some(w) => w.present(),
        None => {
            let url = app.borrow().start_url();
            open_window(app, Kind::Artist, url);
        }
    }
}

fn open_connect(app: &Shared) {
    let found = app
        .borrow()
        .wins
        .iter()
        .find(|w| w.kind == Kind::Connect)
        .map(|w| w.window.clone());
    match found {
        Some(w) => w.present(),
        None => open_window(app, Kind::Connect, String::new()),
    }
}

fn close_connect(app: &Shared) {
    let wins: Vec<_> = app
        .borrow()
        .wins
        .iter()
        .filter(|w| w.kind == Kind::Connect)
        .map(|w| w.window.clone())
        .collect();
    for w in wins {
        w.close();
    }
}

fn conn_error(app: &Shared, msg: &str) {
    let js = format!(
        "window.__vizrsConnError && window.__vizrsConnError({})",
        Value::from(msg)
    );
    for w in app.borrow().wins.iter().filter(|w| w.kind == Kind::Connect) {
        run_js(&w.view, &js);
    }
}

/// Przełącza okna Artist na inny serwer (okno połączenia się zamyka); bez okien – otwiera Artist.
fn switch(app: &Shared, base: String, token: Option<String>, note: String) {
    {
        let mut a = app.borrow_mut();
        a.base = base;
        a.token = token;
        a.server_note = note;
    }
    close_connect(app);
    let (url, title, artists) = {
        let a = app.borrow();
        let artists: Vec<_> = a
            .wins
            .iter()
            .filter(|w| w.kind == Kind::Artist)
            .map(|w| (w.window.clone(), w.view.clone()))
            .collect();
        (a.start_url(), a.title(Kind::Artist), artists)
    };
    if artists.is_empty() {
        open_window(app, Kind::Artist, url);
    } else {
        for (w, v) in artists {
            w.set_title(Some(&title));
            v.load_uri(&url);
        }
    }
    sync_actions(&app.borrow());
}

fn on_conn(app: &Shared, body: &str) {
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
        connect::Msg::Local => {
            let (local, token, data, user_token) = {
                let a = app.borrow();
                (
                    a.local.clone(),
                    a.local_token.clone(),
                    a.data.clone(),
                    a.user_token.clone(),
                )
            };
            let (local, token, note) = match local {
                Some(l) => (l, token, LOCAL_NOTE.to_string()),
                None => match local_work(&data, user_token) {
                    Ok(w) => {
                        let mut a = app.borrow_mut();
                        a.local = Some(w.base.clone());
                        a.local_token = w.token.clone();
                        a.store = w.store;
                        (w.base, w.token, w.note)
                    }
                    Err(e) => return conn_error(app, &e),
                },
            };
            switch(app, local, token, note);
        }
        connect::Msg::Connect(mut req) => {
            // puste pole tokenu = token zapamiętany dla tego serwera
            if req.token.is_none() {
                req.token = connect::Saved::load().token_for(&req.url);
            }
            std::thread::spawn(move || {
                let err = check_server(&req.url, req.token.as_deref()).err();
                glib::MainContext::default()
                    .invoke(move || with_app(|app| on_checked(app, req, err)));
            });
        }
    }
}

fn on_checked(app: &Shared, req: connect::Request, err: Option<String>) {
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
    switch(
        app,
        url,
        token,
        "serwer zdalny (Plik → Połącz z serwerem)".into(),
    );
}

const LOCAL_NOTE: &str = "praca lokalna (bez serwera)";

/// Praca lokalna: serwer `vizrs` działający na tym katalogu danych (jeden zapisujący na `show.json`)
/// albo magazyn lokalny w oknie.
struct LocalWork {
    base: String,
    token: Option<String>,
    note: String,
    store: Option<local::Local>,
}

fn local_work(data: &Path, user_token: Option<String>) -> Result<LocalWork, String> {
    if let Some(addr) = server::running_server(data, user_token.as_deref())? {
        return Ok(LocalWork {
            base: format!("http://{addr}"),
            token: user_token,
            note: format!("dołączono do serwera vizrs, który pracuje na katalogu danych ({addr})"),
            store: None,
        });
    }
    let l = local::start(data)?;
    Ok(LocalWork {
        base: l.base.clone(),
        token: Some(l.secret.clone()),
        note: LOCAL_NOTE.into(),
        store: Some(l),
    })
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

/// Ikona okien: PNG z binarki w katalogu stanu jako motyw ikon.
fn set_icon() {
    let root = paths::state_dir().join("icons");
    let dir = root.join("hicolor/256x256/apps");
    if std::fs::create_dir_all(&dir).is_ok()
        && std::fs::write(dir.join("vizrs.png"), ICON_PNG).is_ok()
    {
        if let Some(display) = gdk::Display::default() {
            gtk::IconTheme::for_display(&display).add_search_path(&root);
        }
        gtk::Window::set_default_icon_name("vizrs");
    }
}

fn main() -> glib::ExitCode {
    let args = match parse_args() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    };

    // pojedyncza instancja: prośba do działającego okna na tym katalogu danych
    let single = args.connect.is_none() && args.probe.is_none();
    if single {
        let file = args
            .file
            .as_ref()
            .and_then(|f| std::fs::canonicalize(f).ok());
        let msg = serde_json::json!({ "kind": if args.kind == Kind::Connect { "connect" } else { "artist" }, "file": file });
        if instance::forward(&args.data, &msg.to_string()) {
            return glib::ExitCode::SUCCESS;
        }
    }
    if args.probe.is_none() {
        desktop::ensure_entry(ICON_PNG);
    }

    let probe = match &args.probe {
        Some((js, out)) => match std::fs::read_to_string(js) {
            Ok(code) => Some((code, out.clone())),
            Err(e) => {
                eprintln!("{}: {e}", js.display());
                std::process::exit(2);
            }
        },
        None => None,
    };

    // serwer zdalny (--connect albo zapisany „przy uruchomieniu”), inaczej praca lokalna
    let auto = if args.connect.is_none() && !args.local {
        connect::Saved::load().auto
    } else {
        None
    };
    let mut token = args.token.clone();
    let remote = |base: String, note: &str| LocalWork {
        base,
        token: None,
        note: note.into(),
        store: None,
    };
    let start: Result<(LocalWork, bool), String> = if let Some(c) = &args.connect {
        Ok((remote(c.clone(), "serwer zdalny (--connect)"), false))
    } else if let Some(a) = auto {
        token = connect::Saved::load().token_for(&a);
        Ok((
            remote(
                a,
                "serwer zdalny (łączenie przy uruchomieniu; praca lokalna: --local)",
            ),
            false,
        ))
    } else if args.kind == Kind::Connect {
        // najpierw wybór: magazyn lokalny powstaje dopiero po „Praca lokalna”
        Ok((remote(String::new(), NOT_CONNECTED), false))
    } else {
        local_work(&args.data, args.token.clone()).map(|w| (w, true))
    };

    // NON_UNIQUE: jedną instancję na katalog danych pilnuje `instance` (gniazdo), nie D-Bus
    let gapp = gtk::Application::builder()
        .application_id(APP_ID)
        .flags(gio::ApplicationFlags::NON_UNIQUE)
        .build();
    let first = args.kind;
    let first_file = args.file.clone();
    let data = args.data.clone();
    let user_token = args.token.clone();
    let gpu = args.gpu;
    let init = RefCell::new(Some((start, token, probe)));
    gapp.connect_activate(move |gapp| {
        let Some((start, token, probe)) = init.borrow_mut().take() else {
            return;
        };
        set_icon();
        gapp.set_menubar(Some(&build_menu()));
        install_actions(gapp);
        let (work, is_local) = match start {
            Ok(s) => s,
            Err(e) => {
                eprintln!("{e}");
                // okno błędu trzyma aplikację przy życiu, dopóki użytkownik go nie zamknie
                let hold = gapp.hold();
                gtk::AlertDialog::builder()
                    .modal(true)
                    .message("VizRS CG Artist")
                    .detail(e.as_str())
                    .build()
                    .choose(None::<&gtk::Window>, None::<&gio::Cancellable>, move |_| {
                        drop(hold)
                    });
                return;
            }
        };
        let token = if is_local { work.token.clone() } else { token };
        let app: Shared = Rc::new(RefCell::new(App {
            gtk: gapp.clone(),
            base: work.base.clone(),
            token,
            local: is_local.then(|| work.base.clone()),
            local_token: if is_local { work.token } else { None },
            store: work.store,
            user_token: user_token.clone(),
            server_note: work.note,
            data: data.clone(),
            gpu,
            probe,
            wins: Vec::new(),
            quitting: false,
        }));
        APP.with(|a| *a.borrow_mut() = Some(app.clone()));
        if single {
            instance::listen(&data, |m| {
                glib::MainContext::default().invoke(move || with_app(|app| on_remote(app, &m)));
            });
        }
        if first == Kind::Connect {
            open_connect(&app);
        } else {
            let url = app.borrow().start_url();
            open_window(&app, Kind::Artist, url);
            if let Some(w) = app.borrow_mut().wins.last_mut() {
                w.st.pending = first_file.clone();
            }
        }
    });
    // argumenty czytamy sami – GTK dostaje tylko nazwę programu
    gapp.run_with_args(&[std::env::args().next().unwrap_or_default()])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn urls_with_token() {
        assert_eq!(page_url("http://h:1", "/artist", None), "http://h:1/artist");
        assert_eq!(
            page_url("http://h:1", "/artist", Some("t")),
            "http://h:1/artist?token=t"
        );
        assert_eq!(
            page_url("http://h:1", "/output?checker=1", Some("t")),
            "http://h:1/output?checker=1&token=t"
        );
    }

    #[test]
    fn origin_check() {
        assert!(same_origin("http://h:1", "http://h:1/artist"));
        assert!(same_origin("http://h:1", "blob:http://h:1/x"));
        assert!(!same_origin("http://h:1", "http://h:12/artist"));
        assert!(!same_origin("http://h:1", "https://example.com/"));
    }

    #[test]
    fn scene_escape() {
        assert_eq!(url_escape("belka-1"), "belka-1");
        assert_eq!(url_escape("a b/ć"), "a%20b%2F%C4%87");
    }
}

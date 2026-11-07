#![allow(dead_code)] // prototyp: część rdzenia (okno połączenia, pamięć okna) jeszcze nieużywana
//! PROTOTYP: VizRS CG Artist na Tauri 2 (Linux, Windows, macOS).
//!
//! Rdzeń bez GUI jest wspólny z oknem GTK (`../../src/*.rs` przez `#[path]`): magazyn lokalny, serwer HTTP,
//! strona `web/`, most (biała lista), wysyłka. Tu tylko okno: strona z magazynu, most `window.ipc.postMessage`
//! → komenda `ipc`, menu, pytanie przy zamknięciu, „Zapisz jako” dla pobrań, otwarcie pliku, jedna instancja,
//! pisownia polska (Linux), `--probe` do testu w działaniu (`tests/e2e/okno.js`).
//! Czego jeszcze nie ma (prototyp): okna „Połącz z serwerem”, pamięci wyglądu okna, wysyłki poza Linuksem.

#[path = "../../../src/bridge.rs"]
mod bridge;
#[cfg(target_os = "linux")]
#[path = "../../../src/client.rs"]
mod client;
#[cfg(not(target_os = "linux"))]
#[path = "client_stub.rs"]
mod client;
#[path = "../../../src/connect.rs"]
mod connect;
#[path = "../../../src/deploy.rs"]
mod deploy;
#[path = "../../../src/http.rs"]
mod http;
#[path = "../../../src/local.rs"]
mod local;
#[path = "../../../src/paths.rs"]
mod paths;
#[path = "../../../src/server.rs"]
mod server;
#[path = "../../../src/store.rs"]
mod store;
#[path = "../../../src/web.rs"]
mod web;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::Value;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::webview::{DownloadEvent, PageLoadEvent};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_dialog::DialogExt;

const MAX_FILE: u64 = 512 * 1024 * 1024;
const LABEL: &str = "artist";
/// Komendy menu wysyłane do strony (`__vizrsCmd`): akcja, etykieta, skrót (tylko opis – skróty edycji zostają w stronie).
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
    ("play", "Odtwórz / zatrzymaj (Spacja)"),
];
/// Most strony: `window.__vizrsPost(tekst)` → komenda Tauri `ipc`. `window.ipc` należy w Tauri do wry/Tauri
/// (niezapisywalny – kanał `invoke`), więc `web/native.js` woła `__vizrsPost`, gdy jest.
const IPC_SHIM: &str = r#"(() => {
  window.__vizrsPost = (m) => { window.__TAURI_INTERNALS__.invoke('ipc', { body: String(m) }).catch((e) => console.error('ipc', e)); };
  window.__vizrsShell = { version: '0.2.0-tauri', app: 'cg-artist' };
})();"#;

/// Kodowanie identyfikatora w adresie (używa `deploy`).
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

#[derive(Default)]
struct PageState {
    dirty: bool,
    scene: Option<String>,
    /// strona zgodziła się zamknąć okno
    closing: bool,
}

struct App {
    base: String,
    draft_key: String,
    probe: Option<(String, PathBuf)>,
    pending: Option<PathBuf>,
    page: PageState,
    /// magazyn lokalny (blokada katalogu) – zwalniany w `RunEvent::Exit`; `None` = dołączono do serwera vizrs
    store: Option<local::Local>,
}

type Shared = Mutex<App>;
/// Pobrania w toku: adres → plik tymczasowy.
type Downloads = Mutex<std::collections::HashMap<String, PathBuf>>;

struct Args {
    data: PathBuf,
    probe: Option<(PathBuf, PathBuf)>,
    file: Option<PathBuf>,
}

fn parse_args() -> Result<Args, String> {
    let mut a = Args {
        data: std::env::var("VIZRS_ARTIST_DATA")
            .ok()
            .filter(|v| !v.is_empty())
            .map(PathBuf::from)
            .unwrap_or_else(paths::default_data),
        probe: None,
        file: None,
    };
    let (mut pj, mut po) = (None, None);
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut i = 0;
    while i < args.len() {
        let flag = args[i].clone();
        let mut val = || {
            i += 1;
            args.get(i).cloned().ok_or(format!("{flag}: brak wartości"))
        };
        match flag.as_str() {
            "--data" => a.data = PathBuf::from(val()?),
            "--probe" => pj = Some(PathBuf::from(val()?)),
            "--probe-out" => po = Some(PathBuf::from(val()?)),
            "--version" => {
                println!("vizrs-cg-artist-tauri {}", env!("CARGO_PKG_VERSION"));
                std::process::exit(0);
            }
            o if !o.starts_with('-') && Path::new(o).is_file() => a.file = Some(PathBuf::from(o)),
            o => return Err(format!("nieznany argument {o}")),
        }
        i += 1;
    }
    a.probe = match (pj, po) {
        (Some(j), Some(o)) => Some((j, o)),
        (None, None) => None,
        _ => return Err("--probe i --probe-out podaje się razem".into()),
    };
    Ok(a)
}

fn eval(app: &AppHandle, js: &str) {
    if let Some(w) = app.get_webview_window(LABEL) {
        let _ = w.eval(js);
    }
}

fn page_cmd(app: &AppHandle, name: &str) {
    eval(
        app,
        &format!("window.__vizrsCmd && window.__vizrsCmd('{name}')"),
    );
}

/// Plik do strony porcjami (strona składa `File` i decyduje o imporcie) – jak w oknie GTK.
fn send_file(app: &AppHandle, path: &Path) {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    let data = match std::fs::metadata(path) {
        Ok(m) if m.len() > MAX_FILE => {
            return error(app, &format!("{name}: plik większy niż 512 MB"))
        }
        _ => std::fs::read(path),
    };
    let data = match data {
        Ok(d) => d,
        Err(e) => return error(app, &format!("{}: {e}", path.display())),
    };
    eval(
        app,
        &format!("window.__vizrsFile.begin({})", Value::from(name)),
    );
    for c in data.chunks(3 * 1024 * 1024) {
        eval(
            app,
            &format!("window.__vizrsFile.chunk('{}')", bridge::base64(c)),
        );
    }
    eval(app, "window.__vizrsFile.end()");
}

fn error(app: &AppHandle, msg: &str) {
    eprintln!("{msg}");
    app.dialog()
        .message(msg.to_string())
        .title("VizRS CG Artist")
        .show(|_| {});
}

/// Most strona → okno (komenda Tauri). Ta sama biała lista co w oknie GTK (`bridge`), tylko ze źródła magazynu.
#[tauri::command]
fn ipc(app: AppHandle, webview: tauri::Webview, body: String) {
    let st = app.state::<Shared>();
    if let Some(rest) = body.strip_prefix("probe:") {
        let out = st
            .lock()
            .ok()
            .and_then(|a| a.probe.as_ref().map(|(_, o)| o.clone()));
        if let Some(out) = out {
            if let Err(e) = std::fs::write(&out, rest) {
                eprintln!("{}: {e}", out.display());
            }
            app.exit(0);
        }
        return;
    }
    let Some(rest) = body.strip_prefix("app:") else {
        return;
    };
    let from = webview.url().map(|u| u.to_string()).unwrap_or_default();
    let (base, key) = match st.lock() {
        Ok(a) => (a.base.clone(), a.draft_key.clone()),
        Err(_) => return,
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
            scene,
            ..
        } => {
            let mut a = match st.lock() {
                Ok(a) => a,
                Err(_) => return,
            };
            if let Some(w) = app.get_webview_window(LABEL) {
                let _ = w.set_title(&title);
            }
            a.page.dirty = dirty;
            if scene.is_some() && scene != a.page.scene {
                a.page.scene = scene.clone();
                let saved =
                    scene.and_then(|s| std::fs::read_to_string(bridge::draft_path(&key, &s)).ok());
                if let Some(text) = saved {
                    eval(
                        &app,
                        &format!(
                            "window.__vizrsCmd && window.__vizrsCmd('draft', {})",
                            Value::from(text)
                        ),
                    );
                }
            }
        }
        bridge::Msg::Close => {
            if let Ok(mut a) = st.lock() {
                a.page.closing = true;
            }
            if let Some(w) = app.get_webview_window(LABEL) {
                let _ = w.close();
            }
        }
        bridge::Msg::Stay => {}
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

fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let item =
        |id: &str, label: &str, accel: Option<&str>| MenuItem::with_id(app, id, label, true, accel);
    let cmds = |range: std::ops::Range<usize>| -> tauri::Result<Vec<MenuItem<tauri::Wry>>> {
        PAGE_CMDS[range]
            .iter()
            .map(|(id, l)| item(&format!("page:{id}"), l, None))
            .collect()
    };
    let file_cmds = cmds(0..5)?;
    let import = item("import", "Importuj…", None)?;
    let close = item("close", "Zamknij okno", Some("CmdOrCtrl+W"))?;
    let quit = item("quit", "Zakończ", Some("CmdOrCtrl+Q"))?;
    let sep = PredefinedMenuItem::separator(app)?;
    let mut file: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        file_cmds.iter().map(|i| i as _).collect();
    file.push(&import);
    file.push(&sep);
    file.push(&close);
    file.push(&quit);
    let edit_cmds = cmds(5..9)?;
    let edit: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        edit_cmds.iter().map(|i| i as _).collect();
    let view_cmds = cmds(9..PAGE_CMDS.len())?;
    let zin = item("zoom-in", "Powiększ", Some("CmdOrCtrl+="))?;
    let zout = item("zoom-out", "Pomniejsz", Some("CmdOrCtrl+-"))?;
    let z0 = item("zoom-reset", "Rozmiar 100%", Some("CmdOrCtrl+0"))?;
    let reload = item("reload", "Odśwież", Some("F5"))?;
    let full = item("fullscreen", "Pełny ekran", Some("F11"))?;
    let dev = item(
        "devtools",
        "Narzędzia deweloperskie",
        Some("CmdOrCtrl+Shift+I"),
    )?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let mut view: Vec<&dyn tauri::menu::IsMenuItem<tauri::Wry>> =
        view_cmds.iter().map(|i| i as _).collect();
    for i in [
        &sep2 as &dyn tauri::menu::IsMenuItem<tauri::Wry>,
        &zin,
        &zout,
        &z0,
        &reload,
        &full,
        &dev,
    ] {
        view.push(i);
    }
    let about = item("about", "O programie", None)?;
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(app, "Plik", true, &file)?,
            &Submenu::with_items(app, "Edycja", true, &edit)?,
            &Submenu::with_items(app, "Widok", true, &view)?,
            &Submenu::with_items(app, "Pomoc", true, &[&about])?,
        ],
    )
}

fn on_menu(app: &AppHandle, id: &str) {
    if let Some(cmd) = id.strip_prefix("page:") {
        return page_cmd(app, cmd);
    }
    let Some(w) = app.get_webview_window(LABEL) else {
        return;
    };
    let zoom = |f: fn(f64) -> f64| {
        let st = app.state::<Mutex<f64>>();
        let mut z = st.lock().map(|z| *z).unwrap_or(1.0);
        z = f(z).clamp(0.3, 3.0);
        if let Ok(mut g) = st.lock() {
            *g = z;
        }
        let _ = w.set_zoom(z);
    };
    match id {
        "import" => {
            let app = app.clone();
            app.dialog()
                .file()
                .add_filter(
                    "Paczka, scena, obraz, czcionka",
                    &[
                        "cgpack", "json", "png", "jpg", "jpeg", "webp", "gif", "svg", "mp4",
                        "webm", "ttf", "otf", "woff", "woff2",
                    ],
                )
                .pick_file(move |f| {
                    if let Some(p) = f.and_then(|f| f.into_path().ok()) {
                        send_file(&app, &p);
                    }
                });
        }
        "close" | "quit" => {
            let _ = w.close();
        }
        "zoom-in" => zoom(|z| z * 1.1),
        "zoom-out" => zoom(|z| z / 1.1),
        "zoom-reset" => zoom(|_| 1.0),
        "reload" => {
            let _ = w.eval("location.reload()");
        }
        "fullscreen" => {
            let _ = w.set_fullscreen(!w.is_fullscreen().unwrap_or(false));
        }
        "devtools" => w.open_devtools(),
        "about" => {
            let msg = format!(
                "vizrs-cg-artist (prototyp Tauri {}) {}\nModuły rysowania: VizRS CG System {}",
                tauri::VERSION,
                env!("CARGO_PKG_VERSION"),
                web::cg_version()
            );
            app.dialog().message(msg).title("O programie").show(|_| {});
        }
        _ => {}
    }
}

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
                        .unwrap_or("vizrs-eksport")
                        .to_string()
                });
            let dir = std::env::temp_dir().join(format!("vizrs-cg-artist-{}", std::process::id()));
            std::fs::create_dir_all(&dir).ok();
            *destination = dir.join(name);
            // macOS nie podaje ścieżki w `Finished` – zapamiętujemy ją tutaj
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
            let Some(tmp) = path.or(remembered).filter(|_| success) else {
                return true;
            };
            let name = tmp
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            let app2 = app.clone();
            app.dialog()
                .file()
                .set_file_name(&name)
                .save_file(move |f| match f.and_then(|f| f.into_path().ok()) {
                    Some(dst) => {
                        if std::fs::rename(&tmp, &dst)
                            .or_else(|_| std::fs::copy(&tmp, &dst).map(|_| ()))
                            .is_err()
                        {
                            error(&app2, &format!("Nie udało się zapisać {}", dst.display()));
                        }
                        std::fs::remove_file(&tmp).ok();
                    }
                    None => {
                        std::fs::remove_file(&tmp).ok();
                    }
                });
            true
        }
        _ => true,
    }
}

fn open_window(app: &AppHandle, url: &str) -> tauri::Result<WebviewWindow> {
    let url = url
        .parse()
        .map_err(|_| tauri::Error::InvalidWebviewUrl("adres magazynu lokalnego"))?;
    let app_dl = app.clone();
    let w = WebviewWindowBuilder::new(app, LABEL, WebviewUrl::External(url))
        .title("VizRS CG Artist")
        .inner_size(1600.0, 900.0)
        .maximized(true)
        .initialization_script(IPC_SHIM)
        .devtools(true)
        .on_download(move |_, ev| on_download(&app_dl, ev))
        .on_page_load(|w, p| {
            if p.event() != PageLoadEvent::Finished {
                return;
            }
            let app = w.app_handle().clone();
            let (probe, pending) = {
                let st = app.state::<Shared>();
                let mut a = match st.lock() {
                    Ok(a) => a,
                    Err(_) => return,
                };
                (a.probe.as_ref().map(|(c, _)| c.clone()), a.pending.take())
            };
            if let Some(code) = probe {
                let _ = w.eval(&code);
            }
            if let Some(p) = pending {
                send_file(&app, &p);
            }
        })
        .build()?;
    let _ = w.set_focus();
    spell_pl(&w);
    Ok(w)
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

fn main() {
    let args = match parse_args() {
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
    let data = std::fs::canonicalize(&args.data).unwrap_or_else(|_| args.data.clone());
    let app_state = App {
        base: String::new(),
        draft_key: String::new(),
        probe,
        pending: args.file.clone(),
        page: PageState::default(),
        store: None,
    };
    let mut builder = tauri::Builder::default();
    if args.probe.is_none() {
        // jedna instancja: kolejne uruchomienie oddaje plik i wysuwa okno
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            if let Some(w) = app.get_webview_window(LABEL) {
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
            if let Some(f) = argv.iter().skip(1).map(PathBuf::from).find(|p| p.is_file()) {
                send_file(app, &f);
            }
        }));
    }
    let result = builder
        .plugin(tauri_plugin_dialog::init())
        .manage(Mutex::new(app_state))
        .manage(Mutex::new(1.0_f64))
        .manage(Downloads::default())
        .invoke_handler(tauri::generate_handler![ipc])
        .setup(move |app| {
            let h = app.handle().clone();
            // po wtyczce jednej instancji: drugie uruchomienie kończy się, zanim dotknie katalogu danych
            let url = match start_work(&args.data, &data) {
                Ok((url, base, key, store)) => {
                    let st = h.state::<Shared>();
                    let mut a = st.lock().map_err(|_| "stan")?;
                    (a.base, a.draft_key, a.store) = (base, key, store);
                    url
                }
                Err(e) => {
                    eprintln!("{e}");
                    std::process::exit(1);
                }
            };
            let menu = build_menu(&h)?;
            app.set_menu(menu)?;
            app.on_menu_event(|app, ev| on_menu(app, ev.id().as_ref()));
            open_window(&h, &url)?;
            Ok(())
        })
        .on_window_event(|w, ev| {
            if let WindowEvent::CloseRequested { api, .. } = ev {
                let app = w.app_handle();
                let st = app.state::<Shared>();
                let ask = st
                    .lock()
                    .map(|a| a.page.dirty && !a.page.closing)
                    .unwrap_or(false);
                if ask {
                    api.prevent_close();
                    page_cmd(app, "close");
                }
            }
        })
        .build(tauri::generate_context!());
    let app = match result {
        Ok(a) => a,
        Err(e) => {
            eprintln!("VizRS CG Artist: {e}");
            std::process::exit(1);
        }
    };
    app.run(|app, ev| {
        // app.exit() nie zwalnia stanu – blokada katalogu danych musi zniknąć jawnie
        if let tauri::RunEvent::Exit = ev {
            if let Ok(mut a) = app.state::<Shared>().lock() {
                a.store.take();
            }
        }
    });
}

/// Praca lokalna: serwer vizrs na tym katalogu danych (dołącz) albo magazyn w oknie.
/// Zwraca (adres strony, baza, klucz kopii roboczej, magazyn).
fn start_work(
    data: &Path,
    canon: &Path,
) -> Result<(String, String, String, Option<local::Local>), String> {
    if let Some(addr) = server::running_server(data, std::env::var("VIZRS_TOKEN").ok().as_deref())?
    {
        let base = format!("http://{addr}");
        return Ok((format!("{base}/artist"), base.clone(), base, None));
    }
    let l = local::start(data)?;
    Ok((
        format!("{}/artist?token={}", l.base, l.secret),
        l.base.clone(),
        format!("lokalny:{}", canon.display()),
        Some(l),
    ))
}

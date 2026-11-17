//! Okna: Artist (skrypt mostu, powiększenie, wygląd systemu, pisownia, odzyskiwanie po awarii strony), okno połączenia, przełączanie serwera, zamykanie i pobrania.

use super::*;

/// Tło okna przed wczytaniem strony (jak `--bg` strony) – bez białego błysku (Windows, macOS).
#[cfg(not(target_os = "linux"))]
pub(crate) const BACKGROUND: Color = Color(0x15, 0x17, 0x1a, 0xff);

/// Most strony: `window.__vizrsPost(tekst)` → komenda `ipc`. `window.ipc` należy w Tauri do wry/Tauri
/// (niezapisywalny), więc strona (`web/native.js`) i okno połączenia wołają `__vizrsPost`.
/// `os` – strona dobiera do systemu czcionkę, przyciski okien i paski przewijania. `px` – pikseli ekranu na piksel CSS
/// przy interfejsie 100 % (`scale::screen_scale`), `zoom` – powiększenie interfejsu: „1:1” kanwy liczy z `px × zoom`
/// (`devicePixelRatio` przy skali ułamkowej kłamie – 2 zamiast 1.25 na Waylandzie, 1 przez XWayland).
pub(crate) const IPC_SHIM: &str = r#"(() => {
  window.__vizrsPost = (m) => { window.__TAURI_INTERNALS__.invoke('ipc', { body: String(m) }).catch((e) => console.error('ipc', e)); };
  window.__vizrsShell = { version: '__VERSION__', app: 'cg-artist', os: '__OS__', px: __PX__, zoom: __ZOOM__ };
})();"#;

pub(crate) fn script(zoom: f64) -> String {
    IPC_SHIM
        .replace("__VERSION__", env!("CARGO_PKG_VERSION"))
        .replace("__OS__", std::env::consts::OS)
        .replace("__PX__", &screen_px().to_string())
        .replace("__ZOOM__", &zoom.to_string())
}

/// Pikseli ekranu na piksel CSS przy interfejsie 100 % (raz na proces).
pub(crate) fn screen_px() -> f64 {
    static PX: std::sync::OnceLock<f64> = std::sync::OnceLock::new();
    *PX.get_or_init(|| {
        scale::screen_scale(
            std::env::var("VIZRS_SCALE").ok().as_deref(),
            scale::kde_xwayland(),
        )
    })
}

/// Powiększenie interfejsu do strony (`__vizrsShell.zoom`, zdarzenie `vizrs-zoom`) – „1:1” kanwy.
pub(crate) fn zoom_js(z: f64) -> String {
    format!("window.__vizrsShell&&(window.__vizrsShell.zoom={z},dispatchEvent(new Event('vizrs-zoom')))")
}

/// Wygląd okna zgodny z systemem: ciemny pasek tytułu i menu (Windows: tryb ciemny DWM, Linux: ciemny wariant
/// motywu GTK, macOS: ciemny wygląd okna), tło jak strona, bez funkcji przeglądarki (autouzupełnianie WebView2,
/// podgląd odnośników na macOS); Windows – nakładane paski przewijania Fluent (Windows 11).
pub(crate) fn native_look<'a>(
    b: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    let b = b
        .theme(Some(Theme::Dark))
        .devtools(devtools_enabled())
        .general_autofill_enabled(false);
    // Linux: kolor tła okna GTK zamalowałby też pasek menu motywu (przy motywie bez ciemnego wariantu – ciemny
    // tekst na ciemnym tle); przed mignięciem chroni tam ukrycie okna do wczytania strony
    #[cfg(not(target_os = "linux"))]
    let b = b.background_color(BACKGROUND);
    #[cfg(windows)]
    let b = b.scroll_bar_style(tauri::webview::ScrollBarStyle::FluentOverlay);
    #[cfg(target_os = "macos")]
    let b = b.allow_link_preview(false);
    b
}

/// Pokaż okno Artist (tworzone niewidoczne, żeby nie mignęło pustą stroną).
pub(crate) fn reveal(app: &AppHandle, label: &str) {
    let maximize = state(app).wins.get(label).is_some_and(|w| w.maximize);
    if let Some(w) = app.get_webview_window(label) {
        if !w.is_visible().unwrap_or(true) {
            let _ = w.show();
            if maximize {
                let _ = w.maximize();
            }
            let _ = w.set_focus();
        }
    }
}

pub(crate) fn open_artist(app: &AppHandle, pending: Option<PathBuf>) {
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
    // Artist to stanowisko pracy – bez zapisanego wyglądu od razu na cały ekran
    let maximize = st.maximized.unwrap_or(true);
    if let Some(win) = state(app).wins.get_mut(&label) {
        win.maximize = maximize;
    }
    let parsed = match url.parse() {
        Ok(u) => u,
        Err(_) => return error(app, "zły adres strony"),
    };
    let (w, h) = st.size.unwrap_or((1600.0, 900.0));
    let (w, h) = screen::fit_to_screen(app, w, h); // skalowanie ułamkowe: okno nie większe niż ekran
    let app_dl = app.clone();
    let built = native_look(WebviewWindowBuilder::new(
        app,
        &label,
        WebviewUrl::External(parsed),
    ))
    .title(&title)
    .inner_size(w, h)
    .min_inner_size(800.0, 500.0)
    .maximized(maximize)
    .visible(false)
    .initialization_script(script(
        st.zoom.filter(|z| (*z - 1.0).abs() > 0.01).unwrap_or(1.0),
    ))
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
            spell_pl(&w);
            reload_after_crash(app, &w);
            // Linux: nowe okno tao ustawia wariant GTK z ustawień systemu (portal) – przywróć ciemny
            app.set_theme(Some(Theme::Dark));
            // strona nie wczytała się szybko (wolny dysk, błąd) – okno i tak się pokazuje
            let (app2, l2) = (app.clone(), label.clone());
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_secs(3));
                let app3 = app2.clone();
                let _ = app2.run_on_main_thread(move || reveal(&app3, &l2));
            });
        }
        Err(e) => {
            state(app).wins.remove(&label);
            error(app, &format!("Nie udało się otworzyć okna: {e}"));
        }
    }
}

/// Pisownia polska w polach tekstowych (Linux: WebKitGTK + enchant; Windows/macOS: słownik systemu WebView).
pub(crate) fn spell_pl(w: &WebviewWindow) {
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

/// Linux: proces strony WebKitGTK padł (sterownik GPU, brak pamięci) – WebKitGTK zostawia wtedy puste okno.
/// Strona wczytuje się od nowa z adresu startowego bieżącego trybu (z sekretem: strona usuwa go z adresu, a ciasteczka
/// `SameSite=Strict` WebKit nie wysyła przy wczytaniu po awarii – samo `reload()` kończyło się 401). Kopia robocza wraca
/// jak po zamknięciu. Najwyżej 3 razy na minutę – przy awarii za każdym wczytaniem okno zostaje puste zamiast mielić w kółko.
pub(crate) fn reload_after_crash(app: &AppHandle, w: &WebviewWindow) {
    #[cfg(target_os = "linux")]
    {
        let app = app.clone();
        let _ = w.with_webview(move |pv| {
            use webkit2gtk::WebViewExt;
            let recent = std::cell::RefCell::new(Vec::<Instant>::new());
            pv.inner().connect_web_process_terminated(move |v, reason| {
                let mut r = recent.borrow_mut();
                r.retain(|t| t.elapsed() < Duration::from_secs(60));
                let url = (r.len() < 3).then(|| state(&app).start_url()).flatten();
                eprintln!(
                    "proces strony zakończył się ({reason:?}){}",
                    if url.is_some() {
                        " – wczytuję stronę ponownie"
                    } else {
                        " – okno zostaje puste"
                    }
                );
                if let Some(u) = url {
                    r.push(Instant::now());
                    v.load_uri(&u);
                }
            });
        });
    }
    #[cfg(not(target_os = "linux"))]
    let _ = (app, w);
}

pub(crate) fn page_loaded(app: &AppHandle, label: &str) {
    reveal(app, label);
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

pub(crate) fn open_connect(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(CONNECT) {
        let _ = w.set_focus();
        return;
    }
    let data = {
        let mut a = state(app);
        let (current, token, local): (String, Option<String>, Option<&str>) = match &a.mode {
            Mode::Remote { url, token } => (url.clone(), token.clone(), None),
            Mode::Local => ("lokalnie".into(), None, Some("lokalnie")),
            Mode::None => (String::new(), None, None),
        };
        let mut d = connect::page_data(&connect::Saved::load(), &current, token.as_deref(), local);
        // nieudane łączenie przy starcie: adres i powód od razu w oknie (zamiast pustego edytora)
        if let Some((url, msg)) = a.start_error.take() {
            d.push_str(&format!(
                "\nwindow.__vizrsConnStart = {};",
                serde_json::json!({ "url": url, "error": msg })
            ));
        }
        d
    };
    // okno dialogowe: stały rozmiar, bez maksymalizacji, nad oknem Artist (jeśli jest), bez paska menu programu
    let parent = state(app)
        .target_label()
        .and_then(|l| app.get_webview_window(&l));
    let mut b = native_look(WebviewWindowBuilder::new(
        app,
        CONNECT,
        WebviewUrl::App("connect.html".into()),
    ))
    .title("Połącz z serwerem")
    .inner_size(520.0, 520.0)
    .resizable(false)
    .maximizable(false)
    .minimizable(parent.is_none())
    .center()
    .initialization_script(format!("{}\n{data}", script(1.0)));
    if let Some(p) = &parent {
        b = match b.parent(p) {
            Ok(b) => b,
            Err(e) => return error(app, &format!("Nie udało się otworzyć okna połączenia: {e}")),
        };
    }
    match b.build() {
        Ok(w) => {
            #[cfg(not(target_os = "macos"))]
            let _ = w.remove_menu();
            app.set_theme(Some(Theme::Dark));
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

pub(crate) fn close_connect(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(CONNECT) {
        let _ = w.destroy();
    }
}

pub(crate) fn conn_error(app: &AppHandle, msg: &str) {
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
pub(crate) fn switch(app: &AppHandle) {
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
    let Some(url) = url.and_then(|u| u.parse::<tauri::Url>().ok()) else {
        return;
    };
    for l in labels {
        if let Some(w) = app.get_webview_window(&l) {
            // nawigacja przez okno, nie skrypt strony: `eval` ginie, gdy proces strony właśnie padł albo
            // wczytuje się od nowa – zostawał tytuł nowego serwera nad stroną starego (zgłoszenie 2026-11-14)
            match w.navigate(url.clone()) {
                Ok(()) => {
                    let _ = w.set_title(&title);
                }
                Err(e) => eprintln!("przełączenie okna {l}: {e}"),
            }
        }
    }
}

/// Zamknięcie okna Artist: ze zmianami pyta przez stronę (ona zna stan i umie zapisać); strona bez odpowiedzi
/// nie zatrzyma okna na zawsze. `true` = wstrzymaj zamknięcie.
pub(crate) fn close_request(app: &AppHandle, label: &str) -> bool {
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
pub(crate) fn window_gone(app: &AppHandle, label: &str, w: &tauri::Window) {
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
pub(crate) fn quit_step(app: &AppHandle) {
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

/// Pobranie strony (eksport, paczka): najpierw do pliku tymczasowego, po zakończeniu systemowe „Zapisz jako”
/// (blokujące okno w wywołaniu zwrotnym pobrania mogłoby zakleszczyć wątek okna).
pub(crate) fn on_download(app: &AppHandle, ev: DownloadEvent<'_>) -> bool {
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

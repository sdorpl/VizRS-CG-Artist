//! Menu okna Artist: komendy strony (`PAGE_CMDS`) ze skrótami w zapisie systemu, budowa i odświeżanie menu, akcje.

use super::*;

/// Komendy menu wysyłane do strony (`__vizrsCmd`): akcja, etykieta, skrót. Skróty obsługuje strona (akcelerator
/// menu przechwyciłby je też w polach tekstowych), więc menu tylko je pokazuje – w sposób danego systemu (`shortcut_label`).
pub(crate) const PAGE_CMDS: &[(&str, &str, &str)] = &[
    ("new", "Nowa scena", ""),
    ("save", "Zapisz", "Ctrl+S"),
    ("export", "Eksportuj scenę (.cgpack)…", ""),
    ("pack", "Paczka .cgpack…", ""),
    ("deploy", "Wyślij na serwer…", ""),
    ("undo", "Cofnij", "Ctrl+Z"),
    ("redo", "Ponów", "Ctrl+Y"),
    ("dup", "Duplikuj", "Ctrl+D"),
    ("del", "Usuń", "Delete"),
    ("fit", "Dopasuj kanwę", "Shift+1"),
    ("z100", "Kanwa 100%", "Shift+2"),
    ("zsel", "Kanwa do zaznaczenia", "Shift+3"),
    ("panelL", "Panel drzewa", "Ctrl+1"),
    ("panelR", "Panel właściwości", "Ctrl+2"),
    ("panelT", "Oś czasu", "Ctrl+3"),
    ("canvasOnly", "Tylko kanwa", "Tab"),
    ("play", "Odtwórz / zatrzymaj", "Spacja"),
    ("marker", "Dodaj marker", "M"),
];

/// Skrót w etykiecie menu tak, jak pokazuje go system: Windows – w kolumnie skrótów (tabulator, jak w Win32),
/// macOS – symbolami (⌘ ⇧ ⌫), Linux – w nawiasie.
pub(crate) fn shortcut_label(label: &str, keys: &str) -> String {
    if keys.is_empty() {
        return label.to_string();
    }
    if cfg!(target_os = "windows") {
        format!("{label}\t{keys}")
    } else if cfg!(target_os = "macos") {
        let k = keys
            .replace("Ctrl+", "⌘")
            .replace("Shift+", "⇧")
            .replace("Delete", "⌫");
        format!("{label}   {k}")
    } else {
        format!("{label} ({keys})")
    }
}

pub(crate) fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    type Item = dyn tauri::menu::IsMenuItem<tauri::Wry>;
    let mac = cfg!(target_os = "macos");
    let item =
        |id: &str, label: &str, accel: Option<&str>| MenuItem::with_id(app, id, label, true, accel);
    let cmd = |id: &str| -> tauri::Result<MenuItem<tauri::Wry>> {
        let (label, keys) = PAGE_CMDS
            .iter()
            .find(|(i, ..)| *i == id)
            .map(|(_, l, k)| (*l, *k))
            .unwrap_or((id, ""));
        item(&format!("page:{id}"), &shortcut_label(label, keys), None)
    };
    let sep = || PredefinedMenuItem::separator(app);
    let about_meta = AboutMetadata {
        name: Some("VizRS CG Artist".into()),
        version: Some(env!("CARGO_PKG_VERSION").into()),
        comments: Some(format!(
            "Edytor grafik i animacji VizRS\nModuły rysowania: VizRS CG System {}\nDane: {}",
            web::cg_version(),
            state(app).data.display()
        )),
        copyright: Some("VizRS".into()),
        website: Some(RELEASES.into()),
        website_label: Some("Wydania na GitHubie".into()),
        icon: app.default_window_icon().cloned(),
        ..Default::default()
    };
    // macOS: „O programie” i „Zakończ” są w menu aplikacji; Windows/Linux – w Pomocy i w Pliku.
    // Zakończ to własna pozycja (nie systemowa), żeby niezapisane sceny dostały pytanie.
    let about = PredefinedMenuItem::about(
        app,
        Some(if mac {
            "O programie VizRS CG Artist"
        } else {
            "O programie"
        }),
        Some(about_meta),
    )?;
    // Windows zamyka program Alt+F4 (system); Ctrl+Q to zwyczaj Linuksa, Cmd+Q – macOS
    let quit_accel = if cfg!(target_os = "windows") {
        None
    } else {
        Some("CmdOrCtrl+Q")
    };
    let quit = item(
        "quit",
        if mac {
            "Zakończ VizRS CG Artist"
        } else {
            "Zakończ"
        },
        quit_accel,
    )?;

    let (new, save, import, export, pack, deploy) = (
        cmd("new")?,
        cmd("save")?,
        item("import", "Importuj…", Some("CmdOrCtrl+O"))?,
        cmd("export")?,
        cmd("pack")?,
        cmd("deploy")?,
    );
    let connect = item("connect", "Połącz z serwerem…", Some("CmdOrCtrl+Shift+K"))?;
    let new_window = item("new-window", "Nowe okno", Some("CmdOrCtrl+Shift+N"))?;
    let close = item("close", "Zamknij okno", Some("CmdOrCtrl+W"))?;
    let (s1, s2, s3, s4) = (sep()?, sep()?, sep()?, sep()?);
    let mut file: Vec<&Item> = vec![
        &new_window,
        &new,
        &s1,
        &import,
        &s2,
        &save,
        &export,
        &pack,
        &deploy,
        &s3,
        &connect,
        &s4,
        &close,
    ];
    let s_quit = sep()?;
    if !mac {
        file.extend([&s_quit as &Item, &quit]);
    }

    let (undo, redo, dup, del) = (cmd("undo")?, cmd("redo")?, cmd("dup")?, cmd("del")?);
    let s5 = sep()?;
    let mut edit: Vec<&Item> = vec![&undo, &redo, &s5, &dup, &del];
    // macOS: schowek w Edycji (standard systemu; działa w polach tekstowych strony)
    let (cut, copy, paste, all, s_clip) = (
        PredefinedMenuItem::cut(app, Some("Wytnij"))?,
        PredefinedMenuItem::copy(app, Some("Kopiuj"))?,
        PredefinedMenuItem::paste(app, Some("Wklej"))?,
        PredefinedMenuItem::select_all(app, Some("Zaznacz wszystko"))?,
        sep()?,
    );
    if mac {
        edit.splice(2..2, [&s_clip as &Item, &cut, &copy, &paste, &all]);
    }

    let (fit, z100, zsel) = (cmd("fit")?, cmd("z100")?, cmd("zsel")?);
    let (p_l, p_r, p_t, p_all) = (
        cmd("panelL")?,
        cmd("panelR")?,
        cmd("panelT")?,
        cmd("canvasOnly")?,
    );
    let reload = item("reload", "Wczytaj ponownie", Some("F5"))?;
    let full = item("fullscreen", "Pełny ekran", Some("F11"))?;
    let zin = item("zoom-in", "Powiększ interfejs", Some("CmdOrCtrl+="))?;
    let zout = item("zoom-out", "Pomniejsz interfejs", Some("CmdOrCtrl+-"))?;
    let z0 = item("zoom-reset", "Interfejs 100%", Some("CmdOrCtrl+0"))?;
    let dev = item(
        "devtools",
        "Narzędzia deweloperskie",
        Some("CmdOrCtrl+Shift+I"),
    )?;
    let (s5, s6, s7, s8) = (sep()?, sep()?, sep()?, sep()?);
    let mut view: Vec<&Item> = vec![
        &fit, &z100, &zsel, &s5, &p_l, &p_r, &p_t, &p_all, &s6, &zin, &zout, &z0, &s7, &reload,
    ];
    // macOS: pełny ekran jest w menu Okno (systemowy, ⌃⌘F)
    if !mac {
        view.push(&full);
    }
    if devtools_enabled() {
        view.extend([&s8 as &Item, &dev]);
    }

    let (play, marker) = (cmd("play")?, cmd("marker")?);
    let logs = item("logs", "Pokaż logi", None)?;
    let data_dir = item("data-dir", "Otwórz katalog danych", None)?;
    let updates = item("updates", "Sprawdź aktualizacje", None)?;
    let (s9, s10) = (sep()?, sep()?);
    let mut help: Vec<&Item> = vec![&logs, &data_dir, &s9, &updates];
    if !mac {
        help.extend([&s10 as &Item, &about]);
    }

    // „&” – mnemonik (Alt+litera) na Windows i Linuksie; macOS go pomija
    let help_menu = Submenu::with_items(app, "Pomo&c", true, &help)?;
    #[allow(unused_mut)]
    let mut subs = vec![
        Submenu::with_items(app, "&Plik", true, &file)?,
        Submenu::with_items(app, "&Edycja", true, &edit)?,
        Submenu::with_items(app, "&Widok", true, &view)?,
        Submenu::with_items(app, "&Scena", true, &[&play as &Item, &marker])?,
    ];
    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            app,
            "VizRS CG Artist",
            true,
            &[
                &about as &Item,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::services(app, Some("Usługi"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::hide(app, Some("Ukryj VizRS CG Artist"))?,
                &PredefinedMenuItem::hide_others(app, Some("Ukryj pozostałe"))?,
                &PredefinedMenuItem::show_all(app, Some("Pokaż wszystkie"))?,
                &PredefinedMenuItem::separator(app)?,
                &quit,
            ],
        )?;
        let window_menu = Submenu::with_items(
            app,
            "Okno",
            true,
            &[
                &PredefinedMenuItem::minimize(app, Some("Minimalizuj"))? as &Item,
                &PredefinedMenuItem::maximize(app, Some("Powiększ"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::fullscreen(app, Some("Pełny ekran"))?,
                &PredefinedMenuItem::separator(app)?,
                &PredefinedMenuItem::bring_all_to_front(app, Some("Wszystkie na wierzch"))?,
            ],
        )?;
        window_menu.set_as_windows_menu_for_nsapp()?;
        help_menu.set_as_help_menu_for_nsapp()?;
        subs.insert(0, app_menu);
        subs.push(window_menu);
    }
    subs.push(help_menu);
    {
        let mut a = state(app);
        a.undo_item = Some(undo.clone());
        a.redo_item = Some(redo.clone());
    }
    let refs: Vec<&Item> = subs.iter().map(|s| s as &Item).collect();
    Menu::with_items(app, &refs)
}

/// Cofnij / Ponów zgodnie ze stanem aktywnego okna Artist.
pub(crate) fn sync_menu(app: &AppHandle) {
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

pub(crate) fn on_menu(app: &AppHandle, id: &str) {
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
        let _ = w.eval(zoom_js(z));
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
            // wczytanie strony od nowa porzuca niezapisane zmiany – najpierw systemowe pytanie
            let dirty = target
                .as_deref()
                .and_then(|l| state(app).wins.get(l).map(|w| w.dirty))
                .unwrap_or(false);
            let Some(w) = win else { return };
            if !dirty {
                let _ = w.eval("location.reload()");
                return;
            }
            app.dialog()
                .message("Niezapisane zmiany sceny zostaną utracone.")
                .title("Wczytać scenę ponownie?")
                .kind(MessageDialogKind::Warning)
                .buttons(MessageDialogButtons::OkCancelCustom(
                    "Wczytaj ponownie".into(),
                    "Anuluj".into(),
                ))
                .parent(&w)
                .show_with_result(move |r| {
                    if r == MessageDialogResult::Custom("Wczytaj ponownie".into())
                        || r == MessageDialogResult::Ok
                    {
                        let _ = w.eval("location.reload()");
                    }
                });
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
        _ => {}
    }
}

//! Komunikaty strony i okna połączenia (komenda `ipc`, biała lista w `bridge`), sprawdzenie serwera, pliki do strony.

use super::*;

/// Przekazuje plik stronie porcjami (strona składa `File` i decyduje o imporcie).
pub(crate) fn send_file(app: &AppHandle, label: &str, path: &Path) {
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
pub(crate) fn open_file(app: &AppHandle, path: PathBuf) {
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
pub(crate) fn on_remote(app: &AppHandle, argv: &[String]) {
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

#[tauri::command]
pub(crate) fn ipc(app: AppHandle, webview: tauri::Webview, body: String) {
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
        bridge::Msg::Dialog {
            id,
            kind,
            title,
            text,
            buttons,
        } => ask(&app, &label, id, kind, title, text, buttons),
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

pub(crate) fn on_conn(app: &AppHandle, body: &str) {
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
            // puste pole tokenu = token zapamiętany dla tego serwera (albo dla tego samego hosta pod innym adresem)
            if req.token.is_none() {
                req.token = connect::Saved::load().token_for_or_host(&req.url);
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

pub(crate) fn on_checked(app: &AppHandle, req: connect::Request, err: Option<String>) {
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
pub(crate) fn check_server(url: &str, token: Option<&str>) -> Result<(), String> {
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

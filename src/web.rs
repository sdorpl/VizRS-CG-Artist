//! Strona Artist wkompilowana w binarkę (`web/`, tabela z `build.rs`): adres → treść i typ.
//! Adresy jak w serwerze `vizrs`: `/artist`, `/<moduł>.js`, `/ui.css`, `/fonts/fonts.css`, `/fonts/<plik>.woff2`.

include!(concat!(env!("OUT_DIR"), "/web_files.rs"));

/// Typ treści po rozszerzeniu (także dla zasobów użytkownika).
pub fn mime(name: &str) -> &'static str {
    let ext = name
        .rsplit_once('.')
        .map(|(_, e)| e.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "txt" => "text/plain; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn file(rel: &str) -> Option<&'static [u8]> {
    FILES.iter().find(|(p, _)| *p == rel).map(|(_, d)| *d)
}

/// Plik strony pod adresem `path` (bez query). `None` – nie ma takiego.
pub fn get(path: &str) -> Option<(&'static [u8], &'static str)> {
    let rel = match path {
        "/" | "/artist" | "/artist.html" => "artist.html",
        p => p.strip_prefix('/')?,
    };
    if rel.contains("..") || rel.is_empty() {
        return None;
    }
    if let Some(name) = rel.strip_prefix("fonts/") {
        if name.contains('/') {
            return None;
        }
        if name == "fonts.css" {
            return file("fonts/fonts.css").map(|d| (d, mime(name)));
        }
        // fonty leżą w web/fonts/<rodzina>/<plik>, adres jest płaski – jak w serwerze
        return FILES
            .iter()
            .find(|(p, _)| {
                p.starts_with("fonts/")
                    && p.rsplit('/').next() == Some(name)
                    && name.ends_with(".woff2")
            })
            .map(|(_, d)| (*d, mime(name)));
    }
    // tylko pliki z katalogu głównego web/ (moduły, arkusz) – bez CG_SYSTEM i licencji
    if rel.contains('/') || !rel.contains('.') {
        return None;
    }
    file(rel).map(|d| (d, mime(rel)))
}

/// Wersja VizRS CG System, z której pochodzą moduły rysowania.
pub fn cg_version() -> &'static str {
    file("CG_SYSTEM")
        .and_then(|d| std::str::from_utf8(d).ok())
        .map(str::trim)
        .unwrap_or("?")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn page_and_modules() {
        let (html, t) = get("/artist").unwrap();
        assert!(t.starts_with("text/html"));
        assert!(std::str::from_utf8(html).unwrap().contains("<title>"));
        for m in [
            "/renderer.js",
            "/motion.js",
            "/native.js",
            "/ui.css",
            "/vizrs-ui.css",
            "/cgpack.js",
        ] {
            assert!(get(m).is_some(), "{m}");
        }
        assert!(get("/fonts/fonts.css").is_some());
        assert!(get("/fonts/oswald-latin-400-normal.woff2").is_some());
    }

    #[test]
    fn nothing_outside() {
        for p in [
            "/../Cargo.toml",
            "/fonts/../artist.html",
            "/fonts/oswald/LICENSE.txt",
            "/CG_SYSTEM",
            "/fonts/oswald/oswald-latin-400-normal.woff2",
            "/trio",
        ] {
            assert!(get(p).is_none(), "{p}");
        }
        assert_ne!(cg_version(), "?");
    }

    #[test]
    fn every_font_in_css_is_served() {
        let css = std::str::from_utf8(get("/fonts/fonts.css").unwrap().0).unwrap();
        for part in css.split("url(/fonts/").skip(1) {
            let name = part.split(')').next().unwrap();
            assert!(get(&format!("/fonts/{name}")).is_some(), "{name}");
        }
    }
}

//! Prototyp Tauri: `tauri_build` + strona `web/` z głównego repo wkompilowana jak w `../../build.rs`.
use std::path::{Path, PathBuf};

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    let mut e: Vec<_> = rd.flatten().map(|e| e.path()).collect();
    e.sort();
    for p in e {
        if p.is_dir() {
            walk(&p, out)
        } else if p.is_file() {
            out.push(p)
        }
    }
}

fn main() {
    let root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    // bez canonicalize: na Windows dałoby ścieżki \\?\ (include_bytes! ich nie potrzebuje)
    let web = root.join("..").join("..").join("web");
    assert!(web.join("artist.html").is_file(), "brak web/artist.html");
    println!("cargo:rerun-if-changed={}", web.display());
    let mut files = vec![];
    walk(&web, &mut files);
    let mut src = String::from("pub static FILES: &[(&str, &[u8])] = &[\n");
    for f in &files {
        let rel = f
            .strip_prefix(&web)
            .unwrap()
            .to_string_lossy()
            .replace('\\', "/");
        if rel.starts_with('.') {
            continue;
        }
        src.push_str(&format!(
            "    ({:?}, include_bytes!({:?})),\n",
            rel,
            f.to_string_lossy()
        ));
    }
    src.push_str("];\n");
    std::fs::write(
        PathBuf::from(std::env::var("OUT_DIR").unwrap()).join("web_files.rs"),
        src,
    )
    .unwrap();
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["ipc"])),
    )
    .expect("tauri_build");
}

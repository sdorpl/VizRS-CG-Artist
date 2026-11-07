//! `tauri_build` (konfiguracja, ikony, uprawnienia komendy `ipc`) i strona Artist (`web/`) wkompilowana w binarkę:
//! tabela (ścieżka względem `web/`, treść) w `OUT_DIR/web_files.rs`. Tylko `std` + tauri-build.

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
    let root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let web = root.join("web");
    assert!(web.join("artist.html").is_file(), "brak web/artist.html");
    println!("cargo:rerun-if-changed=web");
    let mut files = vec![];
    walk(&web, &mut files);
    let mut src = String::from("pub static FILES: &[(&str, &[u8])] = &[\n");
    for f in &files {
        let rel = f
            .strip_prefix(&web)
            .expect("plik spoza web/")
            .to_string_lossy()
            .replace('\\', "/");
        if rel.starts_with('.') {
            continue;
        }
        println!("cargo:rerun-if-changed={}", f.display());
        src.push_str(&format!(
            "    ({:?}, include_bytes!({:?})),\n",
            rel,
            f.to_string_lossy()
        ));
    }
    src.push_str("];\n");
    let out = PathBuf::from(std::env::var("OUT_DIR").expect("OUT_DIR")).join("web_files.rs");
    std::fs::write(out, src).expect("zapis web_files.rs");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(&["ipc"])),
    )
    .expect("tauri_build");
}

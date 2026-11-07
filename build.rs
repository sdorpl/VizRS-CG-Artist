//! Wkompilowuje stronę Artist (`web/`) w binarkę: tabela (ścieżka względem `web/`, treść).
//! Bez zależności – tylko `std`; `CG_SYSTEM` (wersja źródła modułów) też trafia do tabeli.

use std::path::{Path, PathBuf};

fn walk(dir: &Path, out: &mut Vec<PathBuf>) {
    let Ok(rd) = std::fs::read_dir(dir) else {
        return;
    };
    let mut entries: Vec<_> = rd.flatten().map(|e| e.path()).collect();
    entries.sort();
    for p in entries {
        if p.is_dir() {
            walk(&p, out);
        } else if p.is_file() {
            out.push(p);
        }
    }
}

fn main() {
    let root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let web = root.join("web");
    println!("cargo:rerun-if-changed=web");
    let mut files = Vec::new();
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
}

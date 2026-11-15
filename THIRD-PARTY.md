# Składniki zewnętrzne

Kod VizRS CG Artist: MIT ([LICENSE](LICENSE)). Moduły rysowania i fonty w `web/` to kopie z VizRS CG System (MIT, `tools/sync-cg.sh`). Rozpowszechniane są:

| Składnik | Gdzie | Licencja |
|---|---|---|
| Fonty Barlow, Barlow Condensed, Bebas Neue, Inter, Montserrat, Oswald, Roboto, Roboto Condensed, Roboto Mono | `web/fonts/` (wbudowane w program) | SIL Open Font License 1.1 – tekst w `web/fonts/<font>/LICENSE.txt` |
| crate'y: tauri, tauri-plugin-dialog, tauri-plugin-single-instance, serde_json, ureq (rustls), getrandom, webkit2gtk (+ zależności przechodnie) | program i paczki | MIT / Apache-2.0 (rustls też ISC; wersje: `Cargo.lock`) |
| WebView2 Runtime (instalatory Windows) | `.msi` / `.exe` | licencja Microsoft – pobierany przez instalator, nie dołączany |

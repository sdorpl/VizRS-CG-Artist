# VizRS CG Artist

Samodzielny edytor grafik i animacji pakietu VizRS – projektowanie scen dla [VizRS CG System](https://github.com/sdorpl/VizRS-CG-System)
(lekki odpowiednik Viz Artist dla grafiki telewizyjnej na żywo w OBS). Linux, Windows, macOS (**Tauri 2**: Linux – WebKitGTK 4.1 przez wry, Windows – WebView2, macOS – WKWebView).
Trio (wydawanie na antenę) i wyjście dla OBS należą do VizRS CG System – Artist ich nie dostarcza.

- Działa **bez serwera**: sceny, zasoby i presety animacji w katalogu użytkownika (`show.json`, `assets/` – ten sam
  format co serwer `vizrs`). Na życzenie łączy się z serwerem `vizrs` (lokalnym albo na VPS).
- Kanwa rysuje tym samym kodem co antena (moduły z VizRS CG System), plus to, czego przeglądarka nie daje:
  menu, systemowe „Zapisz jako”, pytanie o zapis przy zamykaniu, kopia robocza po awarii, jedna instancja,
  skojarzenia `.cgpack` / `.vizrs.json`, przeciąganie plików, pisownia polska.

## Pakiet VizRS

VizRS CG Artist to jedna z czterech aplikacji pakietu VizRS, które mają być ze sobą **zawsze zgodne**: [VizRS CG System](../VizRS%20CG%20System) (silnik grafiki, Trio, `/output`), [VizRS CG Playout](../VirtRS%20CG%20Playout) (grafika i sloty na żywo na kanałach ErsatzTV), [VizRS Live](../VizRS%20Live) (panel kanału nad ErsatzTV legacy) i **VizRS CG Artist** (to repo; edytor grafik i animacji). Styki i zasady zgodności: [DOKUMENTACJA §1](docs/DOKUMENTACJA.md#pakiet-vizrs--zgodność-aplikacji).

## Uruchomienie

```bash
cargo build --release                      # Linux: libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxdo-dev libssl-dev
npx @tauri-apps/cli@2 build               # paczki: .deb, .rpm, AppImage, .msi, .exe, .dmg
./target/release/vizrs-cg-artist           # praca lokalna, bez serwera
./target/release/vizrs-cg-artist connect   # najpierw wybór serwera
./target/release/vizrs-cg-artist --connect https://cg.example.pl --token …   # serwer zdalny
./target/release/vizrs-cg-artist paczka.cgpack                               # import paczki
```

Wszystkie opcje: `vizrs-cg-artist --help` i [DOKUMENTACJA §3](docs/DOKUMENTACJA.md#3-uruchamianie-i-opcje).

## Dokumentacja

| Dokument | Dla kogo |
|---|---|
| [Pełna dokumentacja](docs/DOKUMENTACJA.md) | wszyscy – architektura, opcje, menu, most, pliki użytkownika, budowa |
| [Historia zmian](CHANGELOG.md) | wszyscy |
| [Spis wszystkich dokumentów](docs/README.md) | w tym stan prac i znane braki |
| Model sceny, rysowanie, serwer i Trio | repo [VizRS CG System](https://github.com/sdorpl/VizRS-CG-System) (`docs/DOKUMENTACJA.md`) |

Programiści i agenci: [CLAUDE.md](CLAUDE.md) / [GEMINI.md](GEMINI.md) (zasady, struktura, testy, commity).

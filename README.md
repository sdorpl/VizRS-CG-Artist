# VizRS CG Artist

Samodzielny edytor grafik i animacji pakietu VizRS – projektowanie scen dla [VizRS CG System](https://github.com/sdorpl/VizRS-CG-System)
(lekki odpowiednik Viz Artist dla grafiki telewizyjnej na żywo w OBS). Linux, **GTK 4 + WebKitGTK 6.0**.
Trio (wydawanie na antenę) i wyjście dla OBS należą do VizRS CG System – Artist ich nie dostarcza.

- Działa **bez serwera**: sceny, zasoby i presety animacji w katalogu użytkownika (`show.json`, `assets/` – ten sam
  format co serwer `vizrs`). Na życzenie łączy się z serwerem `vizrs` (lokalnym albo na VPS).
- Kanwa rysuje tym samym kodem co antena (moduły z VizRS CG System), plus to, czego przeglądarka nie daje:
  menu, systemowe „Zapisz jako”, pytanie o zapis przy zamykaniu, kopia robocza po awarii, jedna instancja,
  skojarzenia `.cgpack` / `.vizrs.json`, przeciąganie plików, pisownia polska.

## Uruchomienie

```bash
cargo build --release                      # wymaga libgtk-4-dev i libwebkitgtk-6.0-dev
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

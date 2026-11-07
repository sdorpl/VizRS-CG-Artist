# VizRS CG Artist

Natywne okno **Artist** – projektowanie scen grafiki [VizRS CG System](https://github.com/sdorpl/VizRS-CG-System)
(lekki odpowiednik Viz Artist dla grafiki telewizyjnej na żywo w OBS). Linux, **GTK 4 + WebKitGTK 6.0**.

- Ta sama strona Artist co w przeglądarce (przychodzi z serwera `vizrs`), plus to, czego przeglądarka nie daje:
  menu, systemowe „Zapisz jako”, pytanie o zapis przy zamykaniu, kopia robocza po awarii, jedna instancja,
  skojarzenia `.cgpack` / `.vizrs.json`, przeciąganie plików, pisownia polska, wybór serwera (lokalny albo VPS).
- Serwer nie jest wkompilowany: okno dołącza do działającego `vizrs` albo uruchamia go jako osobny proces —
  zamknięcie lub awaria okna nie zdejmuje grafiki z anteny.

## Uruchomienie

```bash
cargo build --release                      # wymaga libgtk-4-dev i libwebkitgtk-6.0-dev
./target/release/vizrs-cg-artist           # serwer lokalny (program vizrs obok albo w PATH)
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
| Dokumentacja strony Artist i serwera | repo [VizRS CG System](https://github.com/sdorpl/VizRS-CG-System) (`docs/DOKUMENTACJA.md`) |

Programiści i agenci: [CLAUDE.md](CLAUDE.md) / [GEMINI.md](GEMINI.md) (zasady, struktura, testy, commity).

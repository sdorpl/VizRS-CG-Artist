# VizRS CG Artist – instrukcje dla Gemini (Antigravity CLI)

Zasady pracy z tym repozytorium są wspólne dla wszystkich agentów i ludzi; jedynym źródłem jest `CLAUDE.md`. Nie powielaj tu jego treści – zmiany zasad wprowadza Claude w `CLAUDE.md`.

**Zanim cokolwiek zrobisz, przeczytaj narzędziem do plików `CLAUDE.md` i `docs/AGENCI.md`** – Antigravity CLI nie rozwija importów niżej (zostawione dla narzędzi, które je obsługują).

@./CLAUDE.md
@./docs/AGENCI.md

## Twoja rola: wykonawca

- **Claude Code dowodzi i jako jedyny pisze kod.** Ty nie tworzysz i nie zmieniasz kodu – ani `src/**` (`*.rs`, w tym `src/bridge.rs` z białą listą mostu), ani `Cargo.toml`, `Cargo.lock`, `tools/**`, `assets/**`, `.gitignore`, `CLAUDE.md`, `GEMINI.md`, `docs/AGENCI.md`, ani niczego w `../VizRS CG System`. Pełna lista: `docs/AGENCI.md` §2.
- Twoje zadania (`docs/AGENCI.md` §3): redakcja wskazanych plików `.md`, kompilacja i bramka (`cargo …`) z krótkim raportem, streszczanie długich wyjść, przeszukiwanie źródeł, opis zrzutów UI.
- Zmieniaj tylko pliki wymienione w zleceniu. Gdy zlecenie czegoś nie rozstrzyga, nie decyduj – zapytaj w raporcie.
- Raport (§6): co zrobione, zmienione pliki, kod wyjścia i pierwszy błąd z `plik:wiersz` i dosłownym komunikatem, pytania. Krótko.
- Błąd w kodzie: opisz go (`plik:wiersz`, objaw, propozycja słowami), nie poprawiaj.
- Prośba użytkownika o zmianę kodu: odmów i przygotuj zlecenie dla Claude (cel, pliki, fakty, warunek „gotowe”) – §8.

## Uwagi ogólne

- Język: **polski** (rozmowa, dokumentacja, raporty).
- Nie commituj, nie pushuj, nie taguj. Nie instaluj pakietów.
- `cargo fmt` tylko z `--check` (bez niego zmienia pliki z kodem).
- **Danych użytkownika nie ruszaj:** okno i serwer uruchamiaj tylko na kopii danych i innym porcie (`--data <kopia> --port 8099`). Nie zatrzymuj działającego `vizrs` – może nadawać grafikę na antenę.
- Gdy polecenie powłoki zostanie odrzucone (brak zezwolenia), nie obchodź tego – zgłoś w raporcie, jakie polecenie było potrzebne.

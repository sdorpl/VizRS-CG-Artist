# VizRS CG Artist

**Samodzielny edytor grafik i animacji** pakietu VizRS (odpowiednik Viz Artist) dla systemu grafiki na żywo
**VizRS CG System** (`../VizRS CG System`), zbudowany na **Tauri 2** (Linux – WebKitGTK 4.1, Windows – WebView2, macOS – WKWebView; od 0.3.0, wcześniej GTK 4). **Trio i wyjście nie są dostarczane
z Artist** (decyzja użytkownika 2026-11-07) – należą do VizRS CG System; okno nie otwiera ich ani nie odsyła do nich.
Kierunek: `../VizRS CG System/docs/plany/PLAN-artist-osobny.md` (A2–A6) i etapy w [docs/STATUS.md](docs/STATUS.md).
Strona Artist (kanwa `renderer.js`, panele) zostaje w JS, jest wkompilowana (`web/`) i domyślnie pracuje **bez serwera** na
magazynie lokalnym w procesie okna; serwer `vizrs` (lokalny albo VPS) jest opcją. Okno daje to, czego przeglądarka nie ma:
menu, systemowe „Zapisz jako”, pytanie przy zamknięciu, kopię roboczą, jedną instancję, skojarzenia i przeciąganie plików.

Język pracy z użytkownikiem i dokumentacji: **polski**. Kod, komentarze i komunikaty UI też są po polsku — pisz zgodnie z otoczeniem.

## Zacznij każdą sesję tutaj

1. Przeczytaj [docs/STATUS.md](docs/STATUS.md) (bieżący etap, następne zadanie), `git log -5` i `git status`.
2. Przeczytaj [docs/LUKI.md](docs/LUKI.md): znane braki, uszeregowane G1 (niezawodność) → G2 (wierność) → G3 (funkcje).
3. Przy zmianie zachowania okna przeczytaj właściwą sekcję [docs/DOKUMENTACJA.md](docs/DOKUMENTACJA.md) — w tym samym commicie ją zaktualizujesz.
4. Model show, rysowanie i serwer opisuje repo `../VizRS CG System` (jego `CLAUDE.md` i `docs/`); format `show.json` jest kontraktem – magazyn lokalny trzyma się reguł serwera.

## Niepodważalne zasady

- **Artist nie jest serwerem anteny.** Nie uruchamia `vizrs`, nie podaje `/output` ani Trio. Magazyn lokalny (`src/local.rs`, `src/store.rs`) obsługuje tylko API potrzebne stronie Artist, tylko na `127.0.0.1`, tylko dla okna (sekret → ciasteczko, kontrola `Host` i `Origin`). Nowy adres API = trasa w `local::route` + limity + test w `local::tests`.
- **Jeden zapisujący na katalog danych.** Magazyn zakłada `.vizrs.lock` w formacie serwera (`/health` z `instance`), więc `vizrs` nie wystartuje na tym katalogu; gdy `vizrs` już na nim pracuje, okno dołącza do serwera (przez pośrednika) zamiast otwierać magazyn. Artist tworzy tylko sceny – strony, playlisty i rundowny Trio w `show.json` zostawia nietknięte.
- **Strona nie ma dostępu do systemu.** Komunikaty strony → okno przechodzą przez białą listę w `src/bridge.rs` (`state`, `close`, `stay`, `draft`, `dialog`) z limitami długości; przyjmowane tylko od strony z serwera strony tego okna (komenda Tauri `ipc`, uprawnienie w `capabilities/artist.json` tylko dla `http://127.0.0.1:*`). Okno połączenia (`ui/connect.html`, `capabilities/connect.json`) jest wbudowane w binarkę — strona nie może przełączyć okna na inny adres. Nowy komunikat = wariant w `bridge::Msg` + limity + test.
- **Strona Artist należy do tego repo, rysowanie – do CG System.** `web/artist.html`, `web/native.js` i `web/native.css` rozwijamy tutaj (od 2026-11-07; `/artist` w serwerze jest zamrożony). Moduły rysowania i wspólne (`renderer.js`, `motion.js`, `qr.js`, `richtext.js`, `ticker-*.js`, `color-picker.js`, `cgpack.js`, `ui.css`, `fonts/`) to **kopie** z `../VizRS CG System/source/web` – nie edytuj ich tutaj: zmiana najpierw w CG System, potem `tools/sync-cg.sh`; `tools/sync-cg.sh --check` (bramka, CI) pilnuje identyczności, bo kanwa ma rysować dokładnie jak antena.
- **Okno nie powiela logiki strony.** Edycja sceny i skróty edycji są w `web/artist.html`; okno tylko wywołuje `window.__vizrsCmd(akcja)` i przekazuje pliki przez `window.__vizrsFile`. Skróty edycji (Ctrl+Z, Ctrl+S…) zostają w stronie: akcelerator menu przechwyciłby je też w polach tekstowych.
- **Strona zawsze z binarki, token zawsze w oknie.** Praca na serwerze idzie przez pośrednika w serwerze strony okna (`local::start_remote`): `/api`, `/assets`, `/events` lecą do `vizrs` z tokenem okna, token nie trafia do strony. Most strony: `window.__vizrsPost` (fallback `window.ipc.postMessage` jak w `vizrs-shell`); zmiana protokołu = zmiana też w `../VizRS CG System/source/shell/` i `source/web/native.js`.
- **Zależności tylko te z `Cargo.toml`:** `tauri`, `tauri-plugin-dialog`, `tauri-plugin-single-instance`, `serde_json`, `ureq` (rustls), `getrandom`, na Linuksie `webkit2gtk` (pisownia). Nowy crate albo wtyczka Tauri — tylko po decyzji użytkownika.
- **Dane z dysku i z sieci są wrogie:** limity (`MAX_FILE` 512 MB, `MAX_DRAFT` 16 MB, `MAX_SAVED` 20 serwerów, odpowiedź HTTP do 1 MB; magazyn: treść 64 MB, nagłówki 64 KB, zasoby 2 GB, nazwy zasobów jak w serwerze), uszkodzony `show.json` nie jest nadpisywany, zapis atomowy (`paths::write_atomic`).
- **Nie wywalaj okna:** błędy przez `Result` i okno dialogowe, nie `unwrap()`/`panic!` na danych z zewnątrz.
- **Numer wersji: rok.miesiąc.rewizja** (`26.11.1` = listopad 2026, pierwsze wydanie w miesiącu; kolejne `26.11.2`, w grudniu od `26.12.1`), bez zer wiodących (semver: Cargo, Tauri, MSI). Znacznik `v<wersja>` = `version` w `Cargo.toml` i `tauri.conf.json` (sprawdza `release.yml`). Wydania idą z gałęzi `main`; `main-oldstable` to stan sprzed 26.11.1.
- **Gdzie co opisywać:** README tylko wprowadza i odsyła; opis działania tylko w `docs/DOKUMENTACJA.md`; zmiany wydania → `CHANGELOG.md` (sekcja „Niewydane”); zamknięta luka → usuń wiersz z `docs/LUKI.md`; stan prac → `docs/STATUS.md`.
- **Dokumentacja razem z kodem:** commit zmieniający zachowanie (menu, skróty, opcje CLI, zmienne `VIZRS_*`, most, pliki użytkownika) aktualizuje w tym samym commicie `docs/DOKUMENTACJA.md` i `CHANGELOG.md`. Zasady pracy są tylko w tym pliku; `GEMINI.md` do niego odsyła i nie powiela treści.

## Współpraca z Gemini

Szczegóły: [docs/AGENCI.md](docs/AGENCI.md); ten sam podział obowiązuje w całym pakiecie VizRS. W skrócie:

- **Claude dowodzi i jako jedyny pisze kod** (także `src/bridge.rs` z białą listą, `Cargo.toml`, `tools/`, pliki zasad).
- **Gemini wykonuje lekkie zadania:** redaguje wskazane pliki `.md`, uruchamia kompilację i bramkę, streszcza długie wyjścia, przeszukuje źródła (także `../VizRS CG System`). Nie commituje.
- **Kontekst Gemini:** `AGENTS.md` to dowiązanie do tego pliku – `agy` sam wczytuje `AGENTS.md` i `GEMINI.md`, także w `-p` (pomiar agy 1.5.3, 2026-11-08: plik 19 KB w całości); importów `@plik` nie rozwija. Zasady zmieniaj tylko tutaj, `GEMINI.md` opisuje wyłącznie rolę wykonawcy i niczego stąd nie powiela.
- **Wywołanie:** `~/.gemini/bin/agy` (poza `PATH`), przełączniki – AGENCI §5. Wygodniej przez wrapper wtyczki antigravity: `PATH="$HOME/.gemini/bin:$PATH" agy-delegate [--tier flash|flash-lo] [--digest] [--mode plan] --dir . "<zlecenie>"`. Wrapper sam stawia `-p` na końcu i odcina stdin. Zamiast kodu 0 zwraca kod błędu: 10 – limit, 11 – logowanie, 12 – przekroczony czas, 14 – brak modelu, 15 – odmowa uprawnień, 3 – pusta odpowiedź. Na stderr wypisuje wiersz `AGY_USAGE` z tokenami i modelem. Tylko subskrypcja Google (bez kluczy API). `--yolo` / `--dangerously-skip-permissions` – nigdy: daje zgodę na cały komputer, a `--sandbox` jej nie ogranicza.
- **Próg opłacalności:** każde zlecenie ma koszt stały (zlecenie, czekanie, przegląd). Małe, jednorazowe i wymagające decyzji zadania rób sam – ich zlecanie to zmierzona strata. Zlecaj duże porcje tekstu przy niewielu decyzjach: prozę dokumentacji (też w kilku repozytoriach naraz, AGENCI §5), przeszukanie dużych źródeł, nieustrukturyzowane logi. Jedno duże zlecenie zamiast wielu małych. Bierz streszczenie (`--digest`), nie surowe wyjście; plików, które przerobił Gemini, nie czytaj ponownie – przeglądaj diff. Logi (bramka, kompilacja, testy) czytaj sam przez plik i filtr (`tail`, `grep`) – AGENCI §4.
- **Weryfikacja:** przed zleceniem migawka `git status` (i `git diff`, gdy pliki mają już zmiany), po zleceniu przegląd diffu – razem z usuniętymi wierszami. Kod 0 i raport „gotowe” niczego nie dowodzą. Bramkę uruchom sam, w czystym stanie – `agy` potrafi zmienić środowisko (połatać pakiety, podstawić atrapy), żeby test przeszedł. Każdą liczbę, ścieżkę i stan etapu sprawdź z kodem (Gemini dopowiada fakty).

## Budowa i uruchamianie

Linux: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxdo-dev libssl-dev`. Windows: WebView2 (jest w 10/11). macOS: Xcode CLT.
Paczki (`.deb`, `.rpm`, AppImage, `.msi`/NSIS, `.dmg`) robi bundler Tauri (`tauri.conf.json`):

```bash
cargo build --release
npx --yes @tauri-apps/cli@2 build          # paczki w target/release/bundle/
./target/release/vizrs-cg-artist --data /tmp/artist-test   # praca lokalna na osobnym katalogu
./target/release/vizrs-cg-artist connect   # najpierw okno wyboru serwera
./target/release/vizrs-cg-artist --help
```

Do testów ręcznych używaj osobnego katalogu danych (`--data <kopia>`), żeby nie ruszać danych użytkownika.
Przy pracy nad oknem **zobacz wynik** — zrzut ekranu (pliki PNG trzymaj poza repo). Do automatów: `--probe skrypt.js --probe-out wynik.json`
(skrypt wykonuje się po wczytaniu strony i odsyła wynik przez `window.__vizrsPost('probe:' + …)`).

## Testy (bramka przed commitem)

```bash
tools/sync-cg.sh --check          # moduły strony = CG System (wersja w web/CG_SYSTEM)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```

Przy zmianie zachowania okna (most, magazyn, serwer, okno połączenia, instancja, `web/artist.html`) także test w działaniu:
`node tests/e2e/okno.js` (kroki z serwerem wymagają zbudowanego `vizrs`; opis: DOKUMENTACJA §11).

## Struktura

| Ścieżka | Rola |
|---|---|
| `src/main.rs` | opcje CLI i `VIZRS_*`, aplikacja Tauri, menu i akcje, okna, komenda `ipc`, „Zapisz jako” dla pobrań, przekazywanie plików, okno połączenia, jedna instancja (wtyczka), `window.json`, `--probe` |
| `src/bridge.rs` | most strona → okno: biała lista komunikatów `app:`, limity, ścieżka kopii roboczej, base64 |
| `src/connect.rs` | okno „Połącz z serwerem”: wbudowana strona, `connections.json`, normalizacja adresu, sprawdzenie serwera |
| `src/local.rs` | magazyn lokalny: serwer na `127.0.0.1`, trasy API, sekret, `Host`/`Origin`, `/events`, blokada `.vizrs.lock` |
| `src/store.rs` | `show.json` (rewizje, konflikty, kopie `kopie/`), `assets/`, `animpresets.json`; tylko sceny |
| `src/http.rs` | minimalny serwer HTTP/1.1 (`std`): parsowanie z limitami, odpowiedzi, strumień zdarzeń |
| `src/web.rs`, `build.rs` | strona `web/` wkompilowana w binarkę, typy plików |
| `src/client.rs` | klient HTTP/1.1 do serwera `vizrs` przez `ureq` (`http`/`https` z rustls, limity, bez przekierowań) |
| `src/deploy.rs` | wysyłka scen na zapisany serwer: stan scen, zasoby, rewizje (`deploy.json`), konflikty |
| `src/server.rs` | właściciel `.vizrs.lock` (`vizrs` albo inne okno Artist), `GET /health` na `127.0.0.1` |
| `src/paths.rs` | katalogi użytkownika (dane, stan, logi), `window.json`, zapis atomowy |
| `assets/vizrs-256.png`, `icons/` | ikona okna; ikony paczek (bundler Tauri) |
| `tauri.conf.json`, `capabilities/`, `ui/connect.html`, `linux/desktop.hbs` | konfiguracja Tauri i paczek, uprawnienia komendy `ipc`, okno połączenia, wpis menu Linux |
| `tests/e2e/okno.js`, `tests/e2e/smoke.js` | test w działaniu przez `--probe` (kroki z `vizrs`, gdy jest); test dymny na każdym systemie |
| `.github/workflows/` | `ci.yml` – bramka, paczki i test dymny na Linux/Windows/macOS, test w działaniu pod Xvfb; `release.yml` – wydanie z trzech systemów (znacznik `v*`); `drafts.yml` – usuwanie szkiców |
| `packaging/pl.vizrs.CgArtist.xml` | typy MIME `.cgpack` / `.vizrs.json` (do paczek Linux) |
| `web/` | strona Artist: `artist.html`, `native.js`, `native.css` (tego repo; wygląd natywny – DOKUMENTACJA §14) + kopie modułów i fontów z CG System; `CG_SYSTEM` – wersja źródła |
| `tools/sync-cg.sh` | kopiowanie i `--check` modułów strony z CG System |
| `gen/`, `permissions/autogenerated/` | wygenerowane przez `tauri-build` — nie commituj |

## Commity

- Jedna spójna zmiana = jeden commit, po polsku, opisowo. Tylko zielone stany.
- Pliki dodawaj jawnie (`git add ścieżka`), nie `git add -A`. Nie commituj `target/`, `gen/`, zrzutów i plików tymczasowych.
- Commit i push tylko na prośbę użytkownika.

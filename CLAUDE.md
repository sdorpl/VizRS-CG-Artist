# VizRS CG Artist

**Samodzielny edytor grafik i animacji** pakietu VizRS (odpowiednik Viz Artist) dla systemu grafiki na żywo
**VizRS CG System** (`../VizRS CG System`), zbudowany na **Tauri 2** (Linux – WebKitGTK 4.1, Windows – WebView2, macOS – WKWebView; od 0.3.0, wcześniej GTK 4). **Trio i wyjście nie są dostarczane
z Artist** (decyzja użytkownika 2026-11-07) – należą do VizRS CG System; okno nie otwiera ich ani nie odsyła do nich.
Kierunek: `../VizRS CG System/docs/plany/PLAN-artist-osobny.md` (A2–A6) i etapy w [docs/STATUS.md](docs/STATUS.md).
Strona Artist (kanwa `renderer.js`, panele) zostaje w JS, jest wkompilowana (`web/`) i domyślnie pracuje **bez serwera** na
magazynie lokalnym w procesie okna; serwer `vizrs` (lokalny albo VPS) jest opcją. Okno daje to, czego przeglądarka nie ma:
menu, systemowe „Zapisz jako”, pytanie przy zamknięciu, kopię roboczą, jedną instancję, skojarzenia i przeciąganie plików.

<!-- pakiet:A – blok wspólny pakietu VizRS; źródło: VizRS CG System/CLAUDE.md, kopie: tools/sync-zasady.sh (nie edytuj w kopii) -->
Język pracy z użytkownikiem, dokumentacji, komentarzy, komunikatów i UI: **polski** – pisz zgodnie z otoczeniem.

## Pakiet VizRS

To repo jest częścią pakietu **VizRS**. Opis całego pakietu (mapa aplikacji, styki, stos, porty, plan porządków): [sdorpl/VizRS](https://github.com/sdorpl/VizRS) (lokalnie `../VizRS`).

| Aplikacja (katalog obok, `../`) | Rola | Dostawca styku |
|---|---|---|
| **VizRS CG System** (`VizRS CG System`) | silnik grafiki: Trio, wyjście `/output`, TCP 6100, HTTP/SSE, `vizrs-render`; źródło wspólnego kodu i zasad pakietu | protokół VizRS, `/output`, `vizrs-render`, format show i `.cgpack` (`docs/API.md`) |
| **VizRS CG Artist** (`VizRS CG Artist`) | edytor scen i animacji (Tauri 2) | – (klient CG System) |
| **VizRS CG Playout** (`VizRS CG Playout`) | sidecar grafiki i live ingest obok ErsatzTV; panel kanału nad ErsatzTV legacy (`panel/`, dawny VizRS Live): VizRS Bridge, natywny klient panelu; stos compose | Live API `:7700`, API panelu i most `/vizrs-bridge/*` (`docs/API.md`) |

VizRS Live (panel, most, okno) połączono 2026-11-15 z VizRS CG Playout w jeden produkt **„VizRS CG Playout”** z jedną wersją i jednym wydaniem (decyzja D1, plan: sdorpl/VizRS §3); repo `sdorpl/VizRS-Live-Playout` przechodzi do archiwum.

Zgodność – wszystkie aplikacje w bieżących wersjach działają razem:
- **Styk zmienia się po obu stronach w tym samym cyklu.** Opis styku jest u dostawcy; klient opisuje tylko, jak z niego korzysta.
- **Starsza wersja sąsiada nie psuje aplikacji ani emisji** – brak nowego pola lub ścieżki to „niedostępne w tej wersji”, nie błąd.
- **Wydania razem:** przed wydaniem sprawdź z bieżącymi wersjami sąsiadów; zmianę wymagającą nowszego sąsiada odnotuj w `CHANGELOG.md` z minimalną wersją.
<!-- /pakiet:A -->

## Zacznij każdą sesję tutaj

<!-- pakiet:S -->
- Przeczytaj [docs/STATUS.md](docs/STATUS.md) (bieżący etap, następne zadanie), `git log -5` i `git status`.
- Przeczytaj [docs/LUKI.md](docs/LUKI.md): znane braki, uszeregowane G1 (niezawodność i bezpieczeństwo) → G2 (wierność) → G3 (funkcje).
- Przy zmianie zachowania przeczytaj właściwą sekcję [docs/DOKUMENTACJA.md](docs/DOKUMENTACJA.md) – w tym samym commicie ją zaktualizujesz.
- Zmiana dotyka styku z inną aplikacją pakietu – przeczytaj opis styku u dostawcy (tabela „Pakiet VizRS”) i sprawdź drugą stronę.
<!-- /pakiet:S -->
- Model show, rysowanie i serwer opisuje repo `../VizRS CG System` (jego `CLAUDE.md` i `docs/`); format `show.json` jest kontraktem – magazyn lokalny trzyma się reguł serwera.

## Niepodważalne zasady

### Wspólne dla pakietu

<!-- pakiet:B -->
- **Emisja nie pada przez nasz błąd.** Błędy przez `Result`, limity czasu na połączeniach, blokady odporne na zatrucie; awaria grafiki, panelu albo zapisu na dysk nie zatrzymuje anteny ani kanału.
- **Dane z zewnątrz są obce.** Wejście z sieci, plików, ErsatzTV i sąsiednich aplikacji – walidacja i limity; tekst do DOM przez `textContent`, a HTML tylko szablonem `html` z `dom.js` (escapuje wstawiane wartości; `setHtml` to jedyne miejsce z `innerHTML`; wyjątek: zamrożony `/artist` CG System); bez `eval`; sekrety (tokeny) nie trafiają do przeglądarki ani do logów.
- **Zależności tylko z listy.** Serwery pakietu (`vizrs`, `vizrs-live`) nie mają zależności zewnętrznych; front-end to czysty JS (moduły ES) bez bundlera, bibliotek i CDN. Wyjątki (okna Tauri, renderer natywny, sidecar) – tylko crate'y wymienione w nagłówku ich `Cargo.toml`; nowa zależność to decyzja użytkownika.
- **Kod wspólny tylko przez synchronizację.** Kod, wygląd (`vizrs-ui.css`), moduły okna (`gpu.rs`, `scale.rs`, `screen.rs`, `conn_url.rs`) i zasady pakietu mają źródło w VizRS CG System; kopie aktualizują skrypty (`tools/sync-cg.sh`, `scripts/sync-ui.sh`, `tools/sync-zasady.sh`) ze sprawdzaniem `--check` w CI – kopii nie edytuje się ręcznie. Cudzy kod tylko na licencji zgodnej z MIT i z wpisem w `THIRD-PARTY.md`. ErsatzTV – wyłącznie przez jego interfejsy (element „script”, ścieżka FFmpeg, startup hook mostu, komendy MediatR), bez kopiowania i bez zmian w jego kodzie.
- **Licencja: MIT** (`LICENSE`, `Copyright (c) 2026 sdorpl`; pole `license` w manifestach); składniki zewnętrzne – `THIRD-PARTY.md`.
- **Numer wersji: rok.miesiąc.rewizja** (`26.11.1` = listopad 2026, pierwsze wydanie w miesiącu; kolejne `26.11.2`, w grudniu od `26.12.1`), bez zer wiodących (semver: Cargo, paczki, obrazy). Znacznik `v<wersja>` = wersja we wszystkich manifestach projektu (lista – „Tego projektu”). Wydania z gałęzi `main`; `main-oldstable` to stan sprzed 26.11.1.
- **Gdzie co opisywać:** README tylko wprowadza i odsyła; opis działania, opcje i zmienne tylko w `docs/DOKUMENTACJA.md` (nie powielaj w README, planach ani STATUS); API, którego aplikacja jest dostawcą – `docs/API.md` (albo sekcja wskazana w „Tego projektu”); praca użytkownika – `docs/INSTRUKCJA*.md`; wdrożenie i awarie – `docs/RUNBOOK.md`; plany – `docs/plany/` + wiersz w `docs/plany/README.md`; opis całego pakietu – sdorpl/VizRS.
- **Dokumentacja razem z kodem:** commit zmieniający zachowanie (UI, API, format, opcje, obrazy) aktualizuje w tym samym commicie `docs/DOKUMENTACJA.md`, a gdy dotyczy codziennej pracy – także instrukcję; API – `docs/API.md`; wdrożenie – `docs/RUNBOOK.md`; zmiany wydania – `CHANGELOG.md` (sekcja „Niewydane”); zamknięta luka – usuń wiersz z `docs/LUKI.md`; zmiana etapu – `docs/STATUS.md`.
- **Produkcji i danych użytkownika nie ruszaj bez prośby.** Testy na kopii danych, innym porcie albo stosie testowym; działających serwerów, stosów i kontenerów nie zatrzymuj (mogą nadawać).
- **Zobacz wynik.** Przy pracy nad UI zrzut ekranu (Playwright; pliki PNG poza repo) i obejrzenie go przed commitem.
<!-- /pakiet:B -->

### Tego projektu

- **Artist nie jest serwerem anteny.** Nie uruchamia `vizrs`, nie podaje `/output` ani Trio. Magazyn lokalny (`src/local.rs`, `src/store.rs`) obsługuje tylko API potrzebne stronie Artist, tylko na `127.0.0.1`, tylko dla okna (sekret → ciasteczko, kontrola `Host` i `Origin`). Nowy adres API = trasa w `local::route` + limity + test w `local::tests`.
- **Jeden zapisujący na katalog danych.** Magazyn zakłada `.vizrs.lock` w formacie serwera (`/health` z `instance`), więc `vizrs` nie wystartuje na tym katalogu; gdy `vizrs` już na nim pracuje, okno dołącza do serwera (przez pośrednika) zamiast otwierać magazyn. Artist tworzy tylko sceny – strony, playlisty i rundowny Trio w `show.json` zostawia nietknięte.
- **Strona nie ma dostępu do systemu.** Komunikaty strony → okno przechodzą przez białą listę w `src/bridge.rs` (`state`, `close`, `stay`, `draft`, `dialog`) z limitami długości; przyjmowane tylko od strony z serwera strony tego okna (komenda Tauri `ipc`, uprawnienie w `capabilities/artist.json` tylko dla `http://127.0.0.1:*`). Okno połączenia (`ui/connect.html`, `capabilities/connect.json`) jest wbudowane w binarkę — strona nie może przełączyć okna na inny adres. Nowy komunikat = wariant w `bridge::Msg` + limity + test.
- **Strona Artist należy do tego repo, rysowanie – do CG System.** `web/artist.html` (z modułami edytora `web/editor/*.js`), `web/native.js` i `web/native.css` rozwijamy tutaj (od 2026-11-07; `/artist` w serwerze jest zamrożony). Moduły rysowania i wspólne (`renderer.js`, `motion.js`, `qr.js`, `richtext.js`, `ticker-*.js`, `color-picker.js`, `cgpack.js`, `pack-ui.js`, `dom.js` – zapis HTML przez szablon `html` z escapowaniem, `ui.css`, `vizrs-ui.css` – wspólny rdzeń wyglądu rodziny VizRS, `fonts/`; także `tests/cgpack-placer.json` – wektory reguł plików paczki dla testu `deploy.rs`) to **kopie** z `../VizRS CG System/source/web` (wektory: `source/tests/vectors/`) – nie edytuj ich tutaj: zmiana najpierw w CG System, potem `tools/sync-cg.sh`; `tools/sync-cg.sh --check` (bramka, CI) pilnuje identyczności, bo kanwa ma rysować dokładnie jak antena.
- **Okno nie powiela logiki strony.** Edycja sceny i skróty edycji są w stronie (`web/artist.html`, `web/editor/`); okno tylko wywołuje `window.__vizrsCmd(akcja)` i przekazuje pliki przez `window.__vizrsFile`. Skróty edycji (Ctrl+Z, Ctrl+S…) zostają w stronie: akcelerator menu przechwyciłby je też w polach tekstowych.
- **Strona zawsze z binarki, token zawsze w oknie.** Praca na serwerze idzie przez pośrednika w serwerze strony okna (`local::start_remote`): `/api`, `/assets`, `/events` lecą do `vizrs` z tokenem okna, token nie trafia do strony. Most strony: `window.__vizrsPost` (fallback `window.ipc.postMessage` jak w `vizrs-shell`); zmiana protokołu = zmiana też w `../VizRS CG System/source/shell/` i `source/web/native.js`.
- **Zależności okna:** tylko z nagłówka `Cargo.toml` – `tauri`, `tauri-plugin-dialog`, `tauri-plugin-single-instance`, `serde_json`, `ureq` (rustls), `getrandom`, na Linuksie `webkit2gtk` (pisownia).
- **Limity danych z dysku i sieci:** `MAX_FILE` 512 MB, `MAX_DRAFT` 16 MB, `MAX_SAVED` 20 serwerów, odpowiedź HTTP do 1 MB; magazyn: treść 64 MB, nagłówki 64 KB, zasoby 2 GB, nazwy zasobów jak w serwerze; uszkodzony `show.json` nie jest nadpisywany, zapis atomowy (`paths::write_atomic`).
- **Okno nie pada:** błędy przez `Result` i okno dialogowe, nie `unwrap()`/`panic!` na danych z zewnątrz.
- **Manifesty wersji:** znacznik `v<wersja>` = `version` w `Cargo.toml` i `tauri.conf.json` (sprawdza CI i `release.yml`).
- **Dokumentacja razem z kodem (uzupełnienie):** dotyczy też menu, skrótów, opcji CLI, zmiennych `VIZRS_*`, mostu i plików użytkownika.

## Współpraca z Gemini

<!-- pakiet:C -->
Szczegóły: [docs/AGENCI.md](docs/AGENCI.md) – wspólny dla pakietu. W skrócie:

- **Claude dowodzi i jako jedyny pisze kod** (lista „Kod” niżej oraz pliki zasad, CI, Docker, testy, skrypty, manifesty, licencje, białe listy, decyzje w planach).
- **Gemini wykonuje lekkie zadania:** redaguje wskazane pliki `.md` z listy „Dokumentacja”, uruchamia bramkę z listy „Bramka” i streszcza wynik, streszcza długie wyjścia, przeszukuje źródła (także sąsiednich repozytoriów pakietu – tylko do czytania). Nie commituje.
- **Kontekst Gemini:** `AGENTS.md` to **kopia** tego pliku (nie dowiązanie: Portainer GitOps odrzuca repozytorium z symlinkiem, a Windows bywa z nimi zawodny) – zmienia się razem z `CLAUDE.md` (`tools/sync-zasady.sh` kopiuje, `--check` w CI porównuje). `agy` sam wczytuje `AGENTS.md` i `GEMINI.md`, także w `-p`; importów `@plik` nie rozwija. `GEMINI.md` i `docs/AGENCI.md` są wspólne dla pakietu (źródło: VizRS CG System) i niczego stąd nie powielają.
- **Wywołanie:** `~/.gemini/bin/agy` (poza `PATH`), przełączniki – AGENCI §5. Wygodniej przez wrapper wtyczki antigravity: `PATH="$HOME/.gemini/bin:$PATH" agy-delegate [-m "Gemini 3.8 Flash (High)"] [--digest] [--mode plan] --dir . "<zlecenie>"` (poziomu `--tier pro` w tej subskrypcji nie ma). Wrapper sam stawia `-p` na końcu i odcina stdin. Zamiast kodu 0 zwraca kod błędu: 10 – limit, 11 – logowanie, 12 – przekroczony czas, 14 – brak modelu, 15 – odmowa uprawnień, 3 – pusta odpowiedź. Na stderr wypisuje wiersz `AGY_USAGE` z tokenami i modelem. Tylko subskrypcja Google (bez kluczy API). `--yolo` / `--dangerously-skip-permissions` – nigdy: daje zgodę na cały komputer, a `--sandbox` jej nie ogranicza.
- **Próg opłacalności:** każde zlecenie ma koszt stały (zlecenie, czekanie, przegląd). Małe, jednorazowe i wymagające decyzji zadania rób sam – ich zlecanie to zmierzona strata. Zlecaj duże porcje tekstu przy niewielu decyzjach: prozę dokumentacji (też w kilku repozytoriach naraz, AGENCI §5), przeszukanie dużych źródeł, nieustrukturyzowane logi. Jedno duże zlecenie zamiast wielu małych. Bierz streszczenie (`--digest`), nie surowe wyjście; plików, które przerobił Gemini, nie czytaj ponownie – przeglądaj diff. Logi (bramka, kompilacja, testy) czytaj sam przez plik i filtr (`tail`, `grep`) – AGENCI §4.
- **Weryfikacja:** przed zleceniem migawka `git status` (i `git diff`, gdy pliki mają już zmiany), po zleceniu przegląd diffu – razem z usuniętymi wierszami. Kod 0 i raport „gotowe” niczego nie dowodzą. Bramkę uruchom sam, w czystym stanie – `agy` potrafi zmienić środowisko (połatać pakiety, podstawić atrapy), żeby test przeszedł. Każdą liczbę, ścieżkę i stan etapu sprawdź z kodem (Gemini dopowiada fakty).
<!-- /pakiet:C -->

### Ten projekt

- **Kod (tylko Claude):** `src/**` (w tym `src/bridge.rs` – biała lista, wbudowana strona okna połączenia, `IPC_SHIM`), `ui/`, `capabilities/`, `permissions/`, `web/artist.html`, `web/editor/`, `web/native.js`, `web/native.css`, kopie z CG System w `web/` (tylko przez `tools/sync-cg.sh`), `tools/**`, `tests/**`, `assets/`, `icons/`, `packaging/`, `linux/`, `build.rs`.
- **Dokumentacja (Gemini – tylko pliki wskazane w zleceniu):** `README.md`, `CHANGELOG.md`, `docs/DOKUMENTACJA.md`, `docs/STATUS.md`, `docs/LUKI.md`, `docs/README.md`.
- **Bramka (Gemini może uruchomić i streścić):** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo build --release`, `tools/sync-cg.sh --check`, `tools/sync-zasady.sh --check`.
- **Zawsze:** okno i serwer tylko na kopii danych i innym porcie (`--data <kopia> --port 8099`); nie zatrzymuj działającego `vizrs` (może nadawać grafikę na antenę).

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
tools/sync-zasady.sh --check      # zasady pakietu = CG System (wersja w docs/ZASADY_CG_SYSTEM)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```

Przy zmianie zachowania okna (most, magazyn, serwer, okno połączenia, instancja, `web/artist.html`, `web/editor/`) także test w działaniu:
`node tests/e2e/okno.js` (kroki z serwerem wymagają zbudowanego `vizrs`; opis: DOKUMENTACJA §11).
Przy zmianie `web/artist.html` albo `web/editor/` także edytor w Chromium: `node tests/e2e/editor.js [vizrs]` (Playwright, `PLAYWRIGHT_DIR=…`; strona z `web/` na serwerze `vizrs --web web`: drzewo, właściwości, oś czasu, pola, kanwa, cofanie, zapis, sceny, grupy, warianty, powiązania).

## Struktura

| Ścieżka | Rola |
|---|---|
| `src/main.rs` | opcje CLI i `VIZRS_*`, stan aplikacji i tryb pracy (lokalnie / serwer), start aplikacji Tauri, jedna instancja (wtyczka), `--probe` |
| `src/menu.rs` | menu i akcje, komendy strony (`PAGE_CMDS`) ze skrótami w zapisie systemu |
| `src/window.rs` | okna: Artist (skrypt mostu `IPC_SHIM`, powiększenie, wygląd systemu, pisownia, odzyskiwanie po awarii strony), okno połączenia, przełączanie serwera, zamykanie, „Zapisz jako” dla pobrań, `window.json` |
| `src/ipc.rs` | komenda `ipc` (komunikaty z białej listy `bridge`), komunikaty okna połączenia i sprawdzenie serwera, przekazywanie plików do strony |
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
| `web/editor/` | moduły edytora: `core.js` (DOM, API, stan, geometria grup, ładowanie), `props.js` (panel Właściwości), `timeline.js` (rysowanie osi czasu), `edit.js` (edycja właściwości, kluczy, pól), `tree.js`, `canvas.js` (płótno, prowadnice, przyciąganie), `refs.js` (sceny odniesienia), `handles.js` (uchwyty, wyrównywanie, menu kontekstowe, edycja tekstu, ramka), `dock.js` (powiązania), `keys.js` (oś czasu: mysz, markery, schowek kluczy), `treedrag.js`, `presets.js`, `scenes.js` (górny pasek, paczka, raport), `keyboard.js` (klawiatura, pasek stanu, rozdzielacze), `main.js` (wejście: `init()` modułów po kolei, okno natywne, wysyłka, połączenie); zmienne innego modułu przypisuje się przez `set…()` |
| `tests/e2e/editor.js` | edytor scen w Chromium (Playwright) na serwerze `vizrs --web web` |
| `.github/workflows/` | `ci.yml` – bramka, paczki i test dymny na Linux/Windows/macOS, test w działaniu pod Xvfb; `release.yml` – wydanie z trzech systemów (znacznik `v*`); `drafts.yml` – usuwanie szkiców |
| `packaging/pl.vizrs.CgArtist.xml` | typy MIME `.cgpack` / `.vizrs.json` (do paczek Linux) |
| `web/` | strona Artist: `artist.html` (HTML i style) i `editor/` (moduły ES skryptu), `native.js`, `native.css` (tego repo; wygląd natywny – DOKUMENTACJA §14) + kopie modułów i fontów z CG System; `CG_SYSTEM` – wersja źródła |
| `tools/sync-cg.sh` | kopiowanie i `--check` modułów strony i modułów okna (`src/gpu.rs`, `scale.rs`, `screen.rs`, `conn_url.rs` z `source/shell/src`) z CG System |
| `tools/sync-zasady.sh`, `docs/ZASADY_CG_SYSTEM` | zasady pakietu (bloki `pakiet:*` w `CLAUDE.md`, `GEMINI.md`, `docs/AGENCI.md`, `AGENTS.md` = kopia) z CG System; wersja źródła |
| `LICENSE`, `THIRD-PARTY.md` | licencja MIT; składniki zewnętrzne (fonty SIL OFL, crate'y Tauri) |
| `gen/`, `permissions/autogenerated/` | wygenerowane przez `tauri-build` — nie commituj |

## Commity

<!-- pakiet:D -->
- Jedna spójna zmiana = jeden commit, po polsku, opisowo (styl historii repo). Tylko zielone stany (bramka z „Testy”).
- Pliki dodawaj jawnie (`git add ścieżka`), nie `git add -A`. Nie commituj katalogów `target/`, zrzutów, logów, plików tymczasowych, `.env` ani sekretów.
- Commit i push tylko na prośbę użytkownika.
<!-- /pakiet:D -->
- Nie commituj `gen/` (schematy Tauri).

# VizRS CG Artist

**Samodzielny edytor grafik i animacji** pakietu VizRS (odpowiednik Viz Artist) dla systemu grafiki na żywo
**VizRS CG System** (`../VizRS CG System`), zbudowany na **GTK 4 + WebKitGTK 6.0** (Linux). **Trio i wyjście nie są dostarczane
z Artist** (decyzja użytkownika 2026-11-07) – należą do VizRS CG System; okno nie otwiera ich ani nie odsyła do nich.
Kierunek: `../VizRS CG System/docs/plany/PLAN-artist-osobny.md` (A2–A6) i etapy w [docs/STATUS.md](docs/STATUS.md). Strona Artist (kanwa `renderer.js`, panele) zostaje w JS i przychodzi
z serwera `vizrs`; to okno daje to, czego przeglądarka nie ma: menu, systemowe „Zapisz jako”, pytanie przy zamknięciu,
kopię roboczą, jedną instancję, skojarzenia plików, przeciąganie plików i wybór serwera.

Język pracy z użytkownikiem i dokumentacji: **polski**. Kod, komentarze i komunikaty UI też są po polsku — pisz zgodnie z otoczeniem.

## Zacznij każdą sesję tutaj

1. Przeczytaj [docs/STATUS.md](docs/STATUS.md) (bieżący etap, następne zadanie), `git log -5` i `git status`.
2. Przeczytaj [docs/LUKI.md](docs/LUKI.md): znane braki, uszeregowane G1 (niezawodność) → G2 (wierność) → G3 (funkcje).
3. Przy zmianie zachowania okna przeczytaj właściwą sekcję [docs/DOKUMENTACJA.md](docs/DOKUMENTACJA.md) — w tym samym commicie ją zaktualizujesz.
4. Zasady strony Artist, serwera i modelu show są w repo `../VizRS CG System` (jego `CLAUDE.md` i `docs/`). Tutaj tylko okno.

## Niepodważalne zasady

- **Serwer nie jest wkompilowany.** Okno dołącza do działającego `vizrs` na tym katalogu danych (blokada `.vizrs.lock` + zgodny `instance` w `/health`) albo uruchamia `vizrs serve --idle-exit 10` jako osobny proces. Awaria okna nie może zdjąć grafiki z anteny.
- **Strona nie ma dostępu do systemu.** Komunikaty strony → okno przechodzą przez białą listę w `src/bridge.rs` (`state`, `close`, `stay`, `draft`) z limitami długości; przyjmowane tylko z tego samego źródła co serwer okna (`same_origin`). Okno połączenia (`connect:`) jest wbudowane w binarkę — strony serwera nie mogą przełączyć okna na inny adres. Nowy komunikat = wariant w `bridge::Msg` + limity + test.
- **Strona Artist należy do tego repo, rysowanie – do CG System.** `web/artist.html` i `web/native.js` rozwijamy tutaj (od 2026-11-07; `/artist` w serwerze jest zamrożony). Moduły rysowania i wspólne (`renderer.js`, `motion.js`, `qr.js`, `richtext.js`, `ticker-*.js`, `color-picker.js`, `btb-io.js`, `cgpack.js`, `ui.css`, `fonts/`) to **kopie** z `../VizRS CG System/source/web` – nie edytuj ich tutaj: zmiana najpierw w CG System, potem `tools/sync-cg.sh`; `tools/sync-cg.sh --check` (bramka, CI) pilnuje identyczności, bo kanwa ma rysować dokładnie jak antena.
- **Okno nie powiela logiki strony.** Edycja sceny i skróty edycji są w `web/artist.html`; okno tylko wywołuje `window.__vizrsCmd(akcja)` i przekazuje pliki przez `window.__vizrsFile`. Skróty edycji (Ctrl+Z, Ctrl+S…) zostają w stronie: akcelerator GTK przechwyciłby je też w polach tekstowych.
- **Zgodność z `vizrs-shell`.** Most ma ten sam kształt co w oknie wry (`window.ipc.postMessage`, `IPC_SHIM`), więc `native.js` serwera działa w obu oknach. Zmiana protokołu = zmiana po obu stronach (`../VizRS CG System/source/shell/`, `source/web/native.js`).
- **Zależności tylko te z `Cargo.toml`:** `gtk4`, `webkit6`, `serde_json`. Nowy crate — tylko po decyzji użytkownika.
- **Dane z dysku i z sieci są wrogie:** limity (`MAX_FILE` 512 MB, `MAX_DRAFT` 16 MB, `MAX_SAVED` 20 serwerów, odpowiedź HTTP do 1 MB), zapis atomowy (`paths::write_atomic`), wpis `.desktop` nie powstaje dla ścieżek ze znakami specjalnymi.
- **Nie wywalaj okna:** błędy przez `Result` i okno dialogowe, nie `unwrap()`/`panic!` na danych z zewnątrz.
- **Gdzie co opisywać:** README tylko wprowadza i odsyła; opis działania tylko w `docs/DOKUMENTACJA.md`; zmiany wydania → `CHANGELOG.md` (sekcja „Niewydane”); zamknięta luka → usuń wiersz z `docs/LUKI.md`; stan prac → `docs/STATUS.md`.
- **Dokumentacja razem z kodem:** commit zmieniający zachowanie (menu, skróty, opcje CLI, zmienne `VIZRS_*`, most, pliki użytkownika) aktualizuje w tym samym commicie `docs/DOKUMENTACJA.md` i `CHANGELOG.md`. Zasady pracy są tylko w tym pliku; `GEMINI.md` do niego odsyła i nie powiela treści.

## Współpraca z Gemini

Szczegóły: [docs/AGENCI.md](docs/AGENCI.md). W skrócie:

- **Claude dowodzi i jako jedyny pisze kod** (także `src/bridge.rs` z białą listą, `Cargo.toml`, `tools/`, pliki zasad).
- **Gemini wykonuje lekkie zadania:** redaguje wskazane pliki `.md`, uruchamia kompilację i bramkę, streszcza długie wyjścia, przeszukuje źródła (także `../VizRS CG System`). Nie commituje.
- Gemini to Antigravity CLI: `~/.gemini/bin/agy` (poza `PATH`), wywołanie i przełączniki – AGENCI §5. Logi (bramka, kompilacja, testy) czytaj sam przez plik i filtr (`tail`, `grep`) – to tańsze niż zlecenie (AGENCI §4). Zlecaj Gemini prozę dokumentacji, przeszukiwanie dużych źródeł i nieustrukturyzowane logi; decyzje i kod zostają u Claude.
- Po zleceniu porównaj `git status` z migawką sprzed zlecenia i przejrzyj diff – wynik Gemini to propozycja.

## Budowa i uruchamianie

Wymaga `libgtk-4-dev` i `libwebkitgtk-6.0-dev`. Bez pakietu `-dev` (jest tylko biblioteka uruchomieniowa) — shim w `.dev/`:

```bash
eval "$(tools/webkit6-shim.sh)"            # tylko gdy brak libwebkitgtk-6.0-dev
cargo build --release
./target/release/vizrs-cg-artist --vizrs ../VizRS\ CG\ System/source/target/release/vizrs
./target/release/vizrs-cg-artist connect   # najpierw okno wyboru serwera
./target/release/vizrs-cg-artist --help
```

Do testów ręcznych używaj kopii danych i innego portu (`--data <kopia> --port 8099`), żeby nie ruszać danych użytkownika.
Przy pracy nad oknem **zobacz wynik** — zrzut ekranu (pliki PNG trzymaj poza repo). Do automatów: `--probe skrypt.js --probe-out wynik.json`
(skrypt wykonuje się po wczytaniu strony i odsyła wynik przez `window.ipc.postMessage('probe:' + …)`).

## Testy (bramka przed commitem)

```bash
tools/sync-cg.sh --check          # moduły strony = CG System (wersja w web/CG_SYSTEM)
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo build --release
```

Przy zmianie zachowania okna (most, serwer, okno połączenia, instancja) także test w działaniu:
`node tests/e2e/okno.js` (wymaga zbudowanego `vizrs`; opis: DOKUMENTACJA §11).

## Struktura

| Ścieżka | Rola |
|---|---|
| `src/main.rs` | opcje CLI i `VIZRS_*`, aplikacja GTK, menu i akcje, okna WebView, „Zapisz jako” dla pobrań, przekazywanie plików, okno połączenia, `--probe` |
| `src/bridge.rs` | most strona → okno: biała lista komunikatów `app:`, limity, ścieżka kopii roboczej, base64 |
| `src/connect.rs` | okno „Połącz z serwerem”: wbudowana strona, `connections.json`, normalizacja adresu, sprawdzenie serwera |
| `src/server.rs` | wyszukiwanie `vizrs`, wolny port, dołączanie do działającego serwera, uruchamianie `vizrs serve --idle-exit` |
| `src/instance.rs` | jedna instancja na katalog danych (gniazdo Unix w `XDG_RUNTIME_DIR`); Windows: jeszcze nie |
| `src/paths.rs` | katalogi użytkownika (dane, stan, logi), `window.json`, zapis atomowy |
| `src/desktop.rs` | ukryty wpis `pl.vizrs.CgArtist.desktop` i ikona (Wayland szuka ikony po identyfikatorze aplikacji) |
| `assets/vizrs-256.png` | ikona okna (wkompilowana) |
| `tests/e2e/okno.js` | test w działaniu przez `--probe` z prawdziwym `vizrs` |
| `.github/workflows/ci.yml` | CI: bramka na Ubuntu 24.04 |
| `packaging/deb/build.sh`, `packaging/pl.vizrs.CgArtist.xml` | paczka `.deb`, typy plików `.cgpack` / `.vizrs.json` |
| `web/` | strona Artist: `artist.html`, `native.js` (tego repo) + kopie modułów i fontów z CG System; `CG_SYSTEM` – wersja źródła |
| `tools/sync-cg.sh` | kopiowanie i `--check` modułów strony z CG System |
| `tools/webkit6-shim.sh` | pliki pkg-config dla budowy bez `libwebkitgtk-6.0-dev` |
| `.dev/` | wygenerowany shim — nie commituj |

## Commity

- Jedna spójna zmiana = jeden commit, po polsku, opisowo. Tylko zielone stany.
- Pliki dodawaj jawnie (`git add ścieżka`), nie `git add -A`. Nie commituj `target/`, `.dev/`, zrzutów i plików tymczasowych.
- Commit i push tylko na prośbę użytkownika.

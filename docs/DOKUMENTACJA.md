# VizRS CG Artist – dokumentacja

Opis działania okna. Strona Artist (kanwa, panele, model sceny), serwer `vizrs` i API opisuje dokumentacja
repozytorium **VizRS CG System** (`docs/DOKUMENTACJA.md`).

## 1. Czym jest VizRS CG Artist

Samodzielny edytor grafik i animacji pakietu VizRS – odpowiednik Viz Artist. Projektuje sceny (szablony) z animacją;
na antenę wydaje je Trio z VizRS CG System, które **nie jest dostarczane z Artist**.

Natywne okno Linux (GTK 4 + WebKitGTK 6.0) dla strony **Artist** – edytora scen VizRS. Strona przychodzi z serwera `vizrs`
(ta sama co w przeglądarce pod `/artist`); okno dodaje menu, „Zapisz jako”, pytanie przy zamknięciu, kopię roboczą,
jedną instancję, skojarzenia plików, przeciąganie plików i wybór serwera.

Odpowiednik okna Artist z `vizrs-shell` (tao + wry) w VizRS CG System – ten sam most strona–okno, więc strona nie rozróżnia okien.

## 2. Architektura

```
vizrs-cg-artist (GTK 4)          vizrs serve (osobny proces)          OBS
 ├─ okno Artist  ── WebView ──►  HTTP /artist, /api, SSE  ◄── /output ──┘
 ├─ okno „Połącz z serwerem” (strona wbudowana)
 └─ gniazdo jednej instancji
```

- **Serwer nie jest wkompilowany.** Kolejność wyboru: `--connect URL` → zapisane „łącz przy uruchomieniu” (o ile nie `--local`)
  → działający `vizrs` na katalogu danych (plik `.vizrs.lock` + zgodny `instance` w `/health`) → uruchomienie
  `vizrs serve --idle-exit 10` na wolnym porcie (od 8088, następne 20; `--port` / `VIZRS_PORT` – dokładnie ten).
  Serwer uruchomiony przez okno kończy pracę sam po 10 s bez okien i wyjść; grafika na antenie przeżywa zamknięcie okna.
- **Program `vizrs`:** `--vizrs` / `VIZRS_BIN`, inaczej plik obok `vizrs-cg-artist`, inaczej `PATH`.
- **Odnośniki** poza serwerem okna i nowe okna strony otwiera przeglądarka systemowa. Okno nie otwiera Trio ani wyjścia –
  należą do VizRS CG System.
- Okno ustawia znacznik okna natywnego – strona chowa zakładki „Artist / Trio / Wyjście” i menu przeglądarki.

## 3. Uruchamianie i opcje

```
vizrs-cg-artist [connect] [opcje] [PLIK]
```

| Opcja | Zmienna | Znaczenie |
|---|---|---|
| `connect` | – | najpierw okno wyboru serwera; serwer lokalny powstaje dopiero po wyborze „Serwer lokalny” (program `vizrs` niepotrzebny do łączenia ze zdalnym) |
| `PLIK` | – | `.cgpack` albo `.vizrs.json` (też obraz, czcionka) – import w oknie Artist |
| `--data KAT` | `VIZRS_DATA` | katalog danych serwera; domyślnie `./vizrs-data`, jeśli ma `show.json`, inaczej `~/.local/share/vizrs` |
| `--port N` | `VIZRS_PORT` | port uruchamianego serwera (domyślnie pierwszy wolny od 8088) |
| `--token T` | `VIZRS_TOKEN` | token serwera |
| `--connect URL` | `VIZRS_CONNECT` | serwer zdalny; sam host → `https://` |
| `--local` | – | serwer lokalny mimo zapisanego łączenia przy uruchomieniu |
| `--gpu on\|off\|auto` | `VIZRS_GPU` | akceleracja sprzętowa WebKit |
| `--vizrs PLIK` | `VIZRS_BIN` | program `vizrs` |
| `--probe JS --probe-out JSON` | – | test: po wczytaniu strony wykonaj skrypt, zapisz wynik z `window.ipc.postMessage('probe:…')`, zakończ |
| `--help`, `--version` | – | |

Błędne argumenty: komunikat na stderr, kod wyjścia 2.

## 4. Menu i skróty

| Menu | Pozycje |
|---|---|
| Plik | Nowe okno Artist · Połącz z serwerem… (Ctrl+Shift+K) · Nowa scena · Zapisz · Eksportuj scenę… · Paczka .cgpack… · Importuj… · Otwórz katalog danych · Zamknij okno (Ctrl+W) · Zakończ (Ctrl+Q) |
| Edycja | Cofnij · Ponów · Duplikuj · Usuń |
| Widok | Dopasuj kanwę · Kanwa 100% · Kanwa do zaznaczenia · Odtwórz / zatrzymaj · Dodaj marker · Powiększ (Ctrl+=) · Pomniejsz (Ctrl+−) · Rozmiar 100% (Ctrl+0) · Odśwież (F5) · Pełny ekran (F11) · Narzędzia deweloperskie (Ctrl+Shift+I) |
| Pomoc | Pokaż logi · Sprawdź aktualizacje · O programie |

Pozycje strony (Nowa scena…Dodaj marker) wywołują `window.__vizrsCmd(akcja)`. Ich skróty (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+D,
Delete, Shift+1/2/3, Spacja, M) obsługuje strona, nie GTK – inaczej działałyby też w polach tekstowych.
Cofnij / Ponów są nieaktywne zgodnie ze stanem zgłoszonym przez stronę.

## 5. Pliki

- **Zapisz jako:** pobrania strony (eksport sceny, paczka) otwierają systemowe okno zapisu.
- **Import:** Importuj…, przeciągnięcie na okno, `PLIK` w wierszu poleceń albo otwarcie skojarzonego pliku.
  Plik (do 512 MB) trafia do strony porcjami po 3 MB (`window.__vizrsFile.begin/chunk/end`); o imporcie decyduje strona.
  Rozszerzenia: `cgpack`, `json`, `png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`, `mp4`, `webm`, `ttf`, `otf`, `woff`, `woff2`.

## 6. Zamykanie i kopia robocza

- Zamknięcie okna ze zmianami pyta stronę (ona zna stan i umie zapisać); strona odpowiada `close` albo `stay`.
  Gdy strona nie odpowie w 5 s, kolejne zamknięcie nie pyta.
- Zakończ (Ctrl+Q): okna bez zmian zamykają się od razu, ze zmianami – po kolei.
- **Kopia robocza:** strona zapisuje niezapisaną scenę komunikatem `draft`; okno trzyma ją w `~/.local/state/vizrs/drafts/<skrót>.json`
  (skrót z adresu serwera i identyfikatora sceny, do 16 MB). Po otwarciu tej sceny okno oddaje kopię stronie (`__vizrsCmd('draft', …)`).

## 7. Jedna instancja

Kolejne uruchomienie na tym samym katalogu danych (bez `--connect` i `--probe`) wysyła prośbę (rodzaj okna, plik) przez gniazdo
`$XDG_RUNTIME_DIR/vizrs-cg-artist-<skrót>.sock` i kończy pracę; działające okno wychodzi na wierzch albo importuje plik.
Aplikacja GTK działa jako `NON_UNIQUE` – jedność pilnuje gniazdo, nie D-Bus.

## 8. Połączenie z serwerem

Okno „Połącz z serwerem” (Plik → Połącz…, Ctrl+Shift+K, `connect`) jest stroną wbudowaną w binarkę – tylko ona może przełączyć okna
na inny adres. Lista do 20 serwerów w `connections.json` (prawa tylko dla właściciela); token zapisywany tylko na życzenie;
opcja „łącz przy uruchomieniu”. Dla `http://` okno sprawdza `GET /api/state` z tokenem przed przełączeniem (token wyjścia → 403).

Uruchomione jako `connect` (bez `--connect` i bez zapisanego łączenia przy uruchomieniu) okno nie ma jeszcze serwera:
nagłówek pokazuje „Teraz: nie połączono”, a prośba kolejnego uruchomienia
(także z plikiem) tylko wysuwa okno połączenia. Zamknięcie okna bez wyboru kończy program.

## 9. Most strona → okno

Strona wysyła `window.ipc.postMessage(tekst)` (shim na `webkit.messageHandlers.ipc`, jak w oknie wry). Okno przyjmuje:

| Prefiks | Od kogo | Komunikaty |
|---|---|---|
| `app:` | tylko strona z serwera okna (to samo źródło) | `state` (tytuł ≤ 200 znaków, `dirty`, `undo`, `redo`, `scene` ≤ 128), `close`, `stay`, `draft` (`id` ≤ 128, `data` ≤ 16 MB albo `null` = usuń) |
| `connect:` | tylko okno połączenia | wybór, zapis i usunięcie serwera |
| `probe:` | skrypt `--probe` | wynik testu |

Wszystko inne jest ignorowane. Okno → strona: `window.__vizrsCmd(akcja[, dane])`, `window.__vizrsFile`.

## 10. Pliki użytkownika

| Plik | Linux |
|---|---|
| dane serwera | `--data`, domyślnie `./vizrs-data` albo `~/.local/share/vizrs` |
| zapisane serwery | `~/.config/vizrs/connections.json` (`VIZRS_CONFIG` – inny katalog) |
| wygląd okna | `~/.config/vizrs/window.json`, klucz `cg-artist` (rozmiar, położenie na X11, maksymalizacja, powiększenie, ostatnia scena) |
| logi serwera, kopie robocze | `~/.local/state/vizrs/` |
| wpis pulpitu, ikona | `~/.local/share/applications/pl.vizrs.CgArtist.desktop` (ukryty, `.cgpack`), `~/.local/share/icons/hicolor/256x256/apps/vizrs.png` – tylko gdy brak wpisu systemowego |

Bez zapisanego wyglądu okno Artist otwiera się zmaksymalizowane. Zapisy są atomowe; uszkodzony plik = wartości domyślne.

## 11. Budowa i testy

```bash
sudo apt install libgtk-4-dev libwebkitgtk-6.0-dev
cargo build --release
```

Bez `libwebkitgtk-6.0-dev` (jest tylko `libwebkitgtk-6.0-4`): `eval "$(tools/webkit6-shim.sh)"` zakłada w `.dev/` pliki pkg-config
i dowiązania `.so`, potem `cargo build`.

Paczka Debian/Ubuntu (Ubuntu 24.04+ / Debian 13+ – wcześniejsze nie mają WebKitGTK 6.0):

```bash
packaging/deb/build.sh [ścieżka-do-vizrs-cg-artist] [wersja] [katalog]   # domyślnie: target/release, Cargo.toml, .
```

| W paczce | Plik |
|---|---|
| program | `/usr/bin/vizrs-cg-artist` |
| skróty w menu | `pl.vizrs.CgArtist.desktop` (VizRS CG Artist, `%f`, skojarzenia `.cgpack` i `.vizrs.json`), `pl.vizrs.CgArtist.Connect.desktop` (serwer zdalny, `connect`) |
| ikona | `/usr/share/icons/hicolor/256x256/apps/pl.vizrs.CgArtist.png` |
| typy plików | `/usr/share/mime/packages/pl.vizrs.CgArtist.xml` (te same typy co w pakiecie `vizrs`) |

Zależności: `libgtk-4-1`, `libwebkitgtk-6.0-4`; zalecany pakiet `vizrs` (serwer w `/usr/bin` – okno znajduje go obok siebie).
Pliki nazwane po identyfikatorze aplikacji, więc paczka instaluje się obok pakietu `vizrs` bez konfliktów. Z wpisem systemowym
okno nie zakłada ukrytego wpisu w `~/.local/share/applications`. CI buduje paczkę i sprawdza wpisy `desktop-file-validate`.

Bramka przed commitem: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo build --release`.
To samo robi CI (`.github/workflows/ci.yml`, Ubuntu 24.04).

Test w działaniu (prawdziwy `vizrs`, widoczne okna na kilka sekund; bez ekranu: `xvfb-run`):

```bash
node tests/e2e/okno.js [ścieżka-do-vizrs] [ścieżka-do-vizrs-cg-artist]
```

Domyślnie `../VizRS CG System/source/target/release/vizrs` (albo `VIZRS_BIN`) i `target/release/vizrs-cg-artist`.
Sprawdza most okna (pytanie przy zamykaniu, plik od okna, ignorowanie nieznanych komunikatów), jedną instancję,
uruchamianie i dołączanie do serwera, `--idle-exit`, blokadę katalogu danych, okno połączenia (token, zapis, prawa pliku,
`connect` bez programu `vizrs`) i to, że strona serwera nie przełącza okna na inny adres. Katalogi konfiguracji, stanu
i gniazdo instancji są tymczasowe (`KEEP_TMP=1` – zostaw je do wglądu).

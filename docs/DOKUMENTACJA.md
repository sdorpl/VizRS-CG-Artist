# VizRS CG Artist – dokumentacja

Opis działania programu. Model sceny, rysowanie (`renderer.js`), serwer `vizrs` i jego API opisuje dokumentacja
repozytorium **VizRS CG System** (`docs/DOKUMENTACJA.md`).

## 1. Czym jest VizRS CG Artist

Samodzielny edytor grafik i animacji pakietu VizRS – odpowiednik Viz Artist. Projektuje sceny (szablony) z animacją;
na antenę wydaje je Trio z VizRS CG System, które **nie jest dostarczane z Artist**.

Natywny program Linux (GTK 4 + WebKitGTK 6.0). Strona **Artist** (kanwa, panele) jest wkompilowana w binarkę i domyślnie
pracuje **bez serwera** – na magazynie lokalnym w katalogu danych. Okno dodaje menu, „Zapisz jako”, pytanie przy zamknięciu,
kopię roboczą, jedną instancję, skojarzenia plików, przeciąganie plików i połączenie z serwerem `vizrs` (lokalnym albo VPS).

Most strona–okno ma ten sam kształt co w `vizrs-shell` (tao + wry) z VizRS CG System.

## 2. Architektura

```
vizrs-cg-artist (jeden proces)
 ├─ okno Artist ── WebView ──► magazyn lokalny 127.0.0.1:<losowy>  (strona z binarki + API na katalogu danych)
 │                        └──► albo serwer vizrs (lokalny / VPS)    (jego /artist, /api, /events)
 ├─ okno „Połącz z serwerem” (strona wbudowana)
 └─ gniazdo jednej instancji
```

- **Kolejność wyboru:** `--connect URL` → zapisane „łącz przy uruchomieniu” (o ile nie `--local`) → serwer `vizrs` działający
  na katalogu danych (plik `.vizrs.lock` + zgodny `instance` w `/health`; okno dołącza, żeby `show.json` miał jednego
  zapisującego) → **magazyn lokalny**. Artist nie uruchamia `vizrs`.
- **Magazyn lokalny** (§12) odpowiada tym samym API co serwer, więc strona nie zna różnicy poza `GET /api/state` → `mode: "local"`.
- **Odnośniki** poza serwerem okna i nowe okna strony otwiera przeglądarka systemowa. Okno nie otwiera Trio ani wyjścia –
  należą do VizRS CG System.
- Okno ustawia znacznik okna natywnego – strona chowa zakładki „Artist / Trio / Wyjście” i menu przeglądarki.

## 3. Uruchamianie i opcje

```
vizrs-cg-artist [connect] [opcje] [PLIK]
```

| Opcja | Zmienna | Znaczenie |
|---|---|---|
| `connect` | – | najpierw okno wyboru serwera; magazyn lokalny powstaje dopiero po wyborze „Praca lokalna (bez serwera)” |
| `PLIK` | – | `.cgpack` albo `.vizrs.json` (też obraz, czcionka) – import w oknie Artist |
| `--data KAT` | `VIZRS_ARTIST_DATA` | katalog danych Artist; domyślnie `~/.local/share/vizrs-cg-artist`. Może być katalogiem serwera `vizrs` (ten sam układ plików) |
| `--token T` | `VIZRS_TOKEN` | token serwera (`--connect` albo `vizrs` na katalogu danych) |
| `--connect URL` | `VIZRS_CONNECT` | serwer zdalny; sam host → `https://` |
| `--local` | – | praca lokalna mimo zapisanego łączenia przy uruchomieniu |
| `--gpu on\|off\|auto` | `VIZRS_GPU` | akceleracja sprzętowa WebKit |
| `--probe JS --probe-out JSON` | – | test: po wczytaniu strony wykonaj skrypt, zapisz wynik z `window.ipc.postMessage('probe:…')`, zakończ |
| `--help`, `--version` | – | |

Błędne argumenty: komunikat na stderr, kod wyjścia 2.

## 4. Menu i skróty

| Menu | Pozycje |
|---|---|
| Plik | Nowe okno Artist · Połącz z serwerem… (Ctrl+Shift+K) · Nowa scena · Zapisz · Eksportuj scenę… · Paczka .cgpack… · Wyślij na serwer… · Importuj… · Otwórz katalog danych · Zamknij okno (Ctrl+W) · Zakończ (Ctrl+Q) |
| Edycja | Cofnij · Ponów · Duplikuj · Usuń |
| Widok | Dopasuj kanwę · Kanwa 100% · Kanwa do zaznaczenia · Odtwórz / zatrzymaj · Dodaj marker · Powiększ (Ctrl+=) · Pomniejsz (Ctrl+−) · Rozmiar 100% (Ctrl+0) · Odśwież (F5) · Pełny ekran (F11) · Narzędzia deweloperskie (Ctrl+Shift+I) |
| Pomoc | Pokaż logi · Sprawdź aktualizacje · O programie |

Pozycje strony (Nowa scena…Dodaj marker, Wyślij na serwer) wywołują `window.__vizrsCmd(akcja)`. Ich skróty (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+D,
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
  (skrót z adresu serwera – w pracy lokalnej z katalogu danych – i identyfikatora sceny, do 16 MB). Po otwarciu tej sceny okno oddaje kopię stronie (`__vizrsCmd('draft', …)`).

## 7. Jedna instancja

Kolejne uruchomienie na tym samym katalogu danych (bez `--connect` i `--probe`) wysyła prośbę (rodzaj okna, plik) przez gniazdo
`$XDG_RUNTIME_DIR/vizrs-cg-artist-<skrót>.sock` i kończy pracę; działające okno wychodzi na wierzch albo importuje plik.
Aplikacja GTK działa jako `NON_UNIQUE` – jedność pilnuje gniazdo, nie D-Bus.

## 8. Połączenie z serwerem

Okno „Połącz z serwerem” (Plik → Połącz…, Ctrl+Shift+K, `connect`) jest stroną wbudowaną w binarkę – tylko ona może przełączyć okna
na inny adres. Lista do 20 serwerów w `connections.json` (prawa tylko dla właściciela); token zapisywany tylko na życzenie;
opcja „łącz przy uruchomieniu”. Przed przełączeniem okno sprawdza `GET /api/state` z tokenem – `http://` i `https://`
(klient `gio` z TLS systemu; zły certyfikat = błąd) – i zgłasza brak serwera, zły token albo token wyjścia (403).

Uruchomione jako `connect` (bez `--connect` i bez zapisanego łączenia przy uruchomieniu) okno nie ma jeszcze serwera:
nagłówek pokazuje „Teraz: nie połączono”, a prośba kolejnego uruchomienia
(także z plikiem) tylko wysuwa okno połączenia. Zamknięcie okna bez wyboru kończy program.

Przycisk **Praca lokalna (bez serwera)** wraca do magazynu lokalnego (albo do `vizrs` pracującego na katalogu danych).

## 9. Most strona → okno

Strona wysyła `window.ipc.postMessage(tekst)` (shim na `webkit.messageHandlers.ipc`, jak w oknie wry). Okno przyjmuje:

| Prefiks | Od kogo | Komunikaty |
|---|---|---|
| `app:` | tylko strona z bieżącego adresu okna (magazyn lokalny albo wybrany serwer – to samo źródło) | `state` (tytuł ≤ 200 znaków, `dirty`, `undo`, `redo`, `scene` ≤ 128), `close`, `stay`, `draft` (`id` ≤ 128, `data` ≤ 16 MB albo `null` = usuń) |
| `connect:` | tylko okno połączenia | wybór, zapis i usunięcie serwera |
| `probe:` | skrypt `--probe` | wynik testu |

Wszystko inne jest ignorowane. Okno → strona: `window.__vizrsCmd(akcja[, dane])`, `window.__vizrsFile`.

## 10. Pliki użytkownika

| Plik | Linux |
|---|---|
| dane Artist | `--data`, domyślnie `~/.local/share/vizrs-cg-artist/`: `show.json`, `assets/`, `animpresets.json`, `kopie/` (§12) |
| zapisane serwery | `~/.config/vizrs/connections.json` (`VIZRS_CONFIG` – inny katalog) |
| wygląd okna | `~/.config/vizrs/window.json`, klucz `cg-artist` (rozmiar, położenie na X11, maksymalizacja, powiększenie, ostatnia scena) |
| kopie robocze | `~/.local/state/vizrs/drafts/` |
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

Zależności: `libgtk-4-1`, `libwebkitgtk-6.0-4`. Pakiet `vizrs` (serwer, Trio) jest tylko sugerowany – Artist działa bez niego.
Pliki nazwane po identyfikatorze aplikacji, więc paczka instaluje się obok pakietu `vizrs` bez konfliktów. Z wpisem systemowym
okno nie zakłada ukrytego wpisu w `~/.local/share/applications`. CI buduje paczkę i sprawdza wpisy `desktop-file-validate`.

Strona Artist leży w `web/`. `artist.html` i `native.js` rozwija to repo; reszta (moduły rysowania, `ui.css`, fonty i `fonts.css`)
to kopie z VizRS CG System – `tools/sync-cg.sh [katalog-CG]` kopiuje, `tools/sync-cg.sh --check` sprawdza identyczność
(CI pobiera CG System w wersji z `web/CG_SYSTEM`). Zmiana rysowania zawsze najpierw w CG System.

Bramka przed commitem: `tools/sync-cg.sh --check`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo build --release`.
To samo robi CI (`.github/workflows/ci.yml`, Ubuntu 24.04, przy każdym wypchnięciu i PR), plus paczka `.deb` jako artefakt
i job `e2e`: test w działaniu pod Xvfb z serwerem `vizrs` zbudowanym z CG System w wersji z `web/CG_SYSTEM`.

**Wydanie** (`.github/workflows/release.yml`): podnieś `version` w `Cargo.toml` i sekcję w `CHANGELOG.md`, potem
`git tag v<wersja> && git push origin v<wersja>` – albo Actions → Release → Run workflow (bez `publish` = szkic; szkice usuwa
Actions → Usuń szkic wydania). Wydanie zawiera `VizRS-CG-Artist-<wersja>-linux-x86_64.tar.gz`, `vizrs-cg-artist_<wersja>_amd64.deb`
i `SHA256SUMS.txt`; wersja ze znacznika musi się zgadzać z `Cargo.toml`, łącznik (`-rc1`) = wydanie wstępne.

Test w działaniu (widoczne okna na kilka sekund; bez ekranu: `xvfb-run`):

```bash
node tests/e2e/okno.js [ścieżka-do-vizrs] [ścieżka-do-vizrs-cg-artist]
```

Domyślnie `../VizRS CG System/source/target/release/vizrs` (albo `VIZRS_BIN`) i `target/release/vizrs-cg-artist`.
Sprawdza pracę lokalną bez serwera (strona z binarki, zapis do `show.json`, zasoby, brak stron Trio), most okna (pytanie
przy zamykaniu, plik od okna), jedną instancję, wzajemną blokadę katalogu z `vizrs`, dołączanie do `vizrs` na katalogu danych,
okno połączenia (token, zapis, prawa pliku, „Praca lokalna”) i to, że strona serwera nie przełącza okna na inny adres.
Bez programu `vizrs` kroki z serwerem są pomijane. Katalogi konfiguracji, stanu
i gniazdo instancji są tymczasowe (`KEEP_TMP=1` – zostaw je do wglądu).

## 12. Magazyn lokalny

Praca bez serwera: okno uruchamia w swoim procesie serwer HTTP na `127.0.0.1:<losowy port>` (tylko `std`, `src/http.rs`),
który podaje stronę z binarki (`web/`) i API na katalogu danych (`src/store.rs`, `src/local.rs`).

| Adres | Działanie |
|---|---|
| `/artist`, `/<moduł>.js`, `/ui.css`, `/fonts/fonts.css`, `/fonts/<plik>.woff2` | strona i fonty z binarki |
| `GET/PUT /api/show` | cały show; `PUT` z rozbieżnym `rev` → 409 (`?force=1` nadpisuje) |
| `POST /api/scenes`, `PUT /api/scenes/<id>`, `DELETE /api/scenes/<id>` | sceny z rewizją `rev` jak w serwerze (konflikt → 409); usunięcie sceny usuwa też jej strony Trio z pliku |
| `/api/pages`, `/api/playlists`, `/api/rundowns`, `/api/macros` | **400** – obiekty Trio; Artist ich nie tworzy, a istniejące w `show.json` zostawia |
| `GET /api/state` | `{"mode":"local", "rev", "layers":[]}` – strona chowa „Utwórz stronę w Trio” i nie importuje stron z paczek |
| `GET/PUT /api/animpresets` | presety animacji (`animpresets.json`, do 500) |
| `GET/POST/DELETE /api/assets`, `GET /assets/<nazwa>` | zasoby w `assets/`: nazwy jak w serwerze, rozszerzenia obrazów, wideo i fontów, łącznie do 2 GB |
| `/api/lock/…`, `/api/unlock/…` | zawsze przyznane (jeden program na katalog) |
| `GET /events` | zdarzenia zmian (`text/event-stream`) dla wszystkich okien Artist |
| `GET /health` | `instance` blokady – bez sekretu (sprawdza go `vizrs`) |
| `GET /api/deploy/servers`, `POST /api/deploy/check`, `POST /api/deploy` | wysyłka scen na serwer (§13) |

- **Dostęp tylko z okna:** jednorazowy sekret (24 bajty z `/dev/urandom`) w adresie strony (`?token=`) zamienia się
  w ciasteczko `HttpOnly; SameSite=Strict`; bez niego 401. Nagłówek `Host` musi być adresem magazynu (403 – ochrona przed
  DNS rebinding), zmiany z innego `Origin` → 403. Treść do 64 MB, nagłówki do 64 KB, do 64 połączeń.
- **Blokada katalogu:** `.vizrs.lock` w formacie serwera (`pid`, `addr`, `instance`, `app: "vizrs-cg-artist"`). Serwer `vizrs`
  nie wystartuje na katalogu otwartym w Artist; po awarii martwą blokadę rozpoznaje po `/health`.
- **Zapis:** `show.json` atomowo; przed zapisem kopia `kopie/show-<czas>.json` najwyżej co 5 min, ostatnie 20.
  Uszkodzony `show.json` = komunikat przy starcie, plik nie jest nadpisywany.
- **Walidacja:** podstawowa (typy, długości identyfikatorów i nazw, rozmiar sceny); pełna walidacja jak w serwerze – po
  wydzieleniu `vizrs-model` w CG System (LUKI).

## 13. Wysyłka na serwer

Praca lokalna → serwer `vizrs` (studio, VPS), z którego Trio wydaje grafikę: **⇧ Wyślij** na pasku albo Plik → Wyślij na serwer…
(przy pracy na serwerze przycisku nie ma – zapis od razu zmienia scenę na serwerze).

- **Serwery:** tylko z listy zapisanych w oknie „Połącz z serwerem”; token bierze okno z `connections.json` („zapamiętaj token”),
  strona widzi tylko adresy. Dodanie serwera: Połącz z serwerem → adres, token, „zapamiętaj token” → Połącz, potem w tym samym
  oknie **Praca lokalna**. Ostatnio wybrany serwer strona pamięta (`localStorage`).
- **Sprawdzenie** (`/api/deploy/check`, przy każdej zmianie wyboru): stan każdej sceny na serwerze – *nowa*, *bez zmian od ostatniej
  wysyłki*, *zmieniona na serwerze od ostatniej wysyłki*, *na serwerze jest scena o tym id, niewysłana stąd* – oraz warstwy,
  na których scena jest **na antenie** (pytanie przed wysłaniem), i liczba zasobów do wysłania.
- **Wysyłka** (`/api/deploy`): scena zapisana na dysku (niezapisane zmiany strona najpierw zapisuje), `PUT /api/scenes/<id>`
  z rewizją zapamiętaną po poprzedniej wysyłce (`deploy.json` w katalogu danych, osobno dla każdego serwera). Gdy scenę zmieniono na
  serwerze w międzyczasie, serwer odpowiada 409 – scena czeka na zaznaczenie **nadpisz** (wysyłka bez rewizji). Zasoby sceny
  (`cgpack.sceneAssets`) idą przed sceną, tylko te, których na serwerze nie ma; pliku o tej samej nazwie okno nie nadpisuje.
- Raport: wysłane sceny i zasoby, pominięte (już na serwerze), konflikty i błędy serwera (walidacja `validate.rs`).
- Klient: HTTP/1.1 przez `gio::SocketClient` (`src/client.rs`), `http://` i `https://`, `Content-Length` i `chunked`, odpowiedź do 64 MB, 20 s na żądanie.


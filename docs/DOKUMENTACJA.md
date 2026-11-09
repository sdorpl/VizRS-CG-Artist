# VizRS CG Artist – dokumentacja

Opis działania programu. Model sceny, rysowanie (`renderer.js`), serwer `vizrs` i jego API opisuje dokumentacja
repozytorium **VizRS CG System** (`docs/DOKUMENTACJA.md`).

## 1. Czym jest VizRS CG Artist

Samodzielny edytor grafik i animacji pakietu VizRS – odpowiednik Viz Artist. Projektuje sceny (szablony) z animacją;
na antenę wydaje je Trio z VizRS CG System, które **nie jest dostarczane z Artist**.

Natywny program wieloplatformowy na **Tauri 2** (Linux, Windows, macOS; silniki WebView: Linux – WebKitGTK 4.1 przez wry, Windows – WebView2, macOS – WKWebView; wersja 0.3.0). Strona **Artist** (kanwa, panele) jest wkompilowana w binarkę i domyślnie
pracuje **bez serwera** – na magazynie lokalnym w katalogu danych. Okno dodaje menu, „Zapisz jako”, pytanie przy zamknięciu,
kopię roboczą, jedną instancję, skojarzenia plików, przeciąganie plików i połączenie z serwerem `vizrs` (lokalnym albo VPS).

Most strona–okno opiera się na komendzie Tauri `ipc` wywoływanej przez `window.__vizrsPost` i zachowuje strukturę komunikatów znaną z `vizrs-shell`.

## 2. Architektura

```
vizrs-cg-artist (jeden proces Tauri 2)
 ├─ okna Artist (artist-*) ── WebView ──► serwer strony 127.0.0.1:<losowy> (strona z binarki)
 │                                          ├─ praca lokalna: magazyn lokalny (show.json, assets/)
 │                                          └─ praca na serwerze: pośrednik do vizrs (/api, /assets, /events)
 ├─ okno „Połącz z serwerem” (connect) ── strona ui/connect.html (frontendDist)
 └─ jedna instancja (tauri-plugin-single-instance: Linux, Windows, macOS)
```

- **Strona Artist z binarki:** strona jest zawsze serwowana z binarki przez serwer strony w procesie okna (`127.0.0.1`, losowy port, sekret → ciasteczko). Praca lokalna: API z magazynu lokalnego. Praca na serwerze (`--connect`, okno połączenia, dołączenie do `vizrs` pracującego na katalogu danych): ten sam serwer strony działa jako **pośrednik** (`src/local.rs`: `start_remote`, `proxy`) – `/api`, `/assets`, `/events` idą do serwera `vizrs` z tokenem trzymanym w oknie; **token nie trafia do strony**, a adres strony w oknie się nie zmienia (wcześniej okno wczytywało `/artist` bezpośrednio z serwera).
- **Kolejność wyboru:** `--connect URL` → zapisane „łącz przy uruchomieniu” (o ile nie `--local`) → serwer `vizrs` działający
  na katalogu danych (plik `.vizrs.lock` + zgodny `instance` w `/health`; okno dołącza przez pośrednika, żeby `show.json` miał jednego
  zapisującego) → **magazyn lokalny**. Artist nie uruchamia `vizrs`.
- **Magazyn lokalny** (§12) odpowiada tym samym API co serwer, więc strona nie zna różnicy poza `GET /api/state` → `mode: "local"`.
- **Odnośniki** poza serwerem okna i nowe okna strony otwiera przeglądarka systemowa. Okno nie otwiera Trio ani wyjścia –
  należą do VizRS CG System.
- Okno ustawia znacznik okna natywnego (`__vizrsShell`, z systemem `os`) – strona chowa zakładki „Artist / Trio / Wyjście” i zachowuje się jak program, nie strona (§14).

## 3. Uruchamianie i opcje

```
vizrs-cg-artist [connect] [opcje] [PLIK]
```

| Opcja | Zmienna | Znaczenie |
|---|---|---|
| `connect` | – | najpierw okno wyboru serwera; magazyn lokalny powstaje dopiero po wyborze „Praca lokalna (bez serwera)” |
| `PLIK` | – | `.cgpack` albo `.vizrs.json` (też obraz, czcionka) – import w oknie Artist |
| `--data KAT` | `VIZRS_ARTIST_DATA` | katalog danych Artist; domyślnie katalog danych użytkownika/vizrs-cg-artist |
| `--token T` | `VIZRS_TOKEN` | token serwera (`--connect` albo dołączenie do serwera `vizrs` na katalogu danych) |
| `--connect URL` | `VIZRS_CONNECT` | serwer zdalny (np. https://cg.example.pl) |
| `--local` | – | praca lokalna mimo zapisanego łączenia przy uruchomieniu |
| `--probe JS --probe-out JSON` | – | test: po wczytaniu strony wykonaj skrypt, zapisz wynik `probe:…`, zakończ (pytania strony dostają od razu ostatni przycisk – „Anuluj”) |
| – | `VIZRS_DEVTOOLS=1` | narzędzia deweloperskie WebView (Widok → Narzędzia deweloperskie, CmdOrCtrl+Shift+I); bez tej zmiennej tylko w kompilacji testowej |
| `--help`, `-h` | – | pomoc |
| `--version`, `-V` | – | wersja programu |

Błędne argumenty: komunikat na stderr, kod wyjścia 1.

## 4. Menu i skróty

| Menu | Pozycje |
|---|---|
| Plik | Nowe okno (CmdOrCtrl+Shift+N) · Nowa scena · Importuj… (CmdOrCtrl+O) · Zapisz (Ctrl+S) · Eksportuj scenę… · Paczka .cgpack… · Wyślij na serwer… · Połącz z serwerem… (CmdOrCtrl+Shift+K) · Zamknij okno (CmdOrCtrl+W) · Zakończ (Linux: Ctrl+Q; Windows: bez skrótu – Alt+F4 zamyka okno) |
| Edycja | Cofnij (Ctrl+Z) · Ponów (Ctrl+Y) · Duplikuj (Ctrl+D) · Usuń (Delete) |
| Widok | Dopasuj kanwę (Shift+1) · Kanwa 100% (Shift+2) · Kanwa do zaznaczenia (Shift+3) · Powiększ interfejs (CmdOrCtrl+=) · Pomniejsz interfejs (CmdOrCtrl+−) · Interfejs 100% (CmdOrCtrl+0) · Wczytaj ponownie (F5; przy niezapisanych zmianach najpierw pytanie) · Pełny ekran (F11) · Narzędzia deweloperskie (tylko z `VIZRS_DEVTOOLS=1`) |
| Scena | Odtwórz / zatrzymaj (Spacja) · Dodaj marker (M) |
| Pomoc | Pokaż logi · Otwórz katalog danych · Sprawdź aktualizacje · O programie |

Menu trzyma się konwencji systemu:
- **Windows:** mnemoniki (Alt+P – Plik, Alt+E – Edycja, Alt+W – Widok, Alt+S – Scena, Alt+C – Pomoc); skróty strony w kolumnie skrótów menu (etykieta z tabulatorem, jak w Win32), ciemne menu i pasek tytułu.
- **macOS:** pierwsze podmenu to menu aplikacji **VizRS CG Artist** (O programie VizRS CG Artist, Usługi, Ukryj, Ukryj pozostałe, Pokaż wszystkie, Zakończ VizRS CG Artist ⌘Q – własna pozycja, więc niezapisane sceny dostają pytanie); Edycja ma też Wytnij, Kopiuj, Wklej, Zaznacz wszystko; menu **Okno** (Minimalizuj, Powiększ, Pełny ekran ⌃⌘F, Wszystkie na wierzch) jest menu okien systemu, Pomoc – menu pomocy (z wyszukiwaniem). Skróty strony pokazane symbolami (⌘S, ⇧1, ⌫). Zakończ i Pełny ekran F11 nie występują w Pliku/Widoku.
- **Linux:** mnemoniki jak na Windows, skróty strony w nawiasie, ciemny wariant motywu GTK.
- **O programie:** systemowe okno „O programie” (macOS – panel z ikoną, Linux – GtkAboutDialog, Windows – okno komunikatu): wersja, wersja modułów CG System, katalog danych, odnośnik do wydań.

Pozycje strony wywołują `window.__vizrsCmd(akcja)`. Ich skróty (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+D, Delete, Shift+1/2/3, Spacja, M) obsługuje strona, nie powłoka okna – dzięki temu działają prawidłowo także w polach tekstowych; menu je tylko pokazuje. Na macOS strona przyjmuje też ⌘ zamiast Ctrl. Cofnij / Ponów w menu synchronizują się ze stanem aktywności zgłaszanym przez stronę (`sync_menu`).

## 5. Pliki

- **Zapisz jako:** pobrania strony (eksport sceny, paczka) otwierają systemowe okno zapisu (wtyczka `tauri-plugin-dialog`).
- **Import:** Importuj…, przeciągnięcie na okno, `PLIK` w wierszu poleceń albo otwarcie skojarzonego pliku.
  Plik (do 512 MB) trafia do strony porcjami po 3 MB (`window.__vizrsFile.begin/chunk/end`); o imporcie decyduje strona.
  Rozszerzenia: `cgpack`, `json`, `png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`, `mp4`, `webm`, `ttf`, `otf`, `woff`, `woff2`.

## 6. Zamykanie i kopia robocza

- Zamknięcie okna ze zmianami pyta stronę (ona zna stan i umie zapisać); strona pokazuje **systemowe okno dialogowe**
  „Zapisać zmiany przed zamknięciem?” (Zapisz · Nie zapisuj · Anuluj) i odpowiada `close` albo `stay`.
  Gdy strona nie odpowie w 5 s, kolejne zamknięcie nie pyta.
- Zakończ (Ctrl+Q): okna bez zmian zamykają się od razu, ze zmianami – po kolei.
- **Kopia robocza:** strona zapisuje niezapisaną scenę komunikatem `draft`; okno trzyma ją w `drafts/<skrót>.json` w katalogu stanu
  (skrót z adresu serwera – w pracy lokalnej z katalogu danych – i identyfikatora sceny, do 16 MB). Po otwarciu tej sceny okno oddaje kopię stronie (`__vizrsCmd('draft', …)`).

## 7. Jedna instancja

Wtyczka `tauri-plugin-single-instance` pilnuje pojedynczej instancji programu na wszystkich platformach (Linux, Windows, macOS). Kolejne uruchomienie programu (np. po otwarciu pliku lub z opcją `connect`) przekazuje argumenty wiersza poleceń do działającego procesu, który wysuwa odpowiednie okno na wierzch i importuje przekazany plik.

## 8. Połączenie z serwerem

Okno „Połącz z serwerem” (Plik → Połącz z serwerem…, CmdOrCtrl+Shift+K, `connect`) jest wbudowaną stroną aplikacji `ui/connect.html` (frontendDist Tauri) z uprawnieniem `capabilities/connect.json` pozwalającym na komunikację przez komendę `ipc`. Lista do 20 serwerów w `connections.json` (prawa tylko dla właściciela); token zapisywany tylko na życzenie; opcja „łącz przy uruchomieniu”. Przed przełączeniem okno sprawdza `GET /api/state` z tokenem – `http://` i `https://` przez klienta `ureq` (TLS rustls; zły certyfikat = błąd) – i zgłasza brak serwera, zły token albo token wyjścia (403).

Po przełączeniu na serwer zdalny (lub dołączeniu do serwera `vizrs` na katalogu danych) wbudowany serwer strony w procesie okna działa jako **pośrednik** (`src/local.rs`: `start_remote`, `proxy`). Zapytania `/api`, `/assets`, `/events` są przekazywane do serwera zdalnego z tokenem trzymanym w procesie okna. **Token nie trafia do strony w WebView**, a adres strony w oknie pozostaje niezmienny (`http://127.0.0.1:<port>`).

Uruchomione jako `connect` (bez `--connect` i bez zapisanego łączenia przy uruchomieniu) okno nie ma jeszcze serwera:
nagłówek pokazuje „Teraz: nie połączono”, a prośba kolejnego uruchomienia tylko wysuwa okno połączenia. Zamknięcie okna bez wyboru kończy program.

Przycisk **Praca lokalna (bez serwera)** wraca do magazynu lokalnego (albo do `vizrs` pracującego na katalogu danych).

## 9. Most strona → okno

Strona wysyła komunikaty przez `window.__vizrsPost(tekst)`. W Tauri obiekt `window.ipc` należy do wry/Tauri i jest niezapisywalny, więc okno wstrzykuje `IPC_SHIM`:
```javascript
(() => {
  window.__vizrsPost = (m) => { window.__TAURI_INTERNALS__.invoke('ipc', { body: String(m) }).catch((e) => console.error('ipc', e)); };
  window.__vizrsShell = { version: '__VERSION__', app: 'cg-artist' };
})();
```

Uprawnienia dostępu do komendy Tauri `ipc` definiują pliki w `capabilities/`:
- `capabilities/connect.json`: uprawnienie dla okna `connect` (`ui/connect.html`),
- `capabilities/artist.json`: uprawnienie dla okien `artist-*` ograniczone do `http://127.0.0.1:*/*`.

Komenda `ipc` przekazuje komunikat do białej listy w `src/bridge.rs`:

| Prefiks | Od kogo | Komunikaty |
|---|---|---|
| `app:` | tylko strona z serwera w oknie (magazyn lokalny albo pośrednik serwera – `http://127.0.0.1:*`) | `state` (tytuł ≤ 200 znaków, `dirty`, `undo`, `redo`, `scene` ≤ 128), `close`, `stay`, `draft` (`id` ≤ 128, `data` ≤ 16 MB albo `null` = usuń), `dialog` (`id` u32, `kind` info/warning/error, `title` ≤ 200, `text` ≤ 4000 znaków, `buttons` 1–3 różne etykiety ≤ 40 znaków) |
| `connect:` | tylko okno połączenia (`ui/connect.html`) | wybór, zapis i usunięcie serwera |
| `probe:` | skrypt `--probe` | wynik testu |

Wszystko inne jest ignorowane. Okno → strona: `window.__vizrsCmd(akcja[, dane])`, `window.__vizrsFile`, `window.__vizrsDialog(id, n)` –
numer wybranego przycisku okna dialogowego (pierwszy = 0; zamknięcie okna dialogowego = ostatni, „anuluj”).
Okno dialogowe (`tauri-plugin-dialog`: GTK, TaskDialog, NSAlert) jest modalne dla okna strony; pierwszy przycisk jest domyślny.

## 10. Pliki użytkownika

| Plik | Linux | Windows | macOS |
|---|---|---|---|
| dane Artist | `--data`, domyślnie `~/.local/share/vizrs-cg-artist/`: `show.json`, `assets/`, `animpresets.json`, `kopie/` (§12) | `%LOCALAPPDATA%\VizRS CG Artist` | `~/Library/Application Support/VizRS CG Artist` |
| zapisane serwery | `~/.config/vizrs/connections.json` (`VIZRS_CONFIG` – inny katalog) | `%APPDATA%\VizRS\connections.json` | `~/Library/Application Support/VizRS/connections.json` |
| wygląd okna | `~/.config/vizrs/window.json` | `%APPDATA%\VizRS\window.json` | `~/Library/Application Support/VizRS/window.json` |
| kopie robocze | `~/.local/state/vizrs/drafts/` | `%LOCALAPPDATA%\VizRS\drafts\` | `~/Library/Logs/VizRS/drafts/` |
| skojarzenia plików | `packaging/pl.vizrs.CgArtist.xml`, `linux/desktop.hbs` (.deb, .rpm, AppImage) | rejestr (.msi, instalator NSIS) | `Info.plist` (.dmg) |

Klucz w `window.json`: `cg-artist` (rozmiar, położenie, maksymalizacja, powiększenie, ostatnia scena). Bez zapisanego wyglądu okno Artist otwiera się zmaksymalizowane. Zapisy są atomowe; uszkodzony plik = wartości domyślne.

## 11. Budowa i testy

Kompilacja programu na Linuksie:

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libxdo-dev libssl-dev
cargo build --release
```

Budowa paczek instalacyjnych (bundler Tauri):

```bash
npx --yes @tauri-apps/cli@2 build
```

Paczki instalacyjne generowane przez bundler:
- **Linux:** `.deb`, `.rpm`, `AppImage` (wymaga Ubuntu 22.04+ / WebKitGTK 4.1). W paczkach zawarty jest wpis menu z szablonu `linux/desktop.hbs`, skojarzenia `.cgpack` i plik typów MIME `packaging/pl.vizrs.CgArtist.xml`.
- **Windows:** instalator NSIS (`.exe`) oraz pakiet `.msi` (WebView2).
- **macOS:** obraz dysku `.dmg` (wymaga macOS 11.0+, WKWebView).

Strona Artist leży w `web/`. `artist.html`, `native.js` i `native.css` rozwija to repo; reszta (moduły rysowania, `ui.css`, fonty i `fonts.css`)
to kopie z VizRS CG System – `tools/sync-cg.sh [katalog-CG]` kopiuje, `tools/sync-cg.sh --check` sprawdza identyczność
(CI pobiera CG System w wersji z `web/CG_SYSTEM`). Zmiana rysowania zawsze najpierw w CG System.

Bramka przed commitem: `tools/sync-cg.sh --check`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test`, `cargo build --release`.
Testy jednostkowe: `cargo test` (34/34).

CI (`.github/workflows/ci.yml`):
- `gate`: Ubuntu 22.04 – sprawdzenie modułów CG System, fmt, clippy, `cargo test`,
- `build`: macierz trzech systemów (Linux `ubuntu-22.04`, Windows `windows-latest`, macOS `macos-latest`) – kompilacja release, paczki bundlera Tauri oraz test dymny `tests/e2e/smoke.js` na wszystkich trzech platformach,
- `e2e`: test w działaniu pod Xvfb na Linuksie z serwerem `vizrs` zbudowanym z CG System w wersji z `web/CG_SYSTEM`.

**Wydanie** (`.github/workflows/release.yml`): podnieś `version` w `Cargo.toml` i `tauri.conf.json` oraz sekcję w `CHANGELOG.md`, potem
`git tag v<wersja> && git push origin v<wersja>` – albo Actions → Release → Run workflow (bez `publish` = szkic; szkice usuwa
Actions → Usuń szkic wydania). Workflow buduje paczki instalacyjne na trzech systemach i dołącza je do jednego wydania GitHub Release
wraz z `SHA256SUMS.txt`. Wersja ze znacznika musi się zgadzać z `Cargo.toml`, łącznik (`-rc1`) = wydanie wstępne.

Test dymny (bez serwera, na dowolnym z 3 systemów):
```bash
node tests/e2e/smoke.js ŚCIEŻKA-DO-PROGRAMU
```
Sprawdza uruchomienie, magazyn lokalny, zapis sceny, przekazanie pliku od okna i zwolnienie blokady.

Test w działaniu (22/22, widoczne okna na kilka sekund; bez ekranu: `xvfb-run`):

```bash
node tests/e2e/okno.js [ścieżka-do-vizrs] [ścieżka-do-vizrs-cg-artist]
```

Domyślnie `../VizRS CG System/source/target/release/vizrs` (albo `VIZRS_BIN`) i `target/release/vizrs-cg-artist`.
Sprawdza pracę lokalną bez serwera (strona z binarki, zapis do `show.json`, zasoby, brak stron Trio), most okna (pytanie
przy zamykaniu, plik od okna), jedną instancję, wzajemną blokadę katalogu z `vizrs`, dołączanie do `vizrs` na katalogu danych
przez pośrednika, okno połączenia (token, zapis, prawa pliku, „Praca lokalna”) i to, że strona serwera nie przełącza okna na inny adres.
Bez programu `vizrs` kroki z serwerem są pomijane. Katalogi konfiguracji i stanu są tymczasowe (`KEEP_TMP=1` – zostaw je do wglądu).

## 12. Magazyn lokalny

Praca bez serwera: okno uruchamia w swoim procesie serwer HTTP na `127.0.0.1:<losowy port>` (`src/http.rs`, `src/local.rs`),
który podaje stronę z binarki (`web/`) i API na katalogu danych (`src/store.rs`). W trybie pracy na serwerze ten sam serwer działa jako pośrednik (`src/local.rs`: `proxy`), przekazując `/api`, `/assets` i strumień `/events` do serwera zdalnego.

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

- **Dostęp tylko z okna:** jednorazowy sekret (24 bajty generowane przez `getrandom`) w adresie strony (`?token=`) zamienia się
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
- Klient: HTTP/1.1 przez `ureq` z TLS rustls (`src/client.rs`), `http://` i `https://`, token w `Authorization: Bearer`, odpowiedź do 64 MB, 20 s na żądanie, bez przekierowań (czysty Rust, jednakowy na Linux, Windows i macOS).

## 14. Wygląd natywny

Okno ma wyglądać i zachowywać się jak program systemu, nie jak strona w przeglądarce. Co robi okno (`src/main.rs`: `native_look`,
`build_menu`, `ask`) i strona (`web/native.js`, `web/native.css` – pliki tego repo):

| Obszar | Linux (WebKitGTK) | Windows (WebView2) | macOS (WKWebView) |
|---|---|---|---|
| Motyw okna | ciemny wariant motywu GTK (pasek menu, okna dialogowe, „Zapisz jako”) | ciemny pasek tytułu i menu | ciemny wygląd programu (także NSAlert, NSSavePanel) |
| Start okna | okno niewidoczne do wczytania strony (najwyżej 3 s) – bez pustej białej strony | to samo + tło okna jak strony | to samo + tło okna jak strony |
| Pytania strony | `confirm`/`alert` → systemowe okno dialogowe z własnymi przyciskami (Zapisz / Nie zapisuj / Anuluj, Usuń…) zamiast okna silnika z adresem `127.0.0.1` w tytule; na macOS WKWebView w wry w ogóle nie pokazuje `confirm` (zwracał „Anuluj”) | | |
| Pole tekstowe | `prompt` → okno strony w układzie przycisków systemu: Linux, macOS – Anuluj, OK; Windows – OK, Anuluj; na macOS wysuwa się spod paska tytułu jak arkusz | | |
| Czcionka interfejsu | czcionka systemu (`system-ui`) | Segoe UI Variable / Segoe UI 12 px | San Francisco (`-apple-system`) |
| Kontrolki | `color-scheme: dark` – pokrętła liczb, pola wyboru, listy i paski przewijania w ciemnym wariancie | | |
| Paski przewijania | wąskie, ciemne | systemowe nakładane Fluent (Windows 11, WebView2 ≥ 125) | widoczne dopiero nad przewijanym obszarem |
| Funkcje przeglądarki | wyłączone: menu kontekstowe silnika (poza polami tekstowymi), skróty przeglądarki (F3, F5, F7, F12, Ctrl+F/G/H/J/P/R, Ctrl+±/0, Alt+←/→), boczne przyciski myszy (Wstecz/Dalej), przeciąganie obrazów i odnośników z okna, gesty powiększania, „opuścić stronę?” przy wczytaniu ponownie; narzędzia deweloperskie tylko z `VIZRS_DEVTOOLS=1` | + autouzupełnianie formularzy WebView2 | + podgląd odnośników (Force Touch) |
| Okno „Połącz z serwerem” | okno dialogowe: stały rozmiar, wyśrodkowane, nad oknem Artist (okno podrzędne), bez paska menu programu (Windows, Linux), kolejność przycisków systemu | | |

Kanwa (`#stage`) zachowuje czcionkę i wygląd z `ui.css` – rysuje dokładnie jak antena.


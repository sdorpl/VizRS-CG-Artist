# VizRS CG Artist – historia zmian

## Niewydane

## 0.3.0 – 2026-11-07

- **Przejście na Tauri 2 (wersja 0.3.0, Linux, Windows, macOS):**
  - Zastąpienie okna GTK 4 + WebKitGTK 6.0 programem Tauri 2 w korzeniu repozytorium (prototyp `proto/tauri` usunięty). Silniki WebView: Linux – WebKitGTK 4.1 (przez wry), Windows – WebView2, macOS – WKWebView.
  - Usunięto kod okna GTK, `src/desktop.rs`, `src/instance.rs`, `tools/webkit6-shim.sh`, `packaging/deb/build.sh` oraz `.github/workflows/proto-tauri.yml`.
  - Zależności: `tauri`, `tauri-plugin-dialog`, `tauri-plugin-single-instance`, `serde_json`, `ureq` (TLS rustls, klient HTTP/HTTPS – zastąpił klienta przez gio), `getrandom` (sekret magazynu), na Linuksie `webkit2gtk` (pisownia polska). Crate'y `gtk4` i `webkit6` usunięte.
  - Strona Artist jest zawsze serwowana z binarki przez wbudowany serwer strony w procesie okna (`127.0.0.1`, losowy port, sekret → ciasteczko). Podczas pracy na serwerze (`--connect`, okno połączenia, dołączenie do działającego `vizrs` na katalogu danych) serwer strony działa jako **pośrednik** (`/api`, `/assets`, `/events` przekazywane do serwera z tokenem okna; token nie trafia do strony w WebView, adres strony w oknie nie ulega zmianie; `src/local.rs`: `start_remote`, `proxy`).
  - Okno „Połącz z serwerem” jako strona aplikacji `ui/connect.html` (frontendDist Tauri) z uprawnieniem `capabilities/connect.json`; okna Artist mają `capabilities/artist.json` (komenda `ipc` ograniczona do `http://127.0.0.1:*/*`). Most: `window.__vizrsPost` → komenda Tauri `ipc` → biała lista `src/bridge.rs`.
  - Jedna instancja: wtyczka `tauri-plugin-single-instance` na Linux, Windows i macOS zamiast gniazda Unix (zamyka brak jednej instancji na Windows).
  - Pamięć wyglądu i rozmiaru okna (`window.json`) w `src/main.rs`.
  - Paczki generowane przez bundler Tauri (`npx @tauri-apps/cli@2 build`): Linux (.deb, .rpm, AppImage – Ubuntu 22.04+ / WebKitGTK 4.1), Windows (.msi, instalator NSIS .exe), macOS (.dmg – 11.0+). Skojarzenia `.cgpack` i plik typów MIME `packaging/pl.vizrs.CgArtist.xml`, wpis menu z szablonu `linux/desktop.hbs`.
  - Most strony `window.__vizrsPost` (z rezerwą `window.ipc.postMessage`), sekret magazynu z `getrandom`. Test dymny `tests/e2e/smoke.js`.
  - CI/CD (`ci.yml`, `release.yml`): bramka na Linuksie, budowa paczek i test dymny (`tests/e2e/smoke.js`) na trzech systemach (Linux, Windows, macOS); na Linuksie test w działaniu (`tests/e2e/okno.js` pod Xvfb). Wspólne wydania ze wszystkimi paczkami. Pliki bez zamiany końców wierszy (`.gitattributes`, `core.autocrlf false` w CI), więc strona w binarce Windows jest bajt w bajt ta sama co na Linuksie.

- **GitHub:** repozytorium `sdorpl/VizRS-CG-Artist`, wydania z `release.yml` (znacznik `v*` albo ręcznie; sumy SHA256), `drafts.yml` usuwa szkice wydań.

- **Wyślij na serwer** (pasek ⇧ Wyślij, Plik → Wyślij na serwer…): sceny z pracy lokalnej trafiają na zapisany serwer `vizrs` razem z brakującymi grafikami i czcionkami. Przed wysyłką stan każdej sceny na serwerze i ostrzeżenie „na antenie”; zmiana sceny na serwerze od ostatniej wysyłki = konflikt, który rozwiązuje świadome „nadpisz”. Token zostaje w oknie.
- **`https://` w oknie połączenia:** serwer jest sprawdzany przed przełączeniem także przez HTTPS (wcześniej tylko `http://`).

- **Praca bez serwera (magazyn lokalny):** Artist nie potrzebuje już programu `vizrs`. Strona jest wkompilowana, a sceny, zasoby i presety animacji zapisuje w katalogu danych (`show.json`, `assets/`, `animpresets.json` – format serwera) przez wbudowany serwer na `127.0.0.1` dostępny tylko dla okna. Kopie zapasowe w `kopie/`. Strony Trio nie są tworzone (przycisk „Utwórz stronę w Trio” i import stron z paczek tylko na serwerze). Gdy na katalogu danych pracuje `vizrs`, okno dołącza do niego; `vizrs` nie wystartuje na katalogu otwartym w Artist.
- **Zmiany opcji:** domyślny katalog danych to `~/.local/share/vizrs-cg-artist` (zmienna `VIZRS_ARTIST_DATA` zamiast `VIZRS_DATA`); usunięte `--port`, `--vizrs`, `VIZRS_PORT`, `VIZRS_BIN` (Artist nie uruchamia serwera). W oknie połączenia „Serwer lokalny” → „Praca lokalna (bez serwera)”, przycisk zawsze dostępny (wcześniej po `connect` był ukryty). Paczka `.deb`: `vizrs` tylko sugerowany.

- **Strona Artist w repo** (`web/`): `artist.html` i `native.js` rozwijane tutaj; moduły rysowania i fonty to kopie z VizRS CG System v2.0.19 pilnowane przez `tools/sync-cg.sh --check` (też w CI).

- **Artist bez Trio:** Artist staje się samodzielnym edytorem grafik i animacji. Z menu znikają Plik → Trio w przeglądarce, Wyjście (podgląd) w przeglądarce i Pomoc → Strona startowa i API; Trio i wyjście należą do VizRS CG System.

- **`connect` bez serwera lokalnego:** okno wyboru otwiera się bez uruchamiania `vizrs serve`; serwer lokalny powstaje dopiero po „Serwer lokalny”. Wcześniej `connect` bez programu `vizrs` kończył się błędem, zanim pokazał okno wyboru.
- **Test w działaniu** `tests/e2e/okno.js`: most okna, jedna instancja, serwer (dołączanie, blokada), okno połączenia (22/22 zaliczone).

## 0.1.0 – pierwsza wersja

- **Okno Artist na GTK 4 + WebKitGTK 6.0** (Linux): strona Artist z serwera `vizrs`, menu Plik / Edycja / Widok / Pomoc, powiększenie, pełny ekran, narzędzia deweloperskie, pisownia polska.
- **Serwer:** dołączanie do działającego `vizrs` na tym katalogu danych albo uruchamianie `vizrs serve --idle-exit` jako osobnego procesu; wolny port od 8088; serwer zdalny (`--connect`, okno „Połącz z serwerem”, zapisane połączenia, łączenie przy uruchomieniu).
- **Praca z plikami:** systemowe „Zapisz jako” dla eksportu sceny i paczki, Importuj…, przeciąganie i otwieranie `.cgpack` / `.vizrs.json` / obrazów / czcionek.
- **Bezpieczeństwo pracy:** pytanie o zapis przy zamykaniu, kopia robocza sceny po awarii, jedna instancja na katalog danych, pamięć rozmiaru okna, powiększenia i ostatniej sceny.
- **Integracja z pulpitem:** ikona i ukryty wpis `pl.vizrs.CgArtist.desktop` (Wayland).
- Narzędzie testowe `--probe` / `--probe-out`.

# VizRS CG Artist – historia zmian

## Niewydane

- **Wyślij na serwer** (pasek ⇧ Wyślij, Plik → Wyślij na serwer…): sceny z pracy lokalnej trafiają na zapisany serwer `vizrs` razem z brakującymi grafikami i czcionkami. Przed wysyłką stan każdej sceny na serwerze i ostrzeżenie „na antenie”; zmiana sceny na serwerze od ostatniej wysyłki = konflikt, który rozwiązuje świadome „nadpisz”. Token zostaje w oknie.
- **`https://` w oknie połączenia:** serwer jest sprawdzany przed przełączeniem także przez HTTPS (wcześniej tylko `http://`).

- **Praca bez serwera (magazyn lokalny):** Artist nie potrzebuje już programu `vizrs`. Strona jest wkompilowana, a sceny, zasoby i presety animacji zapisuje w katalogu danych (`show.json`, `assets/`, `animpresets.json` – format serwera) przez wbudowany serwer na `127.0.0.1` dostępny tylko dla okna. Kopie zapasowe w `kopie/`. Strony Trio nie są tworzone (przycisk „Utwórz stronę w Trio” i import stron z paczek tylko na serwerze). Gdy na katalogu danych pracuje `vizrs`, okno dołącza do niego; `vizrs` nie wystartuje na katalogu otwartym w Artist.
- **Zmiany opcji:** domyślny katalog danych to `~/.local/share/vizrs-cg-artist` (zmienna `VIZRS_ARTIST_DATA` zamiast `VIZRS_DATA`); usunięte `--port`, `--vizrs`, `VIZRS_PORT`, `VIZRS_BIN` (Artist nie uruchamia serwera). W oknie połączenia „Serwer lokalny” → „Praca lokalna (bez serwera)”, przycisk zawsze dostępny (wcześniej po `connect` był ukryty). Paczka `.deb`: `vizrs` tylko sugerowany.

- **Strona Artist w repo** (`web/`): `artist.html` i `native.js` rozwijane tutaj; moduły rysowania i fonty to kopie z VizRS CG System v2.0.19 pilnowane przez `tools/sync-cg.sh --check` (też w CI).

- **Artist bez Trio:** Artist staje się samodzielnym edytorem grafik i animacji. Z menu znikają Plik → Trio w przeglądarce, Wyjście (podgląd) w przeglądarce i Pomoc → Strona startowa i API; Trio i wyjście należą do VizRS CG System.

- **Paczka `.deb`** (`packaging/deb/build.sh`, też w CI): program, skróty „VizRS CG Artist” i „VizRS CG Artist – serwer zdalny”, ikona, skojarzenia `.cgpack` / `.vizrs.json`; instaluje się obok pakietu `vizrs`.

- **`connect` bez serwera lokalnego:** okno wyboru otwiera się bez uruchamiania `vizrs serve`; serwer lokalny powstaje dopiero po „Serwer lokalny”. Wcześniej `connect` bez programu `vizrs` kończył się błędem, zanim pokazał okno wyboru.
- **Test w działaniu** `tests/e2e/okno.js`: most okna, jedna instancja, serwer (`--idle-exit`, dołączanie, blokada), okno połączenia.

- **CI:** `.github/workflows/ci.yml` – fmt, clippy, testy i budowa wydania na Ubuntu 24.04 z `libwebkitgtk-6.0-dev`.

## 0.1.0 – pierwsza wersja

- **Okno Artist na GTK 4 + WebKitGTK 6.0** (Linux): strona Artist z serwera `vizrs`, menu Plik / Edycja / Widok / Pomoc, powiększenie, pełny ekran, narzędzia deweloperskie, pisownia polska.
- **Serwer:** dołączanie do działającego `vizrs` na tym katalogu danych albo uruchamianie `vizrs serve --idle-exit` jako osobnego procesu; wolny port od 8088; serwer zdalny (`--connect`, okno „Połącz z serwerem”, zapisane połączenia, łączenie przy uruchomieniu).
- **Praca z plikami:** systemowe „Zapisz jako” dla eksportu sceny i paczki, Importuj…, przeciąganie i otwieranie `.cgpack` / `.vizrs.json` / obrazów / czcionek.
- **Bezpieczeństwo pracy:** pytanie o zapis przy zamykaniu, kopia robocza sceny po awarii, jedna instancja na katalog danych, pamięć rozmiaru okna, powiększenia i ostatniej sceny.
- **Integracja z pulpitem:** ikona i ukryty wpis `pl.vizrs.CgArtist.desktop` (Wayland).
- Narzędzie testowe `--probe` / `--probe-out`.

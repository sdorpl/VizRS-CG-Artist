# RAPORT: prototyp VizRS CG Artist na Tauri 2

> 2026-11-07. Prośba użytkownika: prototyp na Tauri; jeśli wypadnie dobrze – rezygnacja z GTK.
> Stan: Linux sprawdzony, Windows i macOS czekają na pierwszy przebieg CI.

## Wniosek

Na Linuksie Tauri wypada wyraźnie lepiej niż GTK 4 zarówno pod względem ostrości obrazu, jak i czasu startu oraz zużycia pamięci. Obawa z raportu Qt o gorsze skalowanie WebKitGTK 4.1 nie potwierdziła się – w rzeczywistości to GTK 4 rozmywa tekst przy skalowaniu ułamkowym. Rekomendacja: przejść na Tauri 2 jako docelowe rozwiązanie po potwierdzeniu działania na Windows i macOS w CI.

## 1. Co zbudowano

Prototyp w katalogu `proto/tauri` (Tauri 2.12.5, wry 0.57.1, tauri-plugin-dialog 2.8.4, tauri-plugin-single-instance 2.5.5):
- Rdzeń wspólny z oknem GTK dołączony z `src/` przez `#[path]` (`store`, `http`, `local`, `web`, `bridge`, `deploy`, `connect`, `paths`, `server`).
- Klient HTTPS z `gio` (`src/client.rs`) działający na Linuksie także z GTK 3 w Tauri; na Windows/macOS przygotowana zaślepka (`proto/tauri/src/client_stub.rs`).
- Strona z magazynu lokalnego (`127.0.0.1`, losowy port, sekret).
- Most strony: komenda IPC z uprawnieniem `capabilities/artist.json` dla `http://127.0.0.1:*/*`.
- Menu systemowe: Plik, Edycja, Widok, Pomoc.
- Pytanie przy próbie zamknięcia okna.
- „Zapisz jako” dla pobrań (najpierw plik tymczasowy, potem okno zapisu) oraz import.
- Przekazanie pliku z wiersza poleceń.
- Jedna instancja programu (wtyczka `tauri-plugin-single-instance` – na całą aplikację, nie na katalog danych jak w oknie GTK).
- Pisownia polska (WebKitGTK).
- Dołączanie do serwera `vizrs` pracującego na katalogu danych.
- Obsługa przełącznika `--probe`.

## 2. Wyniki na Linuksie

### Ostrość przy skalowaniu ułamkowym 125% (KDE, Wayland)

Pomiary wariancji laplasjanu (większa wartość = ostrzejszy obraz) wykonane na tych samych danych i w tych samych miejscach zrzutu:

| Obszar | GTK 4 | Tauri 2 | Stosunek |
|---|---|---|---|
| Kanwa – duży tekst | 1090 | 1855 | ×1,70 |
| Kanwa – mały tekst 18 px | 1641 | 2917 | ×1,78 |
| Panel właściwości | 695 | 1178 | ×1,69 |
| Drzewo sceny | 689 | 974 | ×1,41 |

Na powiększonych zrzutach tekst w GTK 4 jest wyraźnie rozmyty, natomiast w Tauri pozostaje ostry. Obawa z raportu Qt (Tauri = WebKitGTK 4.1, gorsze skalowanie) nie potwierdziła się – w praktyce było odwrotnie.

### Wydajność i zasoby

| Parametr | GTK 4 | Tauri 2 |
|---|---|---|
| Czas startu (3 próby, do wczytanej strony z połączeniem) | 1,41–2,17 s | 1,00–1,26 s |
| Pamięć głównego procesu (bez procesów WebKit) | ok. 365 MB | ok. 286 MB |
| Test dymny (`tests/e2e/smoke.js`) | 4,1 s | 3,1 s |
| Rozmiar binarki | 3,9 MB | 13,5 MB |
| Paczka `.deb` | – | 5,7 MB (`libwebkit2gtk-4.1-0`, `libgtk-3-0`; działa od Ubuntu 22.04, GTK 4 wymaga 24.04+) |
| Paczka AppImage | brak | 112 MB (zawiera WebKitGTK, działa bez instalowania bibliotek) |

### Testy automatyczne

| Zestaw testów | GTK 4 | Tauri 2 | Uwagi |
|---|---|---|---|
| Test dymny (`smoke.js`, bez serwera) | zaliczony | zaliczony | Działa na Linuksie w obu wersjach |
| Test w działaniu (`tests/e2e/okno.js`) | 22/22 | 14/14 obsługiwanych | 8 kroków nie przechodzi z powodu braku okna „Połącz z serwerem” |
| Bramka testów jednostkowych | 30/30 | – | Okno GTK po zmianach: pełna zgodność |

Obsługiwane i zaliczone kroki testu `okno.js` w Tauri (14/14): praca lokalna, zapis `show.json`, zasoby, pytanie przy zamknięciu, zwolnienie blokady, jedna instancja, blokada w formacie serwera, `vizrs` nie startuje na katalogu Artist, dołączanie do `vizrs`, połączenie zdalne nie zakłada magazynu.
Kroki nieobsługiwane (8): połączenie z serwerem, zapis tokenu, wysyłka zależna od zapisanego serwera, przycisk Praca lokalna.
Wysyłka na prawdziwy serwer `vizrs` z tokenem została sprawdzona osobno w Tauri: nowa → wysłana z zasobem → bez zmian.

## 3. Co wymagało obejścia

1. **Niezapisywalny `window.ipc`:** w Tauri obiekt ten należy do wry/Tauri. Strona wysyła komunikaty przez `window.__vizrsPost` (z rezerwą `window.ipc.postMessage` dla okna GTK i stron serwera). Strona serwera `vizrs` w trybie zdalnym ma własny `native.js` – w Tauri potrzebna będzie ta sama jednolinijkowa zmiana w CG System (`source/web/native.js`).
2. **Pobrania plików:** ścieżkę zapisu trzeba wskazać od razu, więc plik jest kierowany do katalogu tymczasowego, a okno zapisu pojawia się po zakończeniu transferu. Na macOS zdarzenie końca nie podaje ścieżki – jest zapamiętywana z momentu rozpoczęcia pobierania.
3. **Zwalnianie blokady:** `app.exit()` w Tauri nie zwalnia stanu – blokadę katalogu zwalniamy w zdarzeniu `Exit`.
4. **Kolejność startu magazynu:** magazyn lokalny startuje w `setup` po wtyczce jednej instancji (inaczej druga instancja trafiała na blokadę).
5. **Fokus okna:** jawne nadanie fokusu przy otwarciu (KDE nie przydzielało go samoczynnie).
6. **Wpis `.desktop` w `.deb`:** przygotowano własny szablon z `%f` i plik typów MIME (`.cgpack`, `.vizrs.json`) – domyślny wpis Tauri nie przekazywał pliku.
7. **Sekret magazynu na Windows:** brak `/dev/urandom` obsłużony rezerwą z `RandomState` biblioteki standardowej (docelowo: crate `getrandom`).

## 4. Czego prototyp jeszcze nie ma

- Okna „Połącz z serwerem” (i obsługi pozostałych 8 kroków testu E2E).
- Pamięci rozmiaru i położenia okna (`window.json`).
- Klienta HTTPS na Windows/macOS (decyzja: `ureq` + `rustls` albo `reqwest`).
- Weryfikacji pytań zapory sieciowej, ostrzeżeń SmartScreen oraz Gatekeepera (nieznane do czasu uruchomienia CI i testów na czystych systemach).
- Podpisów cyfrowych programów i instalatorów.
- Poprawnej nazwy pakietu `.deb` – bundler robi z `productName` nazwę `viz-rs-cg-artist`.
- Jednej instancji na katalog danych (wtyczka pilnuje jednej na cały program).

## 5. Windows i macOS

Stan: **CI gotowe, nieuruchomione.**
Przygotowano workflow `.github/workflows/proto-tauri.yml` z macierzą trzech systemów: `ubuntu-22.04`, `windows-latest`, `macos-latest`.
Zakres workflow:
- kompilacja i budowa pakietów (`.deb`, `.rpm`, AppImage, `.msi`, instalator NSIS `.exe`, `.app`, `.dmg`),
- uruchomienie testu dymnego,
- publikacja artefaktów.

Workflow nie został jeszcze uruchomiony, ponieważ repozytorium nie zostało wypchnięte na GitHub (wymaga zgody użytkownika: `git push origin main`).

## 6. Plan przejścia, jeśli CI potwierdzi

1. Wykonanie `git push origin main` i weryfikacja pierwszego przebiegu `proto-tauri.yml` w GitHub Actions.
2. Po uzyskaniu zielonego wyniku: wydzielenie wspólnego rdzenia do crate `artist-core` w workspace, ustawienie okna Tauri jako głównego programu.
3. Dobicie brakujących funkcji: okno „Połącz z serwerem” oraz pamięć okna (`window.json`).
4. Wdrożenie przenośnego klienta HTTPS (`ureq` + `rustls` albo `reqwest`) i crate `getrandom`.
5. Usunięcie starego okna GTK (`src/main.rs`, `desktop.rs`, `instance.rs`, zależności `gtk4` i `webkit6`), generowanie wydań przez bundler Tauri (`release.yml` w macierzy 3 systemów).
6. Jednolinijkowa zmiana w `source/web/native.js` w repozytorium `VizRS CG System`.
7. Aktualizacja dokumentacji: `CLAUDE.md` (zależności `tauri`, wtyczki), `docs/DOKUMENTACJA.md`, `docs/LUKI.md`.

## 7. Decyzje dla użytkownika

1. **Zgoda na `git push`:** wypchnięcie gałęzi na GitHub w celu uruchomienia workflow CI na Windows i macOS.
2. **Nowe zależności:** zatwierdzenie `tauri`, `tauri-plugin-dialog`, `tauri-plugin-single-instance` oraz wybór przenośnego klienta HTTPS (`ureq` + `rustls` czy `reqwest`).
3. **Wycofanie GTK:** decyzja, czy usunąć okno GTK 4 od razu po potwierdzeniu zielonego CI dla Tauri.

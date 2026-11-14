# VizRS CG Artist – historia zmian

## Niewydane

- **Poprawka: okno szersze niż ekran przy skalowaniu ułamkowym** (zgłoszenie: 1920×1080, KDE Plasma Wayland 125 %): okno bez maksymalizacji otwierało się w rozmiarze 1600×900 px logicznych, a ekran ma 1536×864 – interfejs wychodził poza krawędź. Rozmiar jest teraz przycinany do obszaru roboczego monitora (`src/screen.rs`, ten sam moduł w oknie Trio i aplikacji VizRS Live). DOKUMENTACJA §3.
- **Maska warstwy** – strona z CG System `b5243dc` (`web/CG_SYSTEM`; plan jednego ruchu J5): nowa właściwość **maska (węzeł)** w grupie „Maska” panelu Właściwości – nazwa węzła z tej samej grupy, którego prostokąt przycina element (także w ruchu presetów: treść wjeżdża zza krawędzi maski); kanwa rysuje to tak samo jak antena i renderer natywny. Opis: DOKUMENTACJA CG System §4.3.
- **Jedna oś czasu** (plan `../VizRS CG System/docs/plany/PLAN-jeden-ruch.md`, etapy J1–J4): presety ruchu jako klipy w wierszu elementu, a pod nim jego klucze – bez przełącznika „Sekwencja”. Klipy: przeciągnięcie (opóźnienie, czas), w pionie na inny element – „po węźle”, klik – zakładka Ruch na tej fazie, dwuklik w wiersz – dodaj fazę, prawy klik – rozbij na klucze / usuń. Klucze i presety tej samej właściwości razem (znacznik „+ preset”); „Rozbij na klucze” scala z istniejącymi kluczami zamiast odmawiać, „Z kluczy” – dla zaznaczonych kluczy. Zakładka Ruch: lista kluczy elementu ze skokiem do osi i fazy w kolejności czasu. DOKUMENTACJA §4.
## 26.11.5 – 2026-11-14

- **Edycja tekstu na kanwie** (plan `docs/plany/PLAN-edycja-na-kanwie.md`, etap K5): dwuklik w zaznaczony tekst albo Enter – pole w miejscu napisu (czcionka, rozmiar, wyrównanie, kolor, obrót), tekst surowy z `[[wyróżnieniem]]` i wierszami; Ctrl+Enter / klik obok zatwierdza, Esc anuluje, Ctrl+S zatwierdza i zapisuje. DOKUMENTACJA §4.
- **Menu kontekstowe kanwy i schowek elementów** (plan `docs/plany/PLAN-edycja-na-kanwie.md`, etap K4): prawy klik – duplikuj, kopiuj / wytnij / wklej, usuń, grupuj, kolejność (na wierzch … na spód), wyrównaj, zablokuj, ukryj, zaznacz grupę nadrzędną, pokaż w drzewie, **zaznacz pod kursorem** (także zasłonięte); na pustym miejscu – wklej, zaznacz wszystko, prowadnice, odniesienia, widok. Ctrl+C / X / V / A dla elementów (schowek działa między scenami i oknami). DOKUMENTACJA §4.
- **Wyrównaj i rozmieść zaznaczone** (plan `docs/plany/PLAN-edycja-na-kanwie.md`, etap K3): pasek na kanwie – wyrównanie krawędzi i środków do zaznaczenia, elementu kluczowego, kadru albo obszaru grafiki 90%; rozmieszczenie z równymi odstępami, rząd / kolumna z odstępem, szerokość / wysokość jak element kluczowy. DOKUMENTACJA §4.
- **Poprawka:** Ctrl+Z po zapisie przywracał stary znacznik zapisu sceny – kolejny zapis kończył się fałszywym pytaniem o konflikt („zmieniona przez kogoś innego”).
- **Edycja na kanwie – reszta etapu K2:** kilka zaznaczonych ma wspólną ramkę z 8 uchwytami – skalowanie położeń i ramek (Shift – proporcje, Alt – od środka; tekst – ramka, nie czcionka; grupy – tylko położenie); przy zmianie rozmiaru przeciągana krawędź przyciąga się do kadru, prowadnic, innych elementów i scen odniesienia (Ctrl – bez). DOKUMENTACJA §4.
- **Uchwyty na kanwie** (plan `docs/plany/PLAN-edycja-na-kanwie.md`, etap K2): 8 uchwytów rozmiaru (rogi i boki; przeciwległy róg / bok stoi, także w elemencie i grupie obróconej), Shift – proporcje, Alt – od środka, kółko obrotu (Shift – co 15°); etykieta z kątem pod obrysem. DOKUMENTACJA §4.
- **Poprawka:** uchwyt rozmiaru na kanwie nie działał (od 26.11.3) – kliknięcie w niego kończyło się błędem skryptu i nic się nie zmieniało.
- **Zaznaczanie ramką i edycja wielu zaznaczonych** (plan `docs/plany/PLAN-edycja-na-kanwie.md`, etap K1; P8 planu panelu z CG System): przeciągnięcie od pustego miejsca kanwy zaznacza ramką (Shift / Ctrl – dodaj, Ctrl+Shift – odejmij, Alt – tylko całe w ramce); całą scenę przesuwa teraz przytrzymany **S** + przeciągnięcie. Panel Właściwości przy kilku zaznaczonych pokazuje wspólne właściwości, „—” przy różnych wartościach, a zmiana trafia do wszystkich (x / y – przesunięcie o tyle samo) jednym krokiem cofania. DOKUMENTACJA §4.
- **Akceleracja sprzętowa na Linuksie z kartą NVIDIA** (sterownik własnościowy): okno wymusza renderer DMA-BUF WebKitGTK (`WEBKIT_FORCE_DMABUF_RENDERER=1`, `__NV_DISABLE_EXPLICIT_SYNC=1`) – dotąd WebKitGTK sam wyłączał akcelerację i kanwa rysowała się na CPU (animacja 5 → 61 kl./s; także AppImage). Nowa zmienna `VIZRS_GPU` (`auto`, `on`, `off`, `x11`, `system`); zmienne `WEBKIT_*` użytkownika mają pierwszeństwo. Ten sam moduł `gpu.rs` w oknie Trio (VizRS CG System) i w aplikacji VizRS Live. DOKUMENTACJA §3.
- **Strona z CG System v26.11.4** (`web/CG_SYSTEM`: `f88a487`): `renderer.js` – pierwsze ustawienie powiązania (dock) po powstaniu odtwarzacza bez przejścia, więc grafika wchodząca, gdy cel już jest na antenie, stoi od razu na miejscu (PLAN-ruch-belek A0). Pozostałe moduły bez zmian.
- **Powiązania (dock) z podglądu** (plan `docs/plany/PLAN-pozycjonowanie-scen.md`, etap P4): przy regule w ustawieniach sceny **👁 Podgląd** – cele reguły jako sceny odniesienia „na antenie” i scena przesunięta o wynik powiązań z animacją (▶ powtórz), **✋ Ustaw z kanwy** – przeciągnięcie sceny (z przyciąganiem) albo strzałki zmieniają Δx / Δy reguły zamiast położenia sceny, Enter zatwierdza, Esc anuluje; **＋ Z odniesienia** – reguła z celem z wybranych scen odniesienia. Format `dock` bez zmian. DOKUMENTACJA §4.

## 26.11.4 – 2026-11-13

- **Położenie scen względem siebie** (plan `docs/plany/PLAN-pozycjonowanie-scen.md`, etapy P1–P3 i część P4): DOKUMENTACJA §4.
  - **Sceny odniesienia** (⧉ w rogu kanwy, Shift+R): inne sceny show – np. ticker i logo przy belce – półprzezroczyście na kanwie, w kolejności warstw wyjścia i w stanie z pierwszego stop pointu; wybór osobny dla każdej sceny, krycie, kolejność (wg warstw / pod / nad), czas (stop point / głowica). Tylko podgląd, bez zmian w `show.json`.
  - **Przyciąganie do scen odniesienia** – elementów i całej sceny (przeciągnięcie pustego miejsca kanwy dotąd się nie przyciągało); turkusowa linia z nazwą celu.
  - **Położenie względem innej sceny** (ustawienia sceny i grupa „Względem innej sceny” elementu): dosuń nad / pod / z lewej / z prawej celu z odstępem, wyrównaj krawędzie i środki, „szerokość jak cel”; cel – cała scena albo jej element. Wariant **jako powiązanie (dock)** zapisuje regułę `scene:<cel>` z wyliczonym `dx` / `dy` zamiast przesuwać scenę.
  - **Pomiar odległości** (przytrzymaj Alt nad kanwą): odstępy w px od zaznaczenia (albo całej sceny) do najbliższych krawędzi elementów, scen odniesienia i kadru.
  - **Ostrzeżenie o nachodzeniu:** element zasłaniający element sceny odniesienia z innej warstwy – czerwony obszar na kanwie i komunikat z nazwami.
- **Kanwa – chwytanie i położenie:**
  - Elementy łapią kliknięcie tylko tam, gdzie coś rysują: grupa (np. kontener 1920×1080) i prostokąt bez wypełnienia nie chwytają już pustego miejsca swojej ramki, tekst – tylko obszar napisu, niewidoczny element – wcale. Zaznaczoną grupę dalej da się przeciągnąć z jej ramki.
  - Ramka zaznaczenia elementu obróconego obraca się z nim, uchwyt rozmiaru jest w rogu elementu (dawniej w rogu obrysu osiowego).
  - Przyciąganie, dosuwanie względem innej sceny i pomiar liczą obrys tego, co jest rysowane – niewidoczny kontener nie robi z belki pełnego kadru.
- **Czytelniejsze zaokrąglenie rogów:** zamiast dwóch wierszy z ośmioma polami „auto” (↖ ↗ ↘ ↙, L P G D) – pole „wszystkie rogi” i rozwijany schemat prostokąta z polami w narożnikach i na bokach, podglądem kształtu i wartością dziedziczoną w pustych polach; „wyczyść rogi i boki”. DOKUMENTACJA §4.
- **Poprawka:** siatka punktu zaczepienia (Transform → punkt) znów jest siatką 3×3 – po przejściu na wygląd VizRS Live przyciski rozciągały się w jeden pasek.

## 26.11.3 – 2026-11-13

- **Strona z CG System v26.11.3** (`web/CG_SYSTEM`: commit wydania; moduły bez zmian względem poprzedniej synchronizacji).
- **Artist w wyglądzie VizRS Live:** strona ładuje wspólny rdzeń `vizrs-ui.css` (tokeny i kontrolki panelu VizRS Live) przed `ui.css`; pasek górny z logo, pola, przyciski, pigułki stanu, okna pytań (także okno z polem tekstowym z `native.css`) jak w Live. Czcionka interfejsu to Inter na wszystkich systemach (dawniej czcionka systemu). Strona z CG System `4addb2c` (`ui.css` już tylko ze stylami Trio/Artist). DOKUMENTACJA §14.
- **Strona z CG System `1b03bdd`:** wspólny rdzeń wyglądu rodziny VizRS `vizrs-ui.css` (tokeny i kontrolki panelu VizRS Live; Artist przejdzie na niego w etapie W3 planu wyglądu), `ticker-items.js` i `ui.css` z jednej strony Trio (okna pytań na telefonie). `tools/sync-cg.sh` zapisuje w `web/CG_SYSTEM` pełny commit CG System (CI pobiera go do `--check`).

## 26.11.2 – 2026-11-12

- **Zaokrąglenie osobno dla każdego rogu i każdego boku:** w panelu Właściwości (Wygląd) nowe wiersze „zaokr. rogów” (↖ ↗ ↘ ↙) i „zaokr. boków” (L P G D) obok dotychczasowego „zaokr.” dla wszystkich rogów – dla prostokąta, kodu QR i obrazu. Dwa boki przy rogu dają róg eliptyczny; puste pole = jak „zaokr.”, więc dawne sceny bez zmian. `renderer.js` z CG System `5eb8463` (właściwości `radiusTL`…, `radiusT`…). DOKUMENTACJA §4.

## 26.11.1 – 2026-11-12

Pierwsze wydanie w numeracji rok.miesiąc.rewizja (`26.11.1` = listopad 2026, wydanie 1). Gałąź `main` = dawna `main` (0.3.1) scalona z `next-v`; poprzednia `main` zachowana jako `main-oldstable`.

- **Import:** Importuj… przyjmuje tylko paczki `.cgpack` VizRS i dawne `.vizrs.json`. Moduły strony zsynchronizowane z CG System (`tools/sync-cg.sh`), w tym lżejsze renderowanie stojących scen w `renderer.js`.

- **Przenoszenie grafiki tylko paczką `.cgpack`:** Eksportuj scenę (menu i ⇩ Eksport) zapisuje bieżącą scenę jako `.cgpack` z grafikami, czcionkami i stronami; plików `.vizrs.json` Artist już nie zapisuje, a dawne tylko czyta (ten sam import co paczka – scena zapisana, raport o brakujących plikach). Import paczki wspólny z Trio (`cgpack.importPack` z CG System). DOKUMENTACJA §5.
- **Wysyłka na serwer wg reguł plików paczki:** plik o zajętej na serwerze nazwie i innej treści idzie jako `nazwa_2.ext`, a odnośnik w wysłanej scenie jest przepisany (dawniej plik pomijano i scena na serwerze pokazywała cudzą grafikę lub czcionkę); czcionka już obecna na serwerze nie jest wysyłana drugi raz; ponowna wysyłka nie tworzy kolejnych kopii. Raport wymienia pliki pod inną nazwą. DOKUMENTACJA §13.

- **Własne czcionki bez duplikatów i bez nadpisywania:** czcionka wgrana ręcznie (⤒ przy polu font, „＋ Wgraj i dołącz”, przeciągnięcie, skojarzenie), z paczki `.cgpack`, która już jest w zasobach pod inną nazwą, nie jest wgrywana drugi raz – element dostaje istniejącą. Plik o zajętej nazwie (także różnej tylko wielkością liter) i innej treści dostaje nazwę `nazwa_2.ext` zamiast nadpisać plik używany przez inne sceny; odnośniki wskazują nazwę zapisaną przez magazyn. Pole font wpisane ręcznie (`moja czcionka`, `MOJAFONT.TTF`) wskazuje czcionkę z zasobów zamiast Google Fonts; brakujący plik – ostrzeżenie. `cgpack.js` z CG System. DOKUMENTACJA §5.

- **Drzewo sceny – grupowanie i przesuwanie:** zaznaczanie wielu elementów (Ctrl / Shift+klik w drzewie i na kanwie), **Grupuj** (Ctrl+G, ⊞) i **Rozgrupuj** (Ctrl+Shift+G, ⊟); przesuwanie, strzałki, duplikowanie i usuwanie działają na całym zaznaczeniu. Na kanwie klik w element zaznaczonej grupy przesuwa grupę, dwuklik zaznacza grupę nadrzędną, Esc odznacza.
- **Poprawki położenia:** zmiana rodzica (przeciągnięcie w drzewie, ⇥ / ⇤) nie przesuwa już elementu, gdy grupa ma punkt zaczepienia inny niż lewy górny albo element jest animowany (klucze `x` / `y` przesuwane razem). ⤢ Dopasuj grupę obejmuje elementy obrócone, przeskalowane i na ujemnych współrzędnych. Przeciąganie elementu w obróconej lub przeskalowanej grupie idzie za kursorem.
- **Prowadnice i przyciąganie:** obszary bezpieczne EBU R 95 (akcja 93%, grafika 90%, grafika 4:3), kadry 4:3 i 14:9, dawny tytuł SD 80%, środek, trójpodział, siatka (⌗ w rogu kanwy, ▢ Safe – pokaż / ukryj); przyciąganie do kadru, prowadnic, siatki i innych elementów (🧲, Ctrl w trakcie = bez).
- **Tło kanwy** (▦): szachownica ciemna / jasna, czarne, szare, białe, chroma, własny kolor albo obraz referencyjny z zasobów – tylko podgląd.

## 0.3.1 – 2026-11-09

- **Wygląd i zachowanie programu systemu zamiast strony WWW (Linux, Windows, macOS)** – DOKUMENTACJA §14:
  - Pytania strony w **systemowych oknach dialogowych** (GTK, TaskDialog, NSAlert) z własnymi przyciskami – nowy komunikat mostu `dialog` (biała lista, limity, test). Zamknięcie okna ze zmianami: „Zapisz · Nie zapisuj · Anuluj” zamiast okna w stronie; przejście do innej sceny – jedno pytanie zamiast dwóch. Naprawia macOS, gdzie WKWebView nie pokazywał `confirm()` (usunięcie sceny, nadpisanie, przywrócenie kopii roboczej były niemożliwe).
  - Pola tekstowe (nazwa sceny, markera, presetu…) w oknie w układzie przycisków systemu zamiast `prompt()` silnika z adresem `127.0.0.1` w tytule.
  - Ciemny motyw okien systemu: pasek tytułu i menu (Windows), ciemny wariant GTK (Linux – menu, okna dialogowe, „Zapisz jako”), ciemny wygląd programu (macOS). Okno pokazuje się po wczytaniu strony – bez białego mignięcia.
  - Menu wg konwencji systemu: macOS – menu aplikacji z Usługami i Zakończ (z pytaniem o niezapisane sceny), schowek w Edycji zamiast osobnego menu „Tekst”, menu Okno i Pomoc systemu, skróty symbolami; Windows – mnemoniki i kolumna skrótów, Zakończ bez Ctrl+Q; systemowe okno „O programie”. Nowe skróty: Importuj… (CmdOrCtrl+O), Nowe okno (CmdOrCtrl+Shift+N). „Odśwież” → „Wczytaj ponownie” z pytaniem przy niezapisanych zmianach; „Powiększ/Pomniejsz/Rozmiar 100%” → „… interfejs”.
  - Czcionka interfejsu systemu (Segoe UI, San Francisco, czcionka GTK), ciemne kontrolki silnika (`color-scheme`), paski przewijania Fluent na Windows. Kanwa bez zmian (rysuje jak antena).
  - Wyłączone zachowania przeglądarki: menu kontekstowe, skróty (szukaj, drukuj, odśwież, przeglądanie kursorem F7…), boczne przyciski myszy, przeciąganie obrazów, gesty powiększania, autouzupełnianie WebView2, podgląd odnośników macOS. Narzędzia deweloperskie tylko z `VIZRS_DEVTOOLS=1`.
  - Okno „Połącz z serwerem” jako okno dialogowe: stały rozmiar, wyśrodkowane, podrzędne wobec okna Artist, bez paska menu, przyciski w kolejności systemu.

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

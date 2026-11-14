# VizRS CG Artist – dokumentacja

Opis działania programu. Model sceny, rysowanie (`renderer.js`), serwer `vizrs` i jego API opisuje dokumentacja
repozytorium **VizRS CG System** (`docs/DOKUMENTACJA.md`).

## 1. Czym jest VizRS CG Artist

Samodzielny edytor grafik i animacji pakietu VizRS – odpowiednik Viz Artist. Projektuje sceny (szablony) z animacją;
na antenę wydaje je Trio z VizRS CG System, które **nie jest dostarczane z Artist**.

Natywny program wieloplatformowy na **Tauri 2** (Linux, Windows, macOS; silniki WebView: Linux – WebKitGTK 4.1 przez wry, Windows – WebView2, macOS – WKWebView; od wersji 0.3.0). Strona **Artist** (kanwa, panele) jest wkompilowana w binarkę i domyślnie
pracuje **bez serwera** – na magazynie lokalnym w katalogu danych. Okno dodaje menu, „Zapisz jako”, pytanie przy zamknięciu,
kopię roboczą, jedną instancję, skojarzenia plików, przeciąganie plików i połączenie z serwerem `vizrs` (lokalnym albo VPS).

Most strona–okno opiera się na komendzie Tauri `ipc` wywoływanej przez `window.__vizrsPost` i zachowuje strukturę komunikatów znaną z `vizrs-shell`.

**Edytor w skrócie:** kanwa ([§4](#4-menu-i-skróty)) ma zaznaczanie ramką, edycję wielu elementów naraz we właściwościach, 8 uchwytów rozmiaru i obrót, pasek wyrównywania i rozmieszczania, menu kontekstowe ze schowkiem między scenami oraz bezpośrednią edycję tekstu w miejscu. Sceny odniesienia umożliwiają podgląd innych scen show na kanwie, przyciąganie, pomiar odległości i ustawianie powiązań (dock) bezpośrednio z podglądu ([§4](#4-menu-i-skróty)). Jedna oś czasu ([§4](#4-menu-i-skróty)) łączy presety ruchu jako klipy w wierszu elementu z kluczami poszczególnych właściwości w jednym widoku. Właściwość maski warstwy pozwala przycinać elementy prostokątem innego węzła, działając wspólnie z ruchem presetów ([§4](#4-menu-i-skróty)).

### Pakiet VizRS – zgodność aplikacji

VizRS CG Artist to jedna z czterech aplikacji pakietu VizRS, które mają być **zawsze ze sobą zgodne**: bieżące wersje wszystkich aplikacji działają razem.

| Repozytorium (katalogi obok, `../`) | Rola | Styk z tą aplikacją |
|---|---|---|
| [VizRS CG System](../../VizRS%20CG%20System) | silnik grafiki (Rust): Trio (playout stron), wyjście `/output` (też anteny kanałów `bus=ch-N`), API TCP 6100 / HTTP / SSE, serwer `vizrs`; zamrożony zapasowy Artist w przeglądarce | wysyłanie scen na serwer `vizrs` (pośrednik `/api`, `/assets`, `/events`, eksport i deploy scen oraz zasobów, format `show.json`; dostawca styku: CG System) |
| [VizRS CG Playout](../../VirtRS%20CG%20Playout) (katalog `VirtRS CG Playout`) | grafika VizRS i sloty na żywo (live ingest RTMP/SRT) na kanałach ErsatzTV; sidecar `cg`, bez zmian w ErsatzTV | brak bezpośredniego styku – sceny z Artist trafiają na antenę przez VizRS CG System |
| [VizRS Live](../../VizRS%20Live) | panel kanału nad ErsatzTV legacy (sterowanie kanałami, ramówką, playoutami bez web GUI legacy) | brak bezpośredniego styku – sceny idą przez CG System |
| **VizRS CG Artist** (to repo) | samodzielny edytor grafik i animacji (Tauri 2), projektuje sceny; sceny wysyła na serwer `vizrs` (VizRS CG System); działa też bez serwera | – |

Zasady zgodności:

- **Styk zmienia się w obu repozytoriach naraz.** Zmiana API, formatu scen (`show.json`), protokołu lub modułów rysowania po jednej stronie wymaga dostosowania drugiej strony i jej dokumentacji, zanim wejdzie do wydania. Dostawcą styku API, formatu scen i modułów rysowania jest VizRS CG System (jego `docs/API.md` i `docs/DOKUMENTACJA.md`); w Artist – jak okno i strona z nich korzystają (§2 pośrednik, §5 pliki, §12 magazyn lokalny).
- **Starsza wersja sąsiada nie psuje aplikacji.** W razie braku nowszych pól lub wersji API serwera `vizrs` Artist zachowuje stabilność i czytelnie informuje o błędach komunikacji lub konfliktach zamiast przerywać pracę okna.
- **Wydania razem.** Przed wydaniem VizRS CG Artist sprawdź z bieżącymi wersjami pozostałych aplikacji pakietu; zmianę wymagającą nowszego serwera `vizrs` lub modułów CG System odnotuj w `CHANGELOG.md` z minimalną wersją.

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
| `PLIK` | – | `.cgpack` albo dawny `.vizrs.json` – tylko odczyt (też obraz, czcionka) – import w oknie Artist |
| `--data KAT` | `VIZRS_ARTIST_DATA` | katalog danych Artist; domyślnie katalog danych użytkownika/vizrs-cg-artist |
| `--token T` | `VIZRS_TOKEN` | token serwera (`--connect` albo dołączenie do serwera `vizrs` na katalogu danych) |
| `--connect URL` | `VIZRS_CONNECT` | serwer zdalny (np. https://cg.example.pl) |
| `--local` | – | praca lokalna mimo zapisanego łączenia przy uruchomieniu |
| `--probe JS --probe-out JSON` | – | test: po wczytaniu strony wykonaj skrypt, zapisz wynik `probe:…`, zakończ (pytania strony dostają od razu ostatni przycisk – „Anuluj”) |
| – | `VIZRS_DEVTOOLS=1` | narzędzia deweloperskie WebView (Widok → Narzędzia deweloperskie, CmdOrCtrl+Shift+I); bez tej zmiennej tylko w kompilacji testowej |
| – | `VIZRS_GPU` | akceleracja WebKitGTK na Linuksie: `auto` (domyślnie), `on`, `off`, `x11`, `system` – niżej |
| `--help`, `-h` | – | pomoc |
| `--version`, `-V` | – | wersja programu |

**Rozmiar okna a skalowanie ekranu** – `src/screen.rs` (ten sam plik w VizRS CG Artist, VizRS CG System i VizRS Live): okno otwierane bez maksymalizacji dostaje najwyżej 92 % szerokości i 90 % wysokości obszaru roboczego monitora w pikselach logicznych – przy skalowaniu ułamkowym (1920×1080 przy 125 % = 1536×864) domyślne 1600×900 albo rozmiar zapisany na innym ekranie nie wychodzi poza krawędź.

**Akceleracja sprzętowa (Linux, WebKitGTK)** – `src/gpu.rs`, ten sam plik w VizRS CG Artist, VizRS CG System (`source/shell`) i VizRS Live (`desktop/`): przy starcie, przed GTK, okno ustawia zmienne WebKitGTK. Sterownik własnościowy **NVIDIA** (węzeł `renderD*` sterownika `nvidia`, `nvidia-drm.modeset` nie „N”): `WEBKIT_FORCE_DMABUF_RENDERER=1` i `__NV_DISABLE_EXPLICIT_SYNC=1` – bez tego WebKitGTK sam wyłącza akcelerację („Policy: never” w `webkit://gpu`) i rysuje na CPU (pomiar 2026-11-13, Quadro P400, sterownik 580, KDE Wayland: animacja 5 → 61 kl./s; samo wymuszenie DMA-BUF na Waylandzie kończy się błędem protokołu 71). Inne karty (Mesa: Intel, AMD, nouveau) i maszyny bez GPU – wybór zostaje przy WebKitGTK. Zmienne `WEBKIT_*` ustawione przez użytkownika mają pierwszeństwo. `VIZRS_GPU`: `auto` (domyślnie; `on` – to samo), `off` – bez akceleracji (zepsuty sterownik), `x11` – okno przez XWayland (`GDK_BACKEND=x11`) z akceleracją, `system` – bez zmian. Decyzja trafia na standardowe wyjście błędów (`GPU: …`). Windows (WebView2) i macOS (WKWebView) – akceleracja systemu, bez zmian.

Błędne argumenty: komunikat na stderr, kod wyjścia 1.

## 4. Menu i skróty

| Menu | Pozycje |
|---|---|
| Plik | Nowe okno (CmdOrCtrl+Shift+N) · Nowa scena · Importuj… (CmdOrCtrl+O) · Zapisz (Ctrl+S) · Eksportuj scenę (.cgpack)… · Paczka .cgpack… · Wyślij na serwer… · Połącz z serwerem… (CmdOrCtrl+Shift+K) · Zamknij okno (CmdOrCtrl+W) · Zakończ (Linux: Ctrl+Q; Windows: bez skrótu – Alt+F4 zamyka okno) |
| Edycja | Cofnij (Ctrl+Z) · Ponów (Ctrl+Y) · Duplikuj (Ctrl+D) · Usuń (Delete) |
| Widok | Dopasuj kanwę (Shift+1) · Kanwa 100% (Shift+2) · Kanwa do zaznaczenia (Shift+3) · Powiększ interfejs (CmdOrCtrl+=) · Pomniejsz interfejs (CmdOrCtrl+−) · Interfejs 100% (CmdOrCtrl+0) · Wczytaj ponownie (F5; przy niezapisanych zmianach najpierw pytanie) · Pełny ekran (F11) · Narzędzia deweloperskie (tylko z `VIZRS_DEVTOOLS=1`) |
| Scena | Odtwórz / zatrzymaj (Spacja) · Dodaj marker (M) |
| Pomoc | Pokaż logi · Otwórz katalog danych · Sprawdź aktualizacje · O programie |

Menu trzyma się konwencji systemu:
- **Windows:** mnemoniki (Alt+P – Plik, Alt+E – Edycja, Alt+W – Widok, Alt+S – Scena, Alt+C – Pomoc); skróty strony w kolumnie skrótów menu (etykieta z tabulatorem, jak w Win32), ciemne menu i pasek tytułu.
- **macOS:** pierwsze podmenu to menu aplikacji **VizRS CG Artist** (O programie VizRS CG Artist, Usługi, Ukryj, Ukryj pozostałe, Pokaż wszystkie, Zakończ VizRS CG Artist ⌘Q – własna pozycja, więc niezapisane sceny dostają pytanie); Edycja ma też Wytnij, Kopiuj, Wklej, Zaznacz wszystko; menu **Okno** (Minimalizuj, Powiększ, Pełny ekran ⌃⌘F, Wszystkie na wierzch) jest menu okien systemu, Pomoc – menu pomocy (z wyszukiwaniem). Skróty strony pokazane symbolami (⌘S, ⇧1, ⌫). Zakończ i Pełny ekran F11 nie występują w Pliku/Widoku.
- **Linux:** mnemoniki jak na Windows, skróty strony w nawiasie, ciemny wariant motywu GTK.
- **O programie:** systemowe okno „O programie” (macOS – panel z ikoną, Linux – GtkAboutDialog, Windows – okno komunikatu): wersja, wersja modułów CG System, katalog danych, odnośnik do wydań.

### Drzewo sceny i kanwa (skróty strony)

| Działanie | Drzewo | Kanwa |
|---|---|---|
| Zaznacz kilka | Ctrl+klik (dodaj / zdejmij), Shift+klik (zakres) | Ctrl / Shift+klik; **ramka** – przeciągnięcie od pustego miejsca (Shift / Ctrl – dodaj, Ctrl+Shift – odejmij, Alt – tylko całe w ramce) |
| Grupuj / rozgrupuj | Ctrl+G / Ctrl+Shift+G, przyciski ⊞ / ⊟ | jak w drzewie |
| Przesuń | przeciągnij wiersz (kolejność, rodzic), ⇥ / ⇤ (włóż / wyjmij) | przeciągnij; strzałki = 1 px (Shift = 10 px) |
| Edytuj tekst w miejscu | – | dwuklik w zaznaczony tekst albo Enter; Ctrl+Enter / klik obok – zatwierdź, Esc – anuluj |
| Grupa nadrzędna | – | dwuklik (kolejny dwuklik – poziom wyżej; w zaznaczony tekst – edycja); klik w element zaznaczonej grupy przesuwa grupę, klik bez ruchu zaznacza sam element |
| Odznacz | – | Esc albo klik w puste miejsce |
| Kopiuj / wytnij / wklej elementy | – | Ctrl+C / Ctrl+X / Ctrl+V (także między scenami i oknami; w tej samej scenie kopia +20 px) |
| Zaznacz wszystko | – | Ctrl+A (bez zablokowanych) |
| Przesuń całą scenę | – | przytrzymany **S** + przeciągnięcie (kursor ✋); strzałki bez zaznaczenia |

- **Położenie przy zmianie rodzica** (przeciągnięcie w drzewie, ⇥ / ⇤, grupowanie, rozgrupowanie, ⤢ dopasowanie grupy) zostaje na ekranie bez zmian: liczone z punktem zaczepienia grupy (`anchorX` / `anchorY`) i wartościami w bieżącym czasie; klucze animacji `x` / `y` przesuwają się razem z wartością. Obrót i skala grupy nie są przenoszone na element (komunikat).
- **⤢ Dopasuj grupę**: wymiar = obrys zawartości (także elementy obrócone, przeskalowane i na ujemnych współrzędnych); początek grupy przechodzi na lewy górny róg zawartości, dzieci przesuwają się odwrotnie.
- **Rozgrupowanie** grupy z własną animacją, przekształceniem, kryciem, maską albo polem kontrolnym pyta o zgodę – te cechy giną.
- **Chwytanie na kanwie** – tylko to, co element rysuje: grupa i prostokąt / elipsa bez wypełnienia i ramki (pojemniki) nie łapią kliknięć w puste miejsce swojej ramki (klik tam = pusta kanwa, przeciągnięcie zaczyna ramkę); tekst i zegar łapią w obszarze napisu, nie całego pola; niewidoczne w bieżącym czasie (krycie 0, ukryte) – wcale. Zaznaczony pojemnik (z drzewa albo dwuklikiem) da się przeciągnąć z dowolnego miejsca jego ramki. Zablokowane elementy są dla myszy przezroczyste.
- **Zaznaczanie ramką** – zaznacza elementy, które coś rysują (jak chwytanie: pojemniki bez wypełnienia nie), przecinane przez ramkę, także w grupach; zablokowane i niewidoczne pomija. Dotąd przeciągnięcie pustego miejsca przesuwało scenę – teraz robi to **S** + przeciągnięcie.
- **Kilka zaznaczonych w panelu Właściwości** – nagłówek „Właściwości – 3 elementy” i skład („2 × Tekst, 1 × Prostokąt”); widać tylko właściwości wspólne dla ich typów. Zmiana (pole, przeciąganie etykiety, kolor, punkt zaczepienia, przyciski) trafia do wszystkich zaznaczonych, które mają tę właściwość: **x / y** przesuwają wszystkie o tyle samo (układ zostaje), inne właściwości dostają tę samą wartość; jedno Ctrl+Z cofa całość. Pole z różnymi wartościami jest puste z „—”, przełącznik – nieokreślony. Klucze animacji ◆, pola kontrolne, zakładki Ruch i Dane – tylko dla jednego elementu.
- **Ramka zaznaczenia** obraca się razem z elementem (obrót własny i grup nadrzędnych); etykieta z położeniem, wymiarem i kątem stoi pod obrysem (nad nim jest kółko obrotu).
- **Uchwyty** (jeden zaznaczony, niezablokowany element): 8 uchwytów rozmiaru w rogach i na bokach – przeciwległy róg / bok stoi w miejscu, także gdy element albo grupa nadrzędna jest obrócona; **Shift** – proporcje (na boku druga oś zmienia się od środka), **Alt** – od środka. Kółko nad górnym bokiem – **obrót** wokół środka ramki (jak w rendererze), Shift – co 15°. Uchwyty tylko dla właściwości, które typ ma (bez szerokości / wysokości / obrotu – bez odpowiednich uchwytów). **Przyciąganie** przeciąganej krawędzi do tych samych celów co przy przesuwaniu (kadr, prowadnice, inne elementy, sceny odniesienia; Ctrl – bez) – gdy element i jego grupy nie są obrócone. Jedno przeciągnięcie = jeden krok cofania; elementy z kluczami dostają klucz w bieżącym czasie.
- **Edycja tekstu na kanwie** – dwuklik w zaznaczony element tekstowy (albo Enter, gdy zaznaczony jest jeden tekst): pole w miejscu napisu – ta sama czcionka, rozmiar, grubość, kursywa, wersaliki, interlinia, wyrównanie (także w pionie), kolor i obrót (własny i grup); napis na kanwie jest na ten czas ukryty, ramka zaznaczenia i pasek wyrównania też. Edytuje się tekst surowy – `[[wyróżnienie]]` i nowe wiersze zostają (Enter = nowy wiersz). **Ctrl+Enter** albo klik obok – zatwierdza (jeden krok cofania), **Esc** – anuluje, Ctrl+S – zatwierdza i zapisuje. Gdy tekst jest polem kontrolnym, zmienia się wartość domyślna (w Trio operator wpisuje wartość strony). Dwuklik w niezaznaczony element – jak dotąd grupa nadrzędna.
- **Menu kontekstowe kanwy** (prawy klik): na elemencie (zaznacza go, jeśli nie był) – duplikuj, kopiuj, wytnij, wklej, usuń, grupuj / rozgrupuj, **kolejność** (na wierzch, wyżej, niżej, na spód), wyrównaj (jak pasek, względem wybranego tam odniesienia), zablokuj / odblokuj, ukryj / pokaż, zaznacz grupę nadrzędną, pokaż w drzewie oraz **zaznacz pod kursorem** – lista elementów rysujących w tym miejscu (od wierzchu), także zasłoniętych. Na pustym miejscu – wklej, zaznacz wszystko, prowadnice, sceny odniesienia, dopasuj widok, ustawienia sceny. Esc albo klik obok zamyka.
- **Schowek elementów** – w pamięci okna (`localStorage` `vizrs.clipNodes`), więc działa między scenami i oknami Artist; wklejenie trafia do korzenia sceny w to samo miejsce na ekranie (położenie grupy nadrzędnej doliczone, bez jej obrotu i skali), w tej samej scenie – przesunięte o 20 px i z nazwą `…_kopia`. Ctrl+C / Ctrl+V na osi czasu dalej kopiują klucze.
- **Wyrównaj i rozmieść** – pasek w lewym górnym rogu kanwy, gdy coś jest zaznaczone: lista **względem** (zaznaczenia, elementu kluczowego – główny zaznaczony, z pełną ramką; kadru; obszaru grafiki EBU R 95 90%; przy jednym elemencie – tylko kadr i obszar grafiki), wyrównanie lewych / środków / prawych i górnych / środków / dolnych krawędzi, **rozmieść** w poziomie ⋯ / w pionie ⋮ – równe odstępy (3 i więcej), **rząd** / **kolumna** – kolejno z odstępem w px (od lewego / górnego), **szer.= / wys.=** – jak element kluczowy (bez obróconych i grup). Obrysy jak przy chwytaniu (pojemniki bez wypełnienia się nie liczą); elementy przesuwają się w układzie swoich grup razem z kluczami x / y. Jedna operacja = jeden krok cofania.
- **Kilka zaznaczonych – wspólna ramka** (obrys wszystkich, etykieta „3 elementy 600×200”) z 8 uchwytami, bez obrotu: skalowanie względem przeciwległego rogu / boku (Alt – środka), Shift – proporcje, przyciąganie krawędzi jak wyżej. Środek każdego elementu skaluje się względem punktu stałego, ramka (szerokość / wysokość) – o współczynnik osi (element obrócony o 90° – osie zamienione, o inny kąt – średnia); tekst zmienia ramkę, nie wielkość czcionki; grupy i typy bez wymiaru tylko się przesuwają. Jeden krok cofania.
- **Przeciąganie na kanwie** uwzględnia obrót i skalę grup nadrzędnych (element idzie za kursorem). **Przyciąganie** (🧲, domyślnie włączone; Ctrl w trakcie = bez): krawędzie i środek kadru, widoczne prowadnice, siatka, krawędzie i środki innych elementów oraz elementów scen odniesienia; linia przyciągania jest różowa, do sceny odniesienia – turkusowa z nazwą celu („Ticker › pas”). Przeciągnięcie pustego miejsca (cała scena, `scene.x` / `scene.y`) też się przyciąga – obrysem wszystkich elementów sceny. Obrysy (przyciąganie, pomiar, dosuwanie) liczone są z tego, co elementy rysują – niewidoczne pojemniki (np. grupa 1920×1080) się nie liczą.
- **Pomiar odległości** (przytrzymaj **Alt** nad kanwą): żółte linie i liczby w px od obrysu zaznaczenia do najbliższej krawędzi w każdym z czterech kierunków – innych elementów sceny, elementów scen odniesienia albo kadru. Bez zaznaczenia mierzy obrys całej sceny do odniesień i kadru.
- **Ostrzeżenie o nachodzeniu** (sceny odniesienia, domyślnie włączone; wyłącznik w ⧉): gdy element bieżącej sceny zachodzi na element sceny odniesienia z **innej** warstwy (grają razem na antenie), część wspólna jest zaznaczona na czerwono, a w rogu kanwy komunikat „⚠ Nachodzi na grafikę z innej warstwy: tlo ↔ Ticker › pas”. Tylko ostrzeżenie – nic nie blokuje.
- **Sceny odniesienia** (⧉ w rogu kanwy, liczba = wybrane; Shift+R pokaż / ukryj; klik w „⧉ …” w wierszu sceny w drzewie): inne sceny show narysowane półprzezroczyście na kanwie tak, jak złożą się na wyjściu – w kolejności warstw (`back` < `main` < `z<N>_…` < `front`, jak `layerZ` w rendererze), z własnym położeniem sceny, w stanie z pierwszego stop pointu (albo „jak głowica” osi czasu). Kolejność: wg warstw, wszystkie pod albo wszystkie nad bieżącą sceną; krycie 10–100%; przyciąganie do odniesień można wyłączyć. Odniesienia nie reagują na mysz (zaznaczanie zostaje w bieżącej scenie). Sceny tej samej warstwy zastępują się na antenie – okienko to podpowiada; inna rozdzielczość sceny = rysowana w px kadru, z ostrzeżeniem ⚠. Wybór jest **osobny dla każdej sceny** (ticker otwiera się zawsze z belką).
- **Położenie względem innej sceny** – ustawienia sceny (klik w puste tło) i grupa **Względem innej sceny** w panelu Właściwości elementu: cel (scena i opcjonalnie jej element; domyślnie obrys całej sceny), **odstęp** w px, **dosuń** nad / pod / z lewej / z prawej celu, **wyrównaj krawędzie** (lewe, środki, prawe, góry, środki, doły); dla elementu także **↔ szerokość jak cel** (jeden element bez obrotu; lewe krawędzie wyrównane). Scena przesuwa się przez położenie sceny (animacje bez zmian), element – razem z kluczami `x` / `y`. Z polem **jako powiązanie (dock)** przycisk zamiast przesuwać sceny dodaje albo poprawia regułę `dock` `scene:<nazwa celu>` z wyliczonym `dx` / `dy` (przesunięcie tylko, gdy cel jest na antenie). Obrysy liczone jak na kanwie (cel w pierwszym stop poincie, bieżąca scena w bieżącym czasie); jedno Ctrl+Z cofa.
- **Powiązania (dock) z podglądu** – ustawienia sceny → **Powiązania (dock)**; przy każdej regule:
  - **👁 Podgląd** – cele reguły (`scene:<nazwa>`; `layer:<warstwa>` – jedna scena tej warstwy, najpierw wybrana jako odniesienie) pojawiają się jako sceny odniesienia „na antenie”, a bieżąca scena przesuwa się o wynik **wszystkich** reguł, które te cele wyzwalają – tak jak na wyjściu (reguły się sumują, własna warstwa nie wyzwala), z animacją `czas s`. Pasek na dole kanwy: kto jest na antenie, wynikowe przesunięcie, **▶ Powtórz** (ruch jeszcze raz), **✕** / Esc – koniec. Cele `page:<numer>` są pomijane (strony zna tylko serwer).
  - **✋ Ustaw z kanwy** – przeciągnięcie sceny (w dowolnym miejscu kanwy, z przyciąganiem do scen odniesienia; Ctrl – bez) i strzałki (1 px, Shift – 10 px) zmieniają **Δx / Δy tej reguły**, nie położenie sceny. **Enter** albo ✓ zatwierdza (jeden krok cofania), **Esc** albo ✕ anuluje.
  - **＋ Z odniesienia** – nowa reguła z celem z wybranych scen odniesienia z innych warstw (`scene:A|scene:B` – przesunięcie, gdy na antenie jest którakolwiek), od razu w trybie „Ustaw z kanwy”. Przykład: belka, odniesienie ticker, ＋ Z odniesienia, przeciągnięcie belki w górę, aż przyciągnie się nad tickerem, Enter.
  - Podgląd i ustawianie to tylko widok kanwy – do sceny trafia wyłącznie zatwierdzona reguła (`dock[{target, dx, dy, dur}]`, format bez zmian).
- **Prowadnice** (⌗ w rogu kanwy; ▢ Safe pokazuje / ukrywa): EBU R 95 akcja 93% i grafika 90%, kadr 4:3 (center cut) i grafika 4:3 (67,5% × 90%), kadr 14:9, dawny tytuł SD 80%, środek, trójpodział, siatka 10–200 px.
- **Tło kanwy** (▦): szachownica ciemna / jasna, czarne, szare, białe, chroma zieleń / niebieski, własny kolor albo obraz referencyjny z zasobów (np. kadr programu). Tylko podgląd – nie trafia do sceny ani na wyjście.
- **Zaokrąglenie rogów i boków** (prostokąt, kod QR, obraz; panel Właściwości → Wygląd → **zaokrąglenie**): pole **wszystkie rogi** (`radius`) i przycisk **▸ osobno** rozwijający schemat prostokąta – pola rogów w narożnikach (↖ róg, róg ↗, ↙ róg, róg ↘), pola boków na krawędziach (bok górny / dolny / lewy / prawy – oba rogi przy boku: bok górny = 20 → zaokrąglona tylko góra), w środku podgląd kształtu rogów (w skali krótszego boku elementu). Schemat jest rozwinięty sam, gdy któryś róg albo bok jest użyty (• przy „osobno”). Róg, przy którym ustawione są dwa boki, jest eliptyczny (poziomo bok górny/dolny, pionowo lewy/prawy); ustawiony róg ma pierwszeństwo przed bokami. Puste pole (w scenie `-1`; prawy klik na etykiecie) dziedziczy: róg → z boków → „wszystkie rogi”; szara wartość w pustym polu to wynik dziedziczenia. **wyczyść rogi i boki** usuwa wszystkie nadpisania jednym krokiem cofania. Przeciąganie etykiety zaczyna od bieżącego zaokrąglenia. Właściwości `radiusTL`…`radiusBL`, `radiusL`…`radiusB` są animowalne i rysowane tak samo na antenie (CG System, także renderer natywny).
- Ustawienia prowadnic, przyciągania i tła pamięta strona w `localStorage` (`vizrs.canvas`), scen odniesienia – `vizrs.refs` (wybór per scena, krycie, kolejność, czas, przyciąganie, ostrzeżenie), położenia względem innej sceny – `vizrs.rel` (cel, odstęp, tryb dock); dla tej instalacji okna, nie w `show.json`.

Pozycje strony wywołują `window.__vizrsCmd(akcja)`. Ich skróty (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+D, Delete, Shift+1/2/3, Shift+R, Alt – pomiar, Spacja, M) obsługuje strona, nie powłoka okna – dzięki temu działają prawidłowo także w polach tekstowych; menu je tylko pokazuje. Na macOS strona przyjmuje też ⌘ zamiast Ctrl. Cofnij / Ponów w menu synchronizują się ze stanem aktywności zgłaszanym przez stronę (`sync_menu`).

### Oś czasu – ruch i klucze w jednym widoku

Plan: `../VizRS CG System/docs/plany/PLAN-jeden-ruch.md` (J1–J4). Format sceny bez zmian: presety ruchu to `node.motion`, klucze – `anim`; renderer składa jedno z drugim.

- **Jeden widok** (dawny przełącznik „≣ Sekwencja” usunięty): każdy element z ruchem albo kluczami ma **wiersz elementu** z klipami presetów – wejście (niebieski), efekt tekstu IN / OUT (cieńszy pasek pod spodem), pętla (kreskowany pas od końca wejścia do ostatniego stopu), wyjście (pomarańczowy, od ostatniego stop pointu); czasy liczone jak w rendererze (`motion.js`: opóźnienie, „po węźle”, rozłożenie tekstu). Pod wierszem elementu – wiersze kluczy jego właściwości; ▾ / ▸ zwija je (zwinięty wiersz pokazuje „◆ liczba”). Zaznaczony element jest na górze i ma wiersz zawsze (także bez ruchu – żeby dodać preset).
- **Klipy myszą:** przeciągnięcie – opóźnienie, prawa krawędź – czas (Shift – co 0,05 s); klip wejścia przeciągnięty **w pionie** na wiersz innego elementu ustawia „po węźle” (wchodzi po jego wejściu; pętla sekwencji jest odrzucana), ↳ na klipie i przy nazwie. **Klik** w klip – głowica na jego początku i zakładka **Ruch** na tej fazie. **Dwuklik** albo prawy klik w pusty wiersz elementu – menu „＋ wejście / wyjście / efekt tekstu IN / OUT / pętla” (tylko brakujące) i „Zrób preset z kluczy”. **Prawy klik** w klip – „Rozbij na klucze”, „Pokaż w zakładce Ruch”, „Usuń”.
- **Klucze i presety razem:** wiersz klucza właściwości, którą zmienia też preset, ma znacznik **„+ preset”** (składają się). **Rozbij na klucze** (jedna faza; „◆ Na klucze” w pasku – obie) nie odmawia przy istniejących kluczach: preset dodaje się do ścieżki – położenie, skos, rozmycie, przycięcie przez różnicę, krycie i skala przez iloraz względem spoczynku w chwili startu fazy. Typy bez odpowiednika w kluczach (przesłony, obroty, odwrócenia, pętle, efekty tekstu) – pozycja nieaktywna z podpowiedzią. **Z kluczy** (◇ w pasku albo menu wiersza) bierze zaznaczone klucze (klik, Shift, ramka na osi) – tylko ich właściwości; odmawia, gdy element ma już preset tej fazy.
- **Zakładka Ruch:** na górze **Klucze (◆)** – przycisk na każdą właściwość z kluczami (skok do ścieżki, zaznaczenie pierwszego klucza, głowica na nim); niżej fazy w kolejności czasu: wejście, tekst IN, pętla, wyjście, tekst OUT, efekt tła, punkt ruchu, „po węźle”.
- **Maska warstwy** (J5, właściwość „maska (węzeł)” w panelu Właściwości – grupa Maska): nazwa węzła z tej samej grupy; jego prostokąt przycina element razem z ruchem presetów. Format i zachowanie opisuje DOKUMENTACJA CG System §4.3; kanwa rysuje to rendererem z CG System. Automatyczna szerokość tła względem tekstu – istniejące Autofollow (`follow`, oś, margines, minimum).
- Pasek **SEKWENCJA** (kaskada, po kolei, kopiuj ruch, na klucze, z kluczy, usuń ruch, dopasuj) i pasek zaznaczonego klucza są widoczne zawsze.

## 5. Pliki

- **Zapisz jako:** pobrania strony (eksport sceny, paczka) otwierają systemowe okno zapisu (wtyczka `tauri-plugin-dialog`).
- **Import:** Importuj…, przeciągnięcie na okno, `PLIK` w wierszu poleceń albo otwarcie skojarzonego pliku.
  Plik (do 512 MB) trafia do strony porcjami po 3 MB (`window.__vizrsFile.begin/chunk/end`); o imporcie decyduje strona.
  Rozszerzenia: `cgpack`, `json`, `png`, `jpg`, `jpeg`, `webp`, `gif`, `svg`, `mp4`, `webm`, `ttf`, `otf`, `woff`, `woff2`.
- **Przenoszenie grafiki – tylko `.cgpack`:** Eksportuj scenę zapisuje bieżącą scenę jako paczkę (z grafikami, czcionkami
  i stronami), Paczka .cgpack… – wybrane sceny. Importuj… przyjmuje paczkę `.cgpack` i dawny eksport
  sceny `.vizrs.json` (tylko odczyt, ten sam import co paczka, raport o brakujących plikach). Zasady: DOKUMENTACJA CG System §8.7.
- **Własne czcionki i grafiki** (⤒ przy polu, „＋ Wgraj i dołącz”, przeciągnięcie, skojarzenie, import paczki) trafiają do zasobów
  wg reguł plików paczki z CG System (`cgpack.assetPlacer`, DOKUMENTACJA CG System §8.7): nazwa jak na serwerze, czcionka już wgrana
  (ta sama treść, pod dowolną nazwą) nie powstaje drugi raz – element dostaje istniejącą, nic nie jest nadpisywane (zajęta nazwa,
  także różna tylko wielkością liter → `nazwa_2.ext`). Komunikat mówi, który plik został użyty.
- **Pole font wpisane ręcznie:** nazwa bez rozszerzenia, w innej wielkości liter albo sprzed poprawienia przez serwer
  (`moja czcionka` → `Moja_Czcionka.ttf`) wskazuje czcionkę z zasobów, a wbudowana rodzina dostaje kanoniczną pisownię
  (`barlow condensed` → `Barlow Condensed`); inna nazwa zostaje (Google Fonts). Nazwa pliku czcionki, której nie ma w zasobach – ostrzeżenie.

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

Strona Artist leży w `web/`. `artist.html`, `native.js` i `native.css` rozwija to repo; reszta (moduły rysowania, `ui.css`, `vizrs-ui.css` – wspólny rdzeń wyglądu rodziny VizRS, wzór: panel VizRS Live –, fonty i `fonts.css`)
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
| `/artist`, `/<moduł>.js`, `/ui.css`, `/vizrs-ui.css`, `/fonts/fonts.css`, `/fonts/<plik>.woff2` | strona i fonty z binarki |
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
  (`cgpack.sceneAssets`) idą przed sceną wg reguł plików paczki (`deploy::Placer`, ta sama kolejność co `cgpack.assetPlacer`):
  czcionka już obecna na serwerze (ta sama treść) nie jest wysyłana drugi raz, plik o tej samej nazwie i treści jest pomijany,
  nic nie jest nadpisywane – zajęta nazwa z inną treścią → `nazwa_2.ext` (a przy ponownej wysyłce ta sama kopia, nie kolejna).
  Odnośniki w scenie na serwerze wskazują plik na serwerze; scena lokalna zostaje bez zmian.
- Raport: wysłane sceny i zasoby, pominięte (już na serwerze), pliki zapisane na serwerze pod inną nazwą, konflikty i błędy serwera (walidacja `validate.rs`).
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
| Wygląd i czcionka interfejsu | jak panel VizRS Live (rdzeń `vizrs-ui.css` z CG System + `ui.css`): ciemne powierzchnie, bursztynowy akcent, pigułki stanu z kropką, okna jak w Live; czcionka Inter jak w przeglądarce | | |
| Kontrolki | `color-scheme: dark` – pokrętła liczb, pola wyboru, listy i paski przewijania w ciemnym wariancie | | |
| Paski przewijania | wąskie, ciemne | systemowe nakładane Fluent (Windows 11, WebView2 ≥ 125) | widoczne dopiero nad przewijanym obszarem |
| Funkcje przeglądarki | wyłączone: menu kontekstowe silnika (poza polami tekstowymi), skróty przeglądarki (F3, F5, F7, F12, Ctrl+F/G/H/J/P/R, Ctrl+±/0, Alt+←/→), boczne przyciski myszy (Wstecz/Dalej), przeciąganie obrazów i odnośników z okna, gesty powiększania, „opuścić stronę?” przy wczytaniu ponownie; narzędzia deweloperskie tylko z `VIZRS_DEVTOOLS=1` | + autouzupełnianie formularzy WebView2 | + podgląd odnośników (Force Touch) |
| Okno „Połącz z serwerem” | okno dialogowe: stały rozmiar, wyśrodkowane, nad oknem Artist (okno podrzędne), bez paska menu programu (Windows, Linux), kolejność przycisków systemu | | |

Kanwa (`#stage`) rysuje dokładnie jak antena (`renderer.js`); wygląd interfejsu wokół niej daje rdzeń `vizrs-ui.css`.


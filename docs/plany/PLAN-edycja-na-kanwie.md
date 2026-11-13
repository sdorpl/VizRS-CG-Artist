# PLAN: edycja elementów na kanwie (K1–K5)

> Stan: **K1 zrobione, K2 bez skalowania kilku zaznaczonych i bez przyciągania krawędzi przy zmianie rozmiaru** (2026-11-13; przy okazji naprawiony uchwyt rozmiaru, który od 26.11.3 nie działał). Dalej: reszta K2, K3–K5. Decyzje z §6 przyjęte wg propozycji (polecenie użytkownika „zacznij wdrażać”): scena – S + przeciągnięcie, ramka – przecinane (Alt – całe w środku), skalowanie tekstu – ramka, wyrównanie – pasek nad kanwą, K5 – tak, po K1–K4. Zakres: VizRS CG Artist (`web/artist.html`); format `show.json`, `renderer.js` i okno (Rust) bez zmian.
> Wchłania P8 z `../VizRS CG System/docs/plany/PLAN-panel-wlasciwosci.md` (edycja wielu zaznaczonych – zaznaczanie wielokrotne już jest).

## 1. Problem

Kanwa Artist (26.11.4) umie: zaznaczyć klikiem (Ctrl / Shift + klik – dodaj), przeciągnąć zaznaczenie z przyciąganiem, zmienić rozmiar
**jednym** uchwytem w prawym dolnym rogu, przesunąć całą scenę przeciągnięciem pustego miejsca, dwuklikiem wejść do grupy nadrzędnej,
mierzyć odległości z Alt. Brakuje tego, czego grafik oczekuje z każdego edytora (Viz Artist, Figma, After Effects):

| Brak | Skutek dziś |
|---|---|
| zaznaczanie ramką | kilka elementów – tylko klikanie z Ctrl; puste miejsce przesuwa scenę |
| panel dla wielu zaznaczonych (P8) | Właściwości pokazują tylko pierwszy element; kolor czy czcionkę 5 napisów zmienia się 5 razy |
| uchwyty rogów i boków, obrót, Shift / Alt | rozmiar tylko od prawego dolnego rogu, bez proporcji i od środka; obrót – tylko liczbą w panelu |
| wyrównaj / rozmieść zaznaczone | wyrównanie jest tylko do innej sceny (26.11.4); równe odstępy – ręcznie liczbami |
| menu kontekstowe kanwy | operacje (duplikuj, grupuj, kolejność, zablokuj, ukryj) – tylko w drzewie i skrótach |
| edycja tekstu na kanwie | treść – tylko w panelu Właściwości; dwuklik w tekst wchodzi do grupy nadrzędnej |

## 2. Zasady (z `CLAUDE.md`, w każdym etapie)

- **Bez zmiany formatu sceny i bez edycji `renderer.js`** (kopia z CG System). Brakujące API odtwarzacza – najpierw w CG System, potem `tools/sync-cg.sh`.
- **Jedna operacja = jeden krok cofania** (`checkpoint()` na początku gestu, nie w każdym ruchu myszy).
- **Geometria jak dziś:** przesunięcia i rozmiary przez istniejące `parentXf`, `toLocal`, `shiftNode`, `setProp` – z obrotem i skalą przodków, punktem zaczepienia i kluczami `x/y/w/h` (element animowany – zmiana w bieżącym kluczu albo przesunięcie wszystkich kluczy osi, jak przy przeciąganiu).
- **Obrysy jak chwytanie:** `drawnBox` / `drawsNode` (26.11.4) – pojemniki bez wypełnienia nie liczą się do ramki ani wyrównania.
- **Zablokowane elementy** (`isLocked`) nie dają się zaznaczyć ramką, przesunąć ani zmienić.
- Dokumentacja razem z kodem: `docs/DOKUMENTACJA.md` (kanwa, skróty), `CHANGELOG.md` („Niewydane”), podpowiedź `data-hint` kanwy; test w `tests/e2e/okno.js`.

## 3. Etapy

### K1. Zaznaczanie ramką i edycja wielu zaznaczonych (P8)

**Ramka (marquee):**
- przeciągnięcie od pustego miejsca kanwy rysuje ramkę; zaznacza elementy, których obrys rysowany **przecina** ramkę (Alt w trakcie – tylko całkiem w środku),
  Shift / Ctrl – dodaje do bieżącego zaznaczenia (Ctrl+Shift – odejmuje);
- zaznacza na poziomie **bieżącej grupy** (dzieci otwartej dwuklikiem grupy), inaczej elementy najwyższego poziomu – jak klik;
- przesuwanie całej sceny przenosi się na inny gest (decyzja §6 pkt 1; propozycja: **przytrzymany klawisz S** + przeciągnięcie albo przeciągnięcie wiersza sceny w drzewie); strzałki bez zaznaczenia nadal przesuwają scenę;
- klik bez ruchu w puste miejsce – jak dziś: odznacza i pokazuje ustawienia sceny.

**Panel dla wielu zaznaczonych (P8 planu panelu):**
- nagłówek „Właściwości – 5 elementów (3 teksty, 2 prostokąty)”; pokazane właściwości **wspólne** dla typów zaznaczenia;
- różne wartości – pole puste z „—” (placeholder); wpisanie i przeciąganie etykiety ustawia wszystkim tę samą wartość;
- `x`, `y` – przesunięcie wszystkich o tyle samo, ile zmienia się wartość głównego elementu (układ zostaje);
- elementy z kluczami właściwości dostają klucz w bieżącym czasie (jak przy jednym); przycisk ◆, pola kontrolne i zakładki Ruch / Dane – tylko dla jednego elementu (komunikat „zaznacz jeden element”).

Gotowe gdy: ramka zaznacza 3 z 4 prostokątów, zmiana koloru w panelu zmienia trzy jednym Ctrl+Z; scena przesuwa się nowym gestem.

### K2. Uchwyty: rogi, boki, obrót, proporcje

- **8 uchwytów** (rogi i środki boków) na ramce zaznaczenia (obróconej razem z elementem, jak 26.11.4); przeciągnięcie zmienia `w/h` i `x/y` tak, by **przeciwległa krawędź stała** – z uwzględnieniem punktu zaczepienia i obrotu;
- **Shift** – proporcje, **Alt** – od środka, **Ctrl** – bez przyciągania; przyciąganie krawędzi do celów jak przy przesuwaniu (`snapTargets`);
- **uchwyt obrotu** (kółko nad górną krawędzią): obrót wokół punktu zaczepienia, Shift – co 15°; podpowiedź z kątem;
- **kilka zaznaczonych:** ramka wspólna, skalowanie proporcjonalne położeń i rozmiarów (tekst – rozmiar ramki, nie czcionki; decyzja §6 pkt 3);
- typy bez sensownego rozmiaru (zegar, ticker o stałej wysokości) – tylko uchwyty, które działają; kursory `nwse-resize` itd. obrócone z elementem.

Gotowe gdy: zmiana rozmiaru od lewego górnego rogu nie przesuwa prawego dolnego (także w obróconej grupie), Shift trzyma proporcje, obrót co 15°.

### K3. Wyrównaj i rozmieść zaznaczone

Pasek nad kanwą albo grupa w panelu (decyzja §6 pkt 4), aktywny przy ≥ 2 elementach (wyrównanie do kadru – też przy 1):
- **wyrównaj** lewe / środki / prawe, góry / środki / doły – względem **obrysu zaznaczenia**, **kluczowego elementu** (ostatnio kliknięty, wyróżniona ramka) albo **kadru / obszaru bezpiecznego EBU R 95**;
- **rozmieść** równo w poziomie / pionie (≥ 3) – równe odstępy między obrysami; **odstęp** w px (pole) – układa w rzędzie / kolumnie z zadanym odstępem;
- **dopasuj szerokość / wysokość** do kluczowego elementu.
Wspólny kod z „Położeniem względem innej sceny” (26.11.4: `relApply`, obrysy `drawnBox`) – ta sama ścieżka przesunięcia z kluczami.

Gotowe gdy: trzy napisy różnej szerokości rozmieszczone co 24 px jednym przyciskiem, jedno Ctrl+Z.

### K4. Menu kontekstowe kanwy

Prawy klik na elemencie (zaznacza go, jeśli nie był) albo na pustym miejscu:
- element: wytnij / kopiuj / wklej / duplikuj, grupuj / rozgrupuj, wyrównaj (podmenu z K3), **kolejność** (na wierzch, wyżej, niżej, na spód),
  zablokuj, ukryj, zaznacz grupę nadrzędną, **zaznacz pod kursorem** (lista elementów nakładających się w tym miejscu – wybór zasłoniętego), pokaż w drzewie;
- puste miejsce: wklej, zaznacz wszystko, prowadnice / tło / sceny odniesienia, dopasuj widok;
- skróty przy pozycjach (te same co dziś w drzewie); okno natywne – menu strony (styl `vizrs-ui.css`), nie systemowe (most bez zmian).
Wymaga sprawdzenia kopiuj / wklej elementów między scenami (dziś w drzewie? – P0 etapu).

### K5. Edycja tekstu na kanwie

- dwuklik w **zaznaczony** tekst (albo Enter) – edycja w miejscu: nakładka `contenteditable` / `textarea` w położeniu i stylu napisu (czcionka, rozmiar, wyrównanie, obrót przodków), renderer chowa napis na czas edycji;
- Enter + Ctrl / klik poza – zatwierdza (jeden krok cofania), Esc – anuluje; tekst sformatowany (`richtext.js`) – zachowanie znaczników, a gdy nie da się ich bezpiecznie edytować w miejscu – podpowiedź „edytuj w panelu”;
- pola danych (`fields`, wartości strony) – edycja wartości domyślnej, z oznaczeniem pola;
- dwuklik w niezaznaczony element – jak dziś (grupa nadrzędna), żeby nie zmieniać nawyku.
Najtrudniejszy etap (pomiar tekstu w WebKitGTK / WebView2 / WKWebView, IME, pisownia) – po K1–K4; P0: spike na `text` bez formatowania.

## 4. Testy

Każdy etap: bramka z `CLAUDE.md` i nowe kroki w `tests/e2e/okno.js` (zdarzenia myszy jak w kroku 1b / 1c):
- K1: ramka zaznacza właściwe elementy (także w otwartej grupie, bez zablokowanych); zmiana koloru wielu – jeden krok cofania; scena przesuwa się nowym gestem;
- K2: lewy górny uchwyt – prawy dolny róg stoi (element obrócony i w obróconej grupie); Shift – proporcje; obrót co 15°;
- K3: rozmieszczenie co N px, wyrównanie do kadru, obrysy bez pustych pojemników;
- K4: kolejność „na wierzch”, „zaznacz pod kursorem” wybiera zasłonięty element;
- K5: edycja w miejscu zapisuje tekst, Esc nie zmienia sceny.
Zrzut kanwy przed / po (PNG poza repo) przy K2 i K5.

## 5. Kolejność i szacunek

| Etap | Zakres | Szacunek | Wydanie |
|---|---|---|---|
| K1 | ramka + panel wielu zaznaczonych (P8) | 1,5–2 dni | 26.11.x |
| K2 | 8 uchwytów, obrót, Shift / Alt, wiele zaznaczonych | 1,5 dnia | 26.11.x |
| K3 | wyrównaj / rozmieść / dopasuj | 0,5–1 dnia | razem z K2 albo osobno |
| K4 | menu kontekstowe | 0,5–1 dnia | 26.11.x |
| K5 | tekst na kanwie | 2–3 dni (z P0) | osobno |

Etapy są niezależne, każdy użyteczny sam w sobie; K3 i K4 korzystają z zaznaczenia ramką (K1), K4 – z podmenu K3.

## 6. Do decyzji użytkownika

1. **Gest przesuwania całej sceny**, gdy puste miejsce zaczyna ramkę: przytrzymany **S** + przeciągnięcie (proponowane), środkowy przycisk (dziś przesuwa widok), czy przełącznik trybu?
2. Ramka zaznacza elementy **przecinane** (proponowane, jak Figma) czy tylko **całe w środku** (jak Viz)? Drugi tryb pod Alt.
3. Skalowanie kilku elementów z tekstem: zmieniać **rozmiar ramki** (proponowane) czy też **rozmiar czcionki**?
4. Wyrównaj / rozmieść: **pasek nad kanwą** pokazywany przy wielu zaznaczonych (proponowane) czy grupa w panelu Właściwości?
5. Czy K5 (tekst na kanwie) w ogóle, czy wystarczy szybki skok do pola tekstu w panelu (Enter na zaznaczonym tekście)?

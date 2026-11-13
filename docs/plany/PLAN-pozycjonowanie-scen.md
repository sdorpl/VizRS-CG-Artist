# PLAN: pozycjonowanie scen względem siebie (ticker względem belki)

> Stan: **propozycja** (2026-11-13). Zakres: VizRS CG Artist (`web/artist.html`); jedna część (P5) wymaga zmiany formatu w VizRS CG System.

## 1. Problem

Grafika anteny to kilka **osobnych scen na różnych warstwach**, grających jednocześnie: belka (`main`), ticker (`back` / `z5_ticker`),
logo, zegar, „Na żywo” (`front`). Artist pokazuje na kanwie **tylko jedną scenę**. Żeby ustawić ticker tuż pod belką, grafik dziś:

1. odczytuje z belki liczby (y, wysokość, punkt zaczepienia, `scene.y`) i przelicza je w głowie,
2. przełącza scenę, wpisuje położenie tickera, zapisuje,
3. sprawdza w Trio / na wyjściu, czy się nie nachodzą – i wraca do punktu 1.

Tak samo z **powiązaniami (dock)**: `dx`/`dy` wpisuje się „na ślepo”, a efekt widać dopiero na antenie, gdy obie grafiki są na wizji.
Do tego obraz referencyjny tła (▦) jest statycznym plikiem – nie nadąża za zmianami belki.

## 2. Cel

Grafik widzi na kanwie **inne sceny show jako odniesienie** (tak, jak złożą się na wyjściu), **przyciąga** elementy i całą scenę do ich krawędzi,
**mierzy odstępy**, jednym klikiem **dosuwa** scenę do innej i **ustawia dock z podglądu**, zamiast liczyć.

Miara sukcesu: ustawienie tickera 8 px pod belką i reguły „belka unosi się, gdy ticker na antenie” bez przełączania scen i bez Trio – w mniej niż minutę.

## 3. Zasady (z `CLAUDE.md`, obowiązują w każdym etapie)

- **Bez zmiany formatu `show.json` w P1–P4.** Wybór scen odniesienia to ustawienie podglądu (jak prowadnice i tło – `localStorage` okna),
  nie właściwość sceny: walidator serwera odrzuca nieznane pola, a sceny odniesienia nie mają znaczenia na antenie.
- **`renderer.js` jest kopią z CG System – nie edytujemy go tutaj.** Sceny odniesienia rysują osobne instancje `ScenePlayer`
  (`editor: false` → `pointer-events: none`, `seek(t)`, `destroy()`, uśpienie przy stojącym obrazie). Gdyby zabrakło API
  (np. prostokąty węzłów bez DOM), zmiana najpierw w CG System, potem `tools/sync-cg.sh`.
- **Okno (Rust) bez zmian** – cała funkcja jest w stronie; most, magazyn i uprawnienia nietknięte. Jedyny wyjątek – P5 (walidacja w CG System i magazynie lokalnym, LUKI #7).
- **Kanwa ma rysować jak antena** – sceny odniesienia układamy w kolejności warstw wyjścia (`back` < `main` < inne < `z<N>_…` < `front`) z ich `scene.x/y`.
- Dokumentacja razem z kodem: `docs/DOKUMENTACJA.md` (sekcja kanwy / skróty strony), `CHANGELOG.md` („Niewydane”), `docs/STATUS.md`.

## 4. Etapy

### P0. Rozpoznanie (krótki spike, bez commita funkcji)

- Sprawdzić w `web/artist.html`, czy druga i trzecia instancja `ScenePlayer` w `#box` nie koliduje z bieżącą (globalne style, `fontEpoch`, ticker, zegar, wideo).
- Zmierzyć koszt: 3 sceny odniesienia z tickerem `crawl` i zegarem – CPU przy uśpieniu (`seek` do stop pointu, bez `tick`).
- Ustalić czas, w którym pokazujemy odniesienie: **pierwszy stop point** (stan „na antenie”), a bez stopu – koniec sceny.
- Wartości pól: domyślne z `fieldMeta`, a gdy w show jest strona tej sceny (praca na serwerze) – opcjonalnie jej `values` (tylko odczyt).

### P1. Sceny odniesienia na kanwie („nakładka”)

**Interfejs:** nowy przycisk w `#vTools` – **⧉ Odniesienie** (popover jak ⌗ i ▦):

- lista scen show (nazwa · warstwa) z polami wyboru; bieżąca scena wyszarzona,
- **krycie** odniesienia (domyślnie 50%) i tryb **pod / nad / wg warstw** (domyślnie wg warstw – jak na wyjściu),
- **czas** odniesienia: „stop point” (domyślnie) albo „jak głowica” (do sprawdzania kolizji w animacji wejścia),
- skrót **Shift+R** – pokaż / ukryj wszystkie odniesienia.

**Działanie:**

- Kontener `#refs` (pod `#stage`) i `#refsTop` (nad, `pointer-events: none`) z instancjami `ScenePlayer(…, { editor: false })`, pozycjonowanymi tak jak `#stage` (`placeGuides`).
- Wybór zapamiętany **per scena** w `localStorage` (`vizrs.refs` → `{ [sceneId]: [refId…] }`), żeby ticker zawsze otwierał się z belką.
- Zmiana innej sceny (zdarzenie `show`/`scenes` z `/events`, zapis w drugim oknie) odświeża odniesienie; usunięta scena znika z wyboru.
- Inna rozdzielczość sceny odniesienia niż bieżącej – rysujemy w px kadru (bez skalowania) i ostrzegamy w popoverze.
- Kliknięcie w odniesienie nic nie zaznacza (zaznaczanie zostaje w bieżącej scenie); **dwuklik** w odniesienie = przejdź do tej sceny (z pytaniem o niezapisane zmiany).
- W drzewie sceny pod wierszem sceny cienki wiersz „⧉ odniesienie: Belka, Logo”, klik = popover.

**Gotowe gdy:** ticker otwarty w Artist pokazuje półprzezroczystą belkę i logo w miejscu, w którym będą na wyjściu; brak spadku płynności przy przeciąganiu.

### P2. Przyciąganie i pomiar względem odniesień

- `snapTargets()` dostaje krawędzie i środki **węzłów scen odniesienia** (`sceneRect` działa, bo wszystkie są w tym samym układzie px kadru).
  Linia przyciągania do odniesienia w innym kolorze niż do własnych elementów, z etykietą nazwy sceny i elementu („Belka › bar_info · dół”).
- Przyciąganie działa przy przeciąganiu **elementu** i przy przeciąganiu **całej sceny** (puste miejsce kanwy → `scene.x/y`) – dziś scena przy przeciąganiu się nie przyciąga; tu to dokładamy.
- Opcja w ⌗: „Przyciągaj do odniesień” (domyślnie włączona); Ctrl w trakcie – bez przyciągania, jak dziś.
- **Pomiar odstępu:** przy zaznaczonym elemencie i wciśniętym **Alt** – odległości w px do najbliższych krawędzi odniesienia (góra, dół, lewo, prawo), jako znaczniki w `#guides`.
  Przy przeciąganiu – stała etykieta odstępu do najbliższego elementu odniesienia na tej osi.
- **Kolizja:** gdy prostokąt elementu bieżącej sceny nachodzi na element odniesienia z warstwy, która gra jednocześnie – czerwony kontur obu (jak `data-over`) i podpowiedź w pasku stanu. Tylko ostrzeżenie, nic nie blokuje.

### P3. Dosuwanie i wyrównywanie do innej sceny

Grupa **„Względem odniesienia”** w ustawieniach sceny (dla całej sceny) i w Transform (dla elementu):

- wybór **celu**: scena odniesienia + opcjonalnie jej element (lista węzłów, domyślnie zasięg całej sceny),
- przyciski **dosuń**: ⤒ nad celem, ⤓ pod celem, ⇤ z lewej, ⇥ z prawej – z polem **odstęp** (px, domyślnie 0),
- przyciski **wyrównaj**: lewe / środki / prawe krawędzie, górne / środki / dolne krawędzie,
- **dopasuj szerokość** do celu (np. ticker na całą szerokość belki) – tylko dla elementu, z zachowaniem punktu zaczepienia.

Działanie:
- dla **całej sceny** zmienia `scene.x/y` przez `setSceneOffset` (bez ruszania kluczy i `props` – animacje grają względem nowego położenia),
- dla **elementu** zmienia `x/y` (i `w`) z uwzględnieniem punktu zaczepienia, rodzica (obrót / skala grupy) i kluczy `x/y` –
  ta sama ścieżka co przy zmianie rodzica bez przesunięcia (CHANGELOG 26.11.1, „Poprawki położenia”); element animowany – przesunięcie wszystkich kluczy osi o tę samą wartość,
- jedna operacja = jeden krok cofania (`checkpoint()`).

### P4. Dock z podglądu

Dziś: tabela „Powiązania (dock)” z ręcznymi `Δx`, `Δy`. Dokładamy:

- przy wierszu dock przycisk **👁 Podgląd** – pokazuje odniesienie wskazane w `target` (`scene:<nazwa>`, `layer:<warstwa>` → sceny tej warstwy, `page:<numer>` → scena strony, gdy dostępna) i przesuwa bieżącą scenę o `dx/dy` z animacją `dur` (▶ powtórz),
- przycisk **✋ Ustaw z kanwy** – tryb, w którym przeciągnięcie sceny (z przyciąganiem z P2) **nie zmienia `scene.x/y`**, tylko `dx/dy` reguły; Enter zatwierdza, Esc anuluje.
  Przykład: belka, odniesienie ticker, „Ustaw z kanwy”, przeciągnięcie belki w górę aż przyciągnie się 8 px nad tickerem → `dy = -98`,
- **＋ Dock z odniesienia** – nowa reguła z celem wypełnionym bieżącą sceną odniesienia (`scene:<nazwa>`, z menu do zmiany na `layer:<warstwa>`),
- w P3 przycisk dosuwania ma wariant „jako dock” – zamiast zmieniać `scene.x/y`, tworzy regułę z wyliczonym `dx/dy`.

Format bez zmian (`dock[{target, dx, dy, dur}]`), więc działa od razu na antenie, w Trio i w rendererze natywnym.

### P5. Dock względem krawędzi celu (zmiana formatu – najpierw CG System)

To już jest w planach CG System: LUKI #7 („dock tylko przesuwa”) i `PLAN-jeden-ruch.md` J6 – `dock[]` z opcjonalnymi `edge` (`top|bottom|left|right`), `gap`
(i ewentualnie `node` – element celu). Przesunięcie liczone z **rzeczywistego** prostokąta celu na antenie, więc ticker o zmiennej wysokości albo belka dwuwierszowa nie rozjeżdżają się.

Kolejność: `validate.rs` + renderer + renderer natywny w CG System → `tools/sync-cg.sh` w Artist → walidacja w magazynie lokalnym (`src/store.rs`, test w `local::tests`) →
UI w Artist: w tabeli dock kolumny „krawędź” i „odstęp”, a „✋ Ustaw z kanwy” zapisuje `edge/gap` zamiast `dx/dy`, gdy przyciągnięto do krawędzi celu.
Do czasu P5 Artist zapisuje tylko `dx/dy` (P4).

### P6. Opcjonalnie później

- **Zestawy odniesień** („INFO24: belka + ticker + logo + zegar”) – nazwane, wybierane jednym klikiem; najpierw w `localStorage`, ewentualnie później w show (zmiana formatu w CG System).
- **Podgląd całej anteny** – tryb „solo bieżąca / wszystkie sceny warstw” z przełączaniem, która warstwa jest „na antenie”, żeby sprawdzić kombinacje docków.
- Raport kolizji całego show (które pary scen z różnych warstw nachodzą się w stop poincie).

## 5. Testy i bramka

Każdy etap: bramka z `CLAUDE.md` (`tools/sync-cg.sh --check`, `cargo fmt --check`, `cargo clippy …`, `cargo test`, `cargo build --release`) oraz:

- `tests/e2e/okno.js` – nowe kroki przez `--probe` na katalogu testowym z dwiema scenami (belka `main`, ticker `back`):
  - P1: wybór odniesienia → w `#refs` jest `ScenePlayer` z węzłami belki w położeniu z jej `scene.y`; wybór przeżywa przeładowanie strony,
  - P2: symulowane przeciągnięcie tickera w pobliże dolnej krawędzi belki → `y` przyciągnięte dokładnie do krawędzi,
  - P3: „⤓ pod celem, odstęp 8” → `scene.y` tickera = dół belki + 8; jedno Ctrl+Z przywraca,
  - P4: „Ustaw z kanwy” → `dock[0].dy` zgodne z przeciągnięciem, `scene.y` belki bez zmian,
- zrzut ekranu kanwy z odniesieniem (PNG poza repo) – sprawdzenie, że kolejność warstw i krycie są jak na wyjściu,
- P5 dodatkowo: test walidacji w `local::tests` (poprawne i złe `edge`/`gap`) i `node tools/native-compare.js` w CG System bez nowych różnic.

## 6. Kolejność i szacunek

| Etap | Zakres | Pliki | Format | Szacunek |
|---|---|---|---|---|
| P0 | rozpoznanie wielu `ScenePlayer`, koszt, czas odniesienia | – | nie | 0,5 dnia |
| P1 | sceny odniesienia na kanwie | `web/artist.html`, DOKUMENTACJA, CHANGELOG, `tests/e2e/okno.js` | nie | 1–1,5 dnia |
| P2 | przyciąganie (też całej sceny), pomiar, kolizje | jw. | nie | 1 dzień |
| P3 | dosuń / wyrównaj / dopasuj szerokość | jw. | nie | 1 dzień |
| P4 | dock z podglądu i z kanwy | jw. | nie | 1 dzień |
| P5 | dock względem krawędzi | CG System (`validate.rs`, renderery) → sync → `src/store.rs`, `artist.html` | **tak** | 2–3 dni (głównie CG System) |
| P6 | zestawy, podgląd anteny, raport kolizji | `web/artist.html` | nie / opcjonalnie | później |

P1–P4 to osobne wydania (`26.11.x`) – każde samo w sobie użyteczne. P5 dopiero po decyzji użytkownika o zmianie formatu w CG System.

## 7. Do decyzji użytkownika

1. Czy wybór scen odniesienia ma być **per scena** (proponowane) czy jeden globalny dla okna?
2. Domyślny czas odniesienia: **stop point** (proponowane) czy bieżąca głowica?
3. Czy wchodzimy w **P5** (zmiana formatu dock w CG System), czy na razie wystarczy P4 z `dx/dy`?
4. Czy zestawy odniesień (P6) mają kiedyś trafić do `show.json` (wspólne dla stanowisk), czy zostają lokalnym ustawieniem okna?

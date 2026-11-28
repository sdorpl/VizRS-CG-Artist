# STATUS – stan prac

> Aktualizuj w tym samym commicie, który zmienia stan.
>
> **Ostatnia aktualizacja:** 2026-11-28

## Bieżący etap
**Wydanie 26.11.12** (2026-11-24): logowanie kontem panelu VizRS CG Playout w oknie „Połącz z serwerem”, walidacja `vizrs-model` (VizRS CG System v26.11.12) w magazynie lokalnym. Po wydaniu w `main`: wydanie z bramką CI (`release.yml` → `ci.yml`), zasady pakietu z CG System 60f0fa1 (najpierw graf wiedzy) – bez nowego wydania.

Artist to osobny edytor grafik i animacji pakietu VizRS, bez Trio, okno na Tauri 2 (Linux, Windows, macOS) od 0.3.0 (2026-11-07). Plan źródłowy: `../VizRS CG System/docs/plany/PLAN-artist-osobny.md`. Od 26.11.x prace idą wg planów strony Artist (lista w [docs/README.md](README.md)), numeracja wydań rok.miesiąc.rewizja; wersje sąsiadów – `ZGODNOSC.md` w [sdorpl/VizRS](https://github.com/sdorpl/VizRS/blob/main/ZGODNOSC.md).

| Etap | Zakres | Stan |
|---|---|---|
| S0 | Okno 0.1.0: menu, serwer, okno połączenia, pliki, kopia robocza, jedna instancja, CI, `.deb`, test w działaniu | zrobione |
| S1 | Okno bez Trio i wyjścia (menu, dokumentacja) | zrobione |
| S2 | Własna strona Artist w repo (`web/`); moduły rysowania pilnowane jako kopie z CG System (`tools/sync-cg.sh --check`, CI) | zrobione (kopia z v2.0.19); serwowanie z binarki – S3 |
| S3 | Lokalny magazyn w procesie okna (show, zasoby, fonty, presety) – Artist działa bez `vizrs` | zrobione (`local`, `store`, `http`, `web`; test w działaniu 16/16) |
| S4 | Serwer zdalny jako cel wysyłki scen (deploy, `rev`/409), nie miejsce edycji | zrobione (`client`, `deploy`, okno „Wyślij na serwer”; test w działaniu 22/22) |
| S5 | Walidacja show przez `vizrs-model` (A1 w CG System) | zrobione – wydanie 26.11.12 (zapis sceny i import show; `vizrs-model` z CG System v26.11.12) |
| S6 | Import `.cgpack` w Ruście (plan A5) | wstrzymane – decyzja użytkownika: ZIP/deflate w Ruście to nowa zależność albo własny kod; `cgpack.js` współdzielony z Trio |
| S7 | Repo na GitHubie, CI z testem w działaniu, wydania (`release.yml`) | zrobione (czeka na pierwszy przebieg CI) |
| S8 | AppImage; w CG System usunięcie Artist z `vizrs-shell` i pakietu `vizrs` (A7) | zrobione: AppImage (bundler Tauri); A7 w CG System 2026-11-07 – `vizrs-shell` tylko Trio/wyjście, `/artist` zamrożony |
| S9 | Windows i macOS – okno na Tauri 2 zamiast GTK ([plany/RAPORT-tauri.md](plany/RAPORT-tauri.md)) | zrobione – wydanie 0.3.0 (CI zielone na Linux, Windows, macOS; AppImage sprawdzony testem dymnym) |
| S11 | Wygląd i zachowanie programu systemu zamiast strony WWW (systemowe okna dialogowe, motyw, menu wg konwencji, czcionka, bez funkcji przeglądarki) – DOKUMENTACJA §14 | zrobione – wydanie 0.3.1 (CI zielone na Linux, Windows, macOS; zrzuty pod Xvfb); wygląd na Windows i macOS do sprawdzenia ręcznie |
| S10 | Android (opcja, tablet) – PLAN-platformy P6 | zaplanowane na później |
| S20 | Logowanie kontem panelu VizRS CG Playout w oknie połączenia (K21 pakietu) | zrobione – wydanie 26.11.12 |
| S21 | Wydanie z bramką CI (`release.yml` → `ci.yml`, paczki z joba `build`) | zrobione w `main` (2026-11-25), bez wydania |
| S12 | Wygląd VizRS Live (wspólny rdzeń `vizrs-ui.css`) | zrobione – wydanie 26.11.3 |
| S13 | Położenie scen względem siebie (plan `plany/PLAN-pozycjonowanie-scen.md`, P1–P4) | zrobione – 26.11.4 (P1–P3), 26.11.5 (P4) |
| S14 | Edycja na kanwie (plan `plany/PLAN-edycja-na-kanwie.md`, K1–K5) | zrobione – wydanie 26.11.5 |
| S15 | Akceleracja WebKitGTK na Linuksie z NVIDIA (`src/gpu.rs`, `VIZRS_GPU`) | zrobione – wydanie 26.11.5 |
| S19 | Powiązania (dock) – edytor reguł (cele z listy, krzywa, ostrzeżenie o sumowaniu) i reguła krawędzi (zachowanie, odstęp, powrót, podgląd z danymi strony celu); plan `../VizRS CG System/docs/plany/PLAN-ruch-belek.md` A2, B1–B4 | zrobione – wydanie 26.11.10 |
| S18 | Paczki `.cgpack`: plan importu (okno `pack-ui.js`, decyzja przy scenie w innej wersji / o zajętej nazwie), tożsamość sceny po `id`, stany wysyłki jak w planie, wspólne wektory reguł plików (`../VizRS CG System/docs/plany/PLAN-przenoszenie.md`) | zrobione – wydanie 26.11.9 |
| S17 | Niezawodność okna na Linuksie z NVIDIA (Skia na CPU, przeładowanie po awarii strony), przełączenie serwera nawigacją okna, zamykanie pośrednika | zrobione – wydanie 26.11.8 |
| S16 | Jedna oś czasu (plan `../VizRS CG System/docs/plany/PLAN-jeden-ruch.md`, J1–J4 + maska warstwy J5) i rozmiar okna przy skalowaniu ułamkowym (`src/screen.rs`) | zrobione – wydania 26.11.6–26.11.7 |

## Następne zadanie
Plany strony Artist (P1–P4 pozycjonowania, K1–K5 edycji na kanwie, J1–J5 jednej osi czasu, ruch belek A2/B1–B4) – zrobione. Otwarte:
- **S6 / A5** – import `.cgpack` w Ruście: czeka na decyzję (zależność ZIP/deflate albo własny kod).
- **Paczki Windows i macOS** – sprawdzić ręcznie na czystym systemie, także wygląd natywny (S11: ciemny pasek tytułu, TaskDialog/NSAlert, menu macOS, paski Fluent); podpis – LUKI #13.
- **Luki G2/G3** – [LUKI.md](LUKI.md): przywracanie kopii w oknie (#8), wysyłka zmienionego zasobu o tej samej nazwie (#11), „zapisz serwer bez łączenia” (#12).
- **Do decyzji:** `/artist` w serwerze ze strony z wydań Artist zamiast zamrożonej (PLAN-artist-osobny §7 pkt 2); usunięcie `/artist` z serwera – T3, wydanie 3.0 CG System.

## Blokery
`git push` i wydania – tylko na prośbę użytkownika (repozytorium publiczne). Repozytorium: https://github.com/sdorpl/VizRS-CG-Artist (`origin`).

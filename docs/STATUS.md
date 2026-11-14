# STATUS – stan prac

> Aktualizuj w tym samym commicie, który zmienia stan.
>
> **Ostatnia aktualizacja:** 2026-11-14

## Bieżący etap
**0.3 – okno na Tauri 2 (Linux, Windows, macOS)** (decyzja 2026-11-07): Artist to osobny edytor grafik i animacji pakietu VizRS, bez Trio.
Plan źródłowy: `../VizRS CG System/docs/plany/PLAN-artist-osobny.md` (A2–A6).
Od 26.11.x prace idą wg planów strony Artist (lista w [docs/README.md](README.md)), a numeracja wydań to rok.miesiąc.rewizja.

| Etap | Zakres | Stan |
|---|---|---|
| S0 | Okno 0.1.0: menu, serwer, okno połączenia, pliki, kopia robocza, jedna instancja, CI, `.deb`, test w działaniu | zrobione |
| S1 | Okno bez Trio i wyjścia (menu, dokumentacja) | zrobione |
| S2 | Własna strona Artist w repo (`web/`); moduły rysowania pilnowane jako kopie z CG System (`tools/sync-cg.sh --check`, CI) | zrobione (kopia z v2.0.19); serwowanie z binarki – S3 |
| S3 | Lokalny magazyn w procesie okna (show, zasoby, fonty, presety) – Artist działa bez `vizrs` | zrobione (`local`, `store`, `http`, `web`; test w działaniu 16/16) |
| S4 | Serwer zdalny jako cel wysyłki scen (deploy, `rev`/409), nie miejsce edycji | zrobione (`client`, `deploy`, okno „Wyślij na serwer”; test w działaniu 22/22) |
| S5 | Walidacja show przez `vizrs-model` (najpierw A1 w CG System) | czeka na A1 |
| S6 | Import `.cgpack` w Ruście | do zrobienia |
| S7 | Repo na GitHubie, CI z testem w działaniu, wydania (`release.yml`) | zrobione (czeka na pierwszy przebieg CI) |
| S8 | AppImage; w CG System usunięcie Artist z `vizrs-shell` i pakietu `vizrs` (A7) | zrobione: AppImage (bundler Tauri); A7 w CG System 2026-11-07 – `vizrs-shell` tylko Trio/wyjście, `/artist` zamrożony |
| S9 | Windows i macOS – okno na Tauri 2 zamiast GTK ([plany/RAPORT-tauri.md](plany/RAPORT-tauri.md)) | zrobione – wydanie 0.3.0 (CI zielone na Linux, Windows, macOS; AppImage sprawdzony testem dymnym) |
| S11 | Wygląd i zachowanie programu systemu zamiast strony WWW (systemowe okna dialogowe, motyw, menu wg konwencji, czcionka, bez funkcji przeglądarki) – DOKUMENTACJA §14 | zrobione – wydanie 0.3.1 (CI zielone na Linux, Windows, macOS; zrzuty pod Xvfb); wygląd na Windows i macOS do sprawdzenia ręcznie |
| S10 | Android (opcja, tablet) – PLAN-platformy P6 | zaplanowane na później |
| S12 | Wygląd VizRS Live (wspólny rdzeń `vizrs-ui.css`) | zrobione – wydanie 26.11.3 |
| S13 | Położenie scen względem siebie (plan `plany/PLAN-pozycjonowanie-scen.md`, P1–P4) | zrobione – 26.11.4 (P1–P3), 26.11.5 (P4) |
| S14 | Edycja na kanwie (plan `plany/PLAN-edycja-na-kanwie.md`, K1–K5) | zrobione – wydanie 26.11.5 |
| S15 | Akceleracja WebKitGTK na Linuksie z NVIDIA (`src/gpu.rs`, `VIZRS_GPU`) | zrobione – wydanie 26.11.5 |
| S16 | Jedna oś czasu (plan `../VizRS CG System/docs/plany/PLAN-jeden-ruch.md`, J1–J4 + maska warstwy J5) i rozmiar okna przy skalowaniu ułamkowym (`src/screen.rs`) | zrobione – „Niewydane” w CHANGELOG |

## Następne zadanie
Plany strony Artist: [plany/PLAN-pozycjonowanie-scen.md](plany/PLAN-pozycjonowanie-scen.md) P1–P4 i [plany/PLAN-edycja-na-kanwie.md](plany/PLAN-edycja-na-kanwie.md) K1–K5 – zrobione (wydanie 26.11.5); jedna oś czasu (J1–J4) i maska warstwy (J5) – „Niewydane” w CHANGELOG. Dalej P5 / ruch belek – `../VizRS CG System/docs/plany/PLAN-ruch-belek.md` (czeka na decyzje z §7).
Paczki Windows/macOS sprawdzić ręcznie na czystym systemie – także wygląd natywny (S11: ciemny pasek tytułu, TaskDialog/NSAlert z własnymi przyciskami, menu macOS, paski Fluent).
Do decyzji: `/artist` w serwerze ze strony z wydań Artist zamiast zamrożonej (PLAN-artist-osobny §7 pkt 2).

## Blokery
`git push` i wydania – tylko na prośbę użytkownika (repozytorium publiczne). Repozytorium: https://github.com/sdorpl/VizRS-CG-Artist (`origin`).

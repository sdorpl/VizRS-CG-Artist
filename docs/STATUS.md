# STATUS – stan prac

> Aktualizuj w tym samym commicie, który zmienia stan.
>
> **Ostatnia aktualizacja:** 2026-11-09

## Bieżący etap
**0.3 – okno na Tauri 2 (Linux, Windows, macOS)** (decyzja 2026-11-07): Artist to osobny edytor grafik i animacji pakietu VizRS, bez Trio.
Plan źródłowy: `../VizRS CG System/docs/plany/PLAN-artist-osobny.md` (A2–A6).

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

## Następne zadanie
Paczki Windows/macOS sprawdzić ręcznie na czystym systemie – także wygląd natywny (S11: ciemny pasek tytułu, TaskDialog/NSAlert z własnymi przyciskami, menu macOS, paski Fluent).
Do decyzji: `/artist` w serwerze ze strony z wydań Artist zamiast zamrożonej (PLAN-artist-osobny §7 pkt 2).

## Blokery
`git push` i wydania – tylko na prośbę użytkownika (repozytorium publiczne). Repozytorium: https://github.com/sdorpl/VizRS-CG-Artist (`origin`).

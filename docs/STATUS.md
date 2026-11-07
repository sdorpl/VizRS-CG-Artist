# STATUS – stan prac

> Aktualizuj w tym samym commicie, który zmienia stan.
>
> **Ostatnia aktualizacja:** 2026-11-07

## Bieżący etap
**0.2 – samodzielny edytor** (decyzja 2026-11-07): Artist to osobny edytor grafik i animacji pakietu VizRS, bez Trio.
Plan źródłowy: `../VizRS CG System/docs/plany/PLAN-artist-osobny.md` (A2–A6).

| Etap | Zakres | Stan |
|---|---|---|
| S0 | Okno 0.1.0: menu, serwer, okno połączenia, pliki, kopia robocza, jedna instancja, CI, `.deb`, test w działaniu | zrobione |
| S1 | Okno bez Trio i wyjścia (menu, dokumentacja) | zrobione |
| S2 | Własna strona Artist w repo (`web/`, wkompilowana); moduły rysowania pilnowane jako kopie z CG System | do zrobienia |
| S3 | Lokalny magazyn w procesie okna (show, zasoby, fonty, presety) – Artist działa bez `vizrs` | do zrobienia |
| S4 | Serwer zdalny jako cel wysyłki scen (deploy, `rev`/409), nie miejsce edycji | do zrobienia |
| S5 | Walidacja show przez `vizrs-model` (najpierw A1 w CG System) | czeka na A1 |
| S6 | Import BTB i `.cgpack` w Ruście | do zrobienia |
| S7 | AppImage, wydania na GitHubie; w CG System usunięcie Artist z `vizrs-shell` i pakietu `vizrs` (A7) | do zrobienia |

## Następne zadanie
S2: kopia `web/` Artist z CG System, `tools/sync-cg.sh --check`, serwowanie strony z binarki.

## Blokery
Brak. Repozytorium nie ma jeszcze zdalnego (`git remote`) – CI nie było uruchomione.

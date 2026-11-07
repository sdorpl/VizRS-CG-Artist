# LUKI – znane braki (uszeregowane: niezawodność → wierność → funkcje)

Zamykając pozycję, usuń wiersz i dopisz wersję w `CHANGELOG.md`. Nowe braki dopisuj od razu, z kolejnym wolnym numerem (numery nie są używane ponownie).

## G1 – niezawodność i bezpieczeństwo
| # | Luka | Uwagi |
|---|---|---|
| 1 | Test w działaniu w CI (job `e2e`, Xvfb) jeszcze nie sprawdzony na runnerze | lokalnie brak Xvfb; po pierwszym przebiegu na GitHubie – usunąć wiersz albo poprawić job |
| 7 | Magazyn lokalny sprawdza scenę tylko podstawowo (typy, długości, rozmiar) – nie jak `validate.rs` serwera | S5: crate `vizrs-model` (A1 w CG System); serwer i tak waliduje przy wysyłce/imporcie |

## G2 – wierność
| # | Luka | Uwagi |
|---|---|---|
| 4 | Wayland nie podaje położenia okna – zapamiętany tylko rozmiar | X11: rozmiar i położenie |
| 8 | Kopie zapasowe magazynu (`kopie/`) bez przywracania w oknie | serwer ma `/api/backups`; lokalnie – ręcznie skopiować `kopie/show-<czas>.json` na `show.json` |

## G3 – funkcje
| # | Luka | Uwagi |
|---|---|---|
| 13 | Wydania Windows i macOS czekają na pierwszy przebieg CI po `git push`; Android – kiedyś | okno Tauri 2 działa na Linux, Windows, macOS; CI w `ci.yml` i `release.yml` |
| 5 | Brak paczki Flatpak | AppImage, .deb, .rpm generuje bundler Tauri |
| 11 | Wysyłka nie nadpisuje zasobu o tej samej nazwie, który na serwerze jest inny (zmienione logo) | serwer nie podaje skrótu pliku; dziś: nowa nazwa pliku albo usunięcie zasobu na serwerze |
| 12 | Zapisanie serwera do wysyłki wymaga połączenia okna z nim i powrotu do pracy lokalnej | okno połączenia: „zapisz bez łączenia” |
| 10 | Sceny zrobione wcześniej w Artist na serwerze (`~/.local/share/vizrs`) nie przechodzą same do nowego katalogu | `--data ~/.local/share/vizrs` (gdy `vizrs` tam pracuje – okno dołącza) albo paczka `.cgpack` |

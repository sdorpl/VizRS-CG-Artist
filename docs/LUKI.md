# LUKI – znane braki (uszeregowane: niezawodność → wierność → funkcje)

Zamykając pozycję, usuń wiersz i dopisz wersję w `CHANGELOG.md`. Nowe braki dopisuj od razu, z kolejnym wolnym numerem (numery nie są używane ponownie).

## G1 – niezawodność i bezpieczeństwo
| # | Luka | Uwagi |
|---|---|---|
| 14 | Magazyn lokalny (`src/local.rs`) nie wysyła nagłówka CSP – zasada pakietu „Dane z zewnątrz są obce” (2026-11-28) wymaga CSP bez skryptów inline | strona Artist i kopie modułów z CG System – razem z LUKI CG System #21; sekret okna i kontrola `Host`/`Origin` są |

## G2 – wierność
| # | Luka | Uwagi |
|---|---|---|
| 4 | Wayland nie podaje położenia okna – zapamiętany tylko rozmiar | X11: rozmiar i położenie |
| 8 | Kopie zapasowe magazynu (`kopie/`) bez przywracania w oknie | serwer ma `/api/backups`; lokalnie – ręcznie skopiować `kopie/show-<czas>.json` na `show.json` |

## G3 – funkcje
| # | Luka | Uwagi |
|---|---|---|
| 13 | Paczki Windows i macOS bez podpisu (SmartScreen, Gatekeeper) i niesprawdzone ręcznie (także wygląd natywny – DOKUMENTACJA §14); Android – kiedyś | CI: test dymny zielony na trzech systemach |
| 5 | Brak paczki Flatpak | AppImage, .deb, .rpm generuje bundler Tauri |
| 11 | Wysyłka nie nadpisuje zasobu o tej samej nazwie, który na serwerze jest inny (zmienione logo) | serwer nie podaje skrótu pliku; dziś: nowa nazwa pliku albo usunięcie zasobu na serwerze |
| 12 | Zapisanie serwera do wysyłki wymaga połączenia okna z nim i powrotu do pracy lokalnej | okno połączenia: „zapisz bez łączenia” |
| 10 | Sceny zrobione wcześniej w Artist na serwerze (`~/.local/share/vizrs`) nie przechodzą same do nowego katalogu | `--data ~/.local/share/vizrs` (gdy `vizrs` tam pracuje – okno dołącza) albo paczka `.cgpack` |

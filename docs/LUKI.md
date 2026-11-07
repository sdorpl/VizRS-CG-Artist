# LUKI – znane braki (uszeregowane: niezawodność → wierność → funkcje)

Zamykając pozycję, usuń wiersz i dopisz wersję w `CHANGELOG.md`. Nowe braki dopisuj od razu, z kolejnym wolnym numerem (numery nie są używane ponownie).

## G1 – niezawodność i bezpieczeństwo
| # | Luka | Uwagi |
|---|---|---|
| 1 | Test w działaniu (`tests/e2e/okno.js`) tylko ręcznie – nie w CI | potrzebny `vizrs` z repo VizRS CG System; w CI: zbudować go albo pobrać z wydania, `xvfb-run` |
| 2 | Sprawdzenie serwera przed przełączeniem tylko dla `http://` (bez TLS w oknie) | `https://` – błąd widać dopiero po wczytaniu strony |
| 3 | Jedna instancja tylko na Unix (gniazdo); Windows: brak | okno i tak jest tylko na Linux |

## G2 – wierność
| # | Luka | Uwagi |
|---|---|---|
| 4 | Wayland nie podaje położenia okna – zapamiętany tylko rozmiar | X11: rozmiar i położenie |

## G3 – funkcje
| # | Luka | Uwagi |
|---|---|---|
| 5 | Brak AppImage i Flatpak; brak wydań na GitHubie (`release.yml`) | `.deb` jest (`packaging/deb/build.sh`, w CI); paczki nie instalowano jeszcze na czystym systemie |

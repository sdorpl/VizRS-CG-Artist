# LUKI – znane braki (uszeregowane: niezawodność → wierność → funkcje)

Zamykając pozycję, usuń wiersz i dopisz wersję w `CHANGELOG.md`. Nowe braki dopisuj od razu, z kolejnym wolnym numerem (numery nie są używane ponownie).

## G1 – niezawodność i bezpieczeństwo
| # | Luka | Uwagi |
|---|---|---|
| 1 | Brak testów w działaniu (okno, most, zamykanie) – tylko testy jednostkowe | `--probe` pozwala na automat; wzór: `tests/e2e/shell.js` w VizRS CG System |
| 2 | Sprawdzenie serwera przed przełączeniem tylko dla `http://` (bez TLS w oknie) | `https://` – błąd widać dopiero po wczytaniu strony |
| 3 | Jedna instancja tylko na Unix (gniazdo); Windows: brak | okno i tak jest tylko na Linux |

## G2 – wierność
| # | Luka | Uwagi |
|---|---|---|
| 4 | Wayland nie podaje położenia okna – zapamiętany tylko rozmiar | X11: rozmiar i położenie |

## G3 – funkcje
| # | Luka | Uwagi |
|---|---|---|
| 5 | Brak paczek (`.deb`, AppImage, Flatpak) i CI | |
| 6 | Tylko okno Artist – Trio i wyjście otwierają się w przeglądarce systemowej | Trio / Fill+Key: `vizrs-shell` |

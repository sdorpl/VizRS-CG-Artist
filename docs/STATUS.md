# STATUS – stan prac

> Aktualizuj w tym samym commicie, który zmienia stan.
>
> **Ostatnia aktualizacja:** 2026-11-07

## Bieżący etap
**0.1.0** – okno Artist na GTK 4 + WebKitGTK 6.0 (Linux), odpowiednik okna Artist z `vizrs-shell` (tao + wry, WebKitGTK 4.1)
w repo `VizRS CG System`.

| Etap | Stan |
|---|---|
| Okno Artist, menu, akcje, powiększenie, pisownia | zrobione |
| Test w działaniu `tests/e2e/okno.js` (20 sprawdzeń) | zrobione, uruchamiany ręcznie |
| Serwer: dołączanie / uruchamianie `vizrs serve --idle-exit`, wolny port | zrobione |
| Okno „Połącz z serwerem”, `connections.json`, łączenie przy uruchomieniu | zrobione |
| „Zapisz jako”, import, przeciąganie, skojarzenia plików | zrobione |
| Pytanie przy zamykaniu, kopia robocza, jedna instancja, `window.json` | zrobione |
| Pierwszy commit | zrobione |
| CI (`.github/workflows/ci.yml`: fmt, clippy, test, build na Ubuntu 24.04) | zrobione (repo bez zdalnego – nieuruchomione na GitHubie) |
| Paczka `.deb` (`packaging/deb/build.sh`, w CI) | zrobione; do sprawdzenia instalacja na czystym Ubuntu 24.04 |
| Wydania (`release.yml`), AppImage / Flatpak | do zrobienia |
| Windows / macOS | nie planowane (GTK 4 + WebKitGTK – tylko Linux); tam `vizrs-shell` |

## Następne zadanie
Instalacja `.deb` na czystym Ubuntu 24.04 (z pakietem `vizrs`), potem wydania na GitHubie (`release.yml`) i test w działaniu w CI (LUKI #1).
Repozytorium nie ma jeszcze zdalnego (`git remote`) – CI nie było uruchomione.

## Blokery
Brak. (`libwebkitgtk-6.0-dev` jest już na maszynie deweloperskiej; `tools/webkit6-shim.sh` zostaje dla maszyn bez pakietu `-dev`.)

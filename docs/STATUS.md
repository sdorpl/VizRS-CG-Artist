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
| Serwer: dołączanie / uruchamianie `vizrs serve --idle-exit`, wolny port | zrobione |
| Okno „Połącz z serwerem”, `connections.json`, łączenie przy uruchomieniu | zrobione |
| „Zapisz jako”, import, przeciąganie, skojarzenia plików | zrobione |
| Pytanie przy zamykaniu, kopia robocza, jedna instancja, `window.json` | zrobione |
| Pierwszy commit | zrobione |
| CI, paczka (`.deb` / AppImage / Flatpak) | do zrobienia |
| Windows / macOS | nie planowane (GTK 4 + WebKitGTK – tylko Linux); tam `vizrs-shell` |

## Następne zadanie
CI (fmt, clippy, test, build na Ubuntu z `libwebkitgtk-6.0-dev`).

## Blokery
Brak. (`libwebkitgtk-6.0-dev` jest już na maszynie deweloperskiej; `tools/webkit6-shim.sh` zostaje dla maszyn bez pakietu `-dev`.)

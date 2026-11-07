# RAPORT: czy przejście na Qt ułatwi Windows, macOS i Android?

> 2026-11-07. Pytanie użytkownika: czy Qt zamiast GTK 4 dałoby łatwiej obsługę macOS, Windows i Androida.
> Kontekst: [PLAN-platformy.md](PLAN-platformy.md) (wspólny rdzeń + okno GTK na Linuksie + okno wry na Windows/macOS).

## Wniosek

**Nie – Qt nie ułatwia tej drogi, a Androida nie rozwiązuje wcale.** Qt dałoby jedno okno na trzy systemy
desktopowe, ale za cenę ~200 MB Chromium w paczce, budowy C++/CMake obok Rusta i ręcznego kleju Rust↔C++
(wiązania Rust do Qt WebEngine nie istnieją). Na Androidzie Qt WebEngine nie działa – Qt używa tam systemowego
WebView, tak samo jak wry/Tauri, tylko z uboższym mostem do strony.

Prostszą drogą do „jednego kodu okna na wszystkie platformy” jest **wry/tao (Tauri 2)**: ten sam silnik okna na
Windows, macOS i Linuksie, a Tauri 2 obsługuje też Android i iOS. To już znamy – `vizrs-shell` w CG System stoi na wry.

## 1. Co Qt może dać, a czego nie

Artist to strona HTML/JS (kanwa `renderer.js` = ta sama co antena w OBS) w natywnym oknie. Qt może więc zastąpić
tylko **okno** – przepisanie interfejsu na QML/Qt Quick oznaczałoby drugi renderer i koniec WYSIWYG z anteną
(~4,9 tys. wierszy `artist.html` + `renderer.js` + `motion.js` do napisania od nowa i utrzymywania w dwóch wersjach).
Taki wariant odpada.

Zostaje Qt jako okno z silnikiem WWW:

| Platforma | Silnik w Qt | Uwagi |
|---|---|---|
| Linux, Windows, macOS | **Qt WebEngine** (Chromium wbudowany w paczkę) | dokumentacja podaje budowę tylko dla tych trzech systemów |
| Android, iOS | **Qt WebView** – systemowy WebView (Android System WebView, WKWebView) | WebEngine niedostępny; WebView ma ograniczenia (nie nakłada się z elementami QML, zdarzenia nie przechodzą do Qt) |

## 2. Porównanie dróg

| | GTK 4 + wry (dzisiejszy plan) | wry / Tauri 2 wszędzie | Qt 6 (WebEngine + WebView) |
|---|---|---|---|
| Kod okna | 2 (GTK na Linuksie, wry na Win/mac) | **1** (Linux: WebKitGTK 4.1 / GTK 3) | 1 na desktop + osobna ścieżka na Android |
| Android | osobny projekt (JNI) | **Tauri 2: wspierany** (ten sam rdzeń, WebView systemowy) | Qt WebView = systemowy WebView, most do strony uboższy niż w wry |
| Silnik strony | WebKitGTK / WebView2 (Chromium) / WKWebView | to samo | **Chromium na wszystkich desktopach** (= OBS) |
| Rozmiar paczki | ~4 MB (+ WebView systemu) | ~4–10 MB | **+~200 MB** (sama `libQt6WebEngineCore` 6.11: 204 MB) + Qt |
| Język i budowa | Rust, cargo | Rust, cargo | Rust + C++ (CMake, qmake/moc), Qt w CI (instalator / aqtinstall) |
| Wiązania Rust | gtk4-rs, wry – dojrzałe | wry, tao – dojrzałe, nasz `vizrs-shell` | cxx-qt 0.10 (KDAB) – bez WebEngine; most i okno WWW trzeba napisać w C++ |
| Licencja | MIT / LGPL (GTK) | MIT / Apache | WebEngine: LGPLv3 / GPL albo komercyjna; Chromium do LGPL 2.1 – łączenie dynamiczne, obowiązki LGPL |
| Sklepy | – | Microsoft Store / Play – możliwe | **Mac App Store: niezgodny z WebEngine** |
| Wykorzystanie tego, co jest | okno GTK zostaje | rdzeń zostaje; okno z `vizrs-shell` | rdzeń zostaje; oba okna od nowa w C++/Qt |

## 3. Jedyna realna przewaga Qt – i lepszy sposób na nią

Qt WebEngine to **Chromium na każdym desktopie**, czyli ten sam silnik co źródło „Przeglądarka” w OBS: kanwa Artist
rysowałaby się identycznie jak antena (dziś na Linuksie WebKitGTK, na macOS WKWebView – różnice w tekście i skalowaniu
pilnuje `tools/engines.js` z CG System). Na Windows wry i tak daje Chromium (WebView2).

Jeśli identyczność z OBS na Linuksie i macOS okaże się ważniejsza niż rozmiar paczki, lepszym narzędziem niż Qt jest
**CEF** (Chromium Embedded Framework – to samo, czego używa OBS) wpięty w okno wry/tao: Chromium bez frameworka C++
i bez zmiany reszty aplikacji. To decyzja na później, po pomiarze różnic (`tools/engines.js`) w etapie P2.

## 4. Rekomendacja

1. **Nie przechodzić na Qt.**
2. Etap **P1 bez zmian** – wspólny rdzeń bez GUI jest potrzebny w każdym wariancie.
3. Okno: zamiast „GTK na Linuksie + wry na Win/mac” rozważyć **wry/Tauri 2 wszędzie** – jeden kod okna na
   Linux/Windows/macOS i gotowa ścieżka na Android. Koszt: Linux wraca z GTK 4 / WebKitGTK 6.0 na GTK 3 /
   WebKitGTK 4.1 (wry nie obsługuje jeszcze WebKitGTK 6.0) – trzeba sprawdzić skalowanie ułamkowe i pisownię,
   dla których wybrano GTK 4. Alternatywa bez tego kosztu: zostać przy planie (GTK + wry) i Tauri 2 tylko dla Androida.
4. Pomiar WYSIWYG (`tools/engines.js`) w P2 rozstrzygnie, czy kiedyś potrzebny będzie CEF.

## 5. Decyzje dla użytkownika

- Qt – **tak / nie** (rekomendacja: nie).
- Okno desktop: **GTK 4 + wry** (dzisiejszy plan) czy **wry/Tauri 2 wszędzie** (jeden kod, Linux na WebKitGTK 4.1).
- Android przez **Tauri 2** (rekomendacja) czy własna aplikacja Kotlin + JNI.

## Źródła

- Qt 6 – obsługiwane platformy: https://doc.qt.io/qt-6/supported-platforms.html
- Qt WebEngine – uwagi o platformach (budowa: Windows, Linux, macOS; Mac App Store): https://doc-snapshots.qt.io/qtwebengine/qtwebengine-platform-notes.html
- Qt WebEngine – licencje: https://doc-snapshots.qt.io/qtwebengine/qtwebengine-licensing.html
- Qt WebView (mobilne: systemowy WebView, ograniczenia): https://doc.qt.io/qt-6/qtwebview-index.html
- cxx-qt (KDAB) – wydania: https://github.com/KDAB/cxx-qt/releases
- Tauri 2 – Android i iOS, IPC przez własne protokoły: https://v2.tauri.app/blog/tauri-2-0-0-beta/
- Pomiar lokalny: `libQt6WebEngineCore.so.6.11.2` = 204 MB; `vizrs-cg-artist` 0.2 = 3,9 MB.

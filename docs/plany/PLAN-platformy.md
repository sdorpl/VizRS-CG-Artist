# PLAN: VizRS CG Artist na Windows i macOS, później Android

> Stan (2026-11-07): **zaplanowany, decyzje §7 otwarte**. Prośba użytkownika (2026-11-07): wydania Windows i macOS,
> a kiedyś także Android. Dziś Artist jest tylko na Linuksie (GTK 4 + WebKitGTK 6.0 – na Windows i macOS ich nie ma).
> Zgodnie z planem wydzielenia (`../VizRS CG System/docs/plany/PLAN-artist-osobny.md` §7 pkt 1): Linux zostaje na GTK 4,
> Windows i macOS dostają okno na **wry** (WebView2 / WKWebView) z tymi samymi modułami bez GUI i tym samym mostem.
>
> Aktualizacja 2026-11-14: Windows i macOS wydane na Tauri 2 od 0.3.0 (zamiast GTK 4 / wry – raport [RAPORT-tauri.md](RAPORT-tauri.md)); paczki z każdego wydania (`.msi`, `.exe`, `.dmg`); bez podpisu – LUKI #13. Android (P6) – nadal na później.

## 1. Cel

| Platforma | Wydanie | Silnik strony |
|---|---|---|
| Linux x86_64 | jest: archiwum, `.deb` | WebKitGTK 6.0 |
| **Windows 10/11 x86_64** (później arm64) | archiwum `.zip`, instalator | WebView2 (Chromium, w systemie) |
| **macOS 12+ arm64 i x86_64** | `.app` w `.dmg` (uniwersalna binarka) | WKWebView (WebKit systemu) |
| Android (opcja, później) | `.apk` / Google Play | Android System WebView (Chromium) |

Na każdej platformie to samo: praca lokalna bez serwera, okno „Połącz z serwerem”, wysyłka na serwer, kopia robocza,
pytanie przy zamknięciu, jedna instancja, skojarzenia `.cgpack` / `.vizrs.json`. Trio nadal nie jest dostarczane.

## 2. Punkt wyjścia (0.2)

| Moduł | Przenośny? | Co zmienić |
|---|---|---|
| `store`, `http`, `web`, `bridge`, `deploy`, `paths` | tak (`std`, `serde_json`) | – |
| `local` | prawie | `random_hex` czyta `/dev/urandom` → losowość systemu na każdej platformie |
| `server` | prawie | `pid_dead` tylko Linux (`/proc`) – na innych wystarcza `/health`, jak w serwerze |
| `connect` | tak (strona okna) | ścieżki konfiguracji Windows/macOS już są (`%APPDATA%\VizRS`, `~/Library/Application Support/VizRS`) |
| `instance` | Unix | Windows: nazwany potok (`\\.\pipe\vizrs-cg-artist-<skrót>`); macOS: gniazdo Unix działa |
| `client` | **nie** (TLS przez `gio`) | klient HTTP/TLS bez GTK – decyzja §7 pkt 2 |
| `desktop` | Linux | Windows: skojarzenia w rejestrze (HKCU) albo instalator; macOS: `Info.plist` |
| `main.rs` (okno, menu, dialogi plików, pobrania) | **nie** (GTK 4, WebKitGTK) | drugie okno na wry – §3 |

## 3. Architektura

```
crates/artist-core   (bez GUI: store, http, local, web, deploy, bridge, connect, paths, server, instance, client)
crates/artist-gtk    (Linux: dzisiejszy main.rs – GTK 4 + WebKitGTK 6.0)          → vizrs-cg-artist
crates/artist-wry    (Windows, macOS: tao + wry + muda + rfd – wzór: vizrs-shell)  → vizrs-cg-artist(.exe)
android/             (opcja: aplikacja Kotlin z WebView + artist-core przez JNI)
```

- **Jeden most:** wry daje `window.ipc.postMessage` natywnie – ten sam kształt co `IPC_SHIM`, więc `web/native.js` działa bez zmian.
  Biała lista (`bridge`), sekret magazynu, kontrola `Host`/`Origin` – wspólne w `artist-core`.
- **Okno wry** odtwarza z GTK: menu (muda; macOS – menu aplikacji), „Zapisz jako” dla pobrań (rfd), import/przeciąganie,
  pytanie przy zamknięciu, powiększenie, pełny ekran, narzędzia deweloperskie, `--probe`. Kod z `../VizRS CG System/source/shell/`
  przenosimy, nie piszemy od nowa (ten sam autor i most).
- **Strona:** bez zmian. WYSIWYG w trzech silnikach (WebKitGTK, Chromium w WebView2, WebKit w WKWebView) pilnuje
  `tools/engines.js` z CG System (porównanie zrzutów kanwy) – bramka etapu P2.

## 4. Szczegóły platform

**Windows**
- WebView2 Evergreen jest w Windows 10 (od 2021) i 11; brak – instalator dociąga bootstrapper, okno pokazuje komunikat z odnośnikiem.
- Jedna instancja: nazwany potok; dane: `%LOCALAPPDATA%\VizRS CG Artist` (już w `paths::user_data`).
- Skojarzenia `.cgpack` / `.vizrs.json`: instalator (Inno Setup albo MSI przez `cargo-wix`); wersja `.zip` – bez skojarzeń.
- Podpis Authenticode – bez niego SmartScreen ostrzega przy pierwszym uruchomieniu (decyzja §7 pkt 3).
- Pisownia polska: WebView2 ma własny słownik (język systemu / `--lang=pl`).

**macOS**
- `.app` z `Info.plist` (`CFBundleDocumentTypes` dla `.cgpack`, `.vizrs.json`; `CFBundleIdentifier` `pl.vizrs.CgArtist`), ikona `.icns`.
- Binarka uniwersalna: build `aarch64-apple-darwin` + `x86_64-apple-darwin`, `lipo`; `.dmg` (`hdiutil`).
- Otwieranie pliku z Findera przychodzi jako zdarzenie aplikacji (tao `RunEvent::Opened`), nie argument.
- Podpis Developer ID i notaryzacja (konto Apple Developer) – bez nich Gatekeeper blokuje; obejście: prawy klik → Otwórz (decyzja §7 pkt 3).
- Skróty: Cmd zamiast Ctrl w menu (strona już obsługuje `metaKey`? – sprawdzić w P2).

**Android (opcja, później)**
- WebView systemowy + `artist-core` jako biblioteka `.so` (cargo-ndk, JNI): magazyn lokalny na `127.0.0.1` w procesie aplikacji
  działa bez zmian; pliki przez Storage Access Framework; brak menu → pasek aplikacji i przyciski strony.
- Artist to narzędzie myszy i klawiatury (oś czasu, przeciąganie, skróty). Sensowny cel: **tablet z klawiaturą/rysikiem**;
  na telefonie raczej przegląd scen, poprawki tekstu i wysyłka na serwer. Wymaga trybu dotykowego strony (osobny plan).
- Tańsza alternatywa już dziś: `/artist` serwera w przeglądarce tabletu (zamrożony do 3.0 w CG System).

## 5. Etapy

| Etap | Zakres | Gotowe gdy | Wielkość |
|---|---|---|---|
| **P0** | Decyzje §7 | zależności i podpisy zatwierdzone | S |
| **P1** | Workspace: `artist-core` bez GUI (przeniesienie modułów, losowość i `pid_dead` przenośne, klient HTTP bez `gio`), `artist-gtk` = dzisiejsze okno | Linux bez zmian w zachowaniu; `cargo test` rdzenia na Windows i macOS w CI | M |
| **P2** | `artist-wry`: okno, menu, most, magazyn, okno połączenia, pobrania, import, zamykanie, `--probe`; `tests/e2e/okno.js` na Windows i macOS | test w działaniu przechodzi na trzech systemach; `tools/engines.js` – kanwa zgodna | M |
| **P3** | Integracja Windows: nazwany potok (instancja), skojarzenia, instalator, ikona | instalacja i otwarcie `.cgpack` dwuklikiem na czystym Windows 11 | S |
| **P4** | Integracja macOS: `.app`, `Info.plist`, zdarzenie otwarcia pliku, `.dmg`, binarka uniwersalna | instalacja i otwarcie `.cgpack` na czystym macOS (arm64 i Intel) | S |
| **P5** | Wydania: `release.yml` – macierz Linux / Windows / macOS (jak w CG System), podpisy, jeśli zatwierdzone | znacznik `v*` daje komplet paczek z sumami SHA256 | S |
| **P6** (opcja) | Android: tryb dotykowy strony, aplikacja z WebView + `artist-core` (JNI), Storage Access Framework | Artist na tablecie: edycja tekstu, wysyłka na serwer | L |

## 6. Ryzyka

| Ryzyko | Ograniczenie |
|---|---|
| Kanwa rysuje inaczej w WebView2 / WKWebView niż na antenie (OBS = Chromium) | `tools/engines.js` jako bramka P2; WebView2 to Chromium jak OBS – ryzyko głównie WKWebView |
| Dwa okna (GTK i wry) rozjeżdżają się w zachowaniu | wspólny rdzeń, ten sam `tests/e2e/okno.js` na wszystkich systemach w CI |
| Brak podpisów = ostrzeżenia SmartScreen / Gatekeeper | podpisy w P5 albo instrukcja w wydaniu |
| Magazyn na `127.0.0.1` blokowany przez zaporę Windows | gniazdo tylko na pętli zwrotnej nie wywołuje pytania zapory; sprawdzić w P3 |
| Android: edycja dotykiem niewygodna | najpierw tablet z klawiaturą; tryb dotykowy jako osobny plan |

## 7. Decyzje do podjęcia (użytkownik)

Alternatywa Qt – oceniona w [RAPORT-qt.md](RAPORT-qt.md): nie ułatwia (Android bez WebEngine, +~200 MB, C++), rekomendacja: nie; do rozważenia wry/Tauri 2 wszędzie.


1. **Nowe zależności** (dziś tylko `gtk4`, `webkit6`, `serde_json`): okno Windows/macOS – `tao`, `wry`, `muda`, `rfd`
   (jak w `vizrs-shell`, wersje z CG System). Proponowane: tak.
2. **Klient HTTPS bez GTK:** (a) `ureq` + `rustls` (jedna implementacja na wszystkie systemy, także Linux) albo
   (b) natywnie: WinHTTP / `NSURLSession` / `gio` – bez nowych crate'ów TLS, ale trzy implementacje. Proponowane: (a).
   Losowość sekretu: `getrandom` (mały crate) albo API systemu przez `std` – do ustalenia z (a).
3. **Podpisy:** certyfikat Authenticode (Windows) i konto Apple Developer (macOS, ok. 99 USD/rok) – teraz, później czy wcale.
4. **Instalator Windows:** tylko `.zip`, Inno Setup czy MSI.
5. **Android:** czy w ogóle, dla tabletu czy telefonu; własna aplikacja Kotlin + JNI czy Tauri 2 (więcej zależności).

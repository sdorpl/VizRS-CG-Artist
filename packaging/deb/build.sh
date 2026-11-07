#!/bin/sh
# Buduje pakiet Debian/Ubuntu vizrs-cg-artist_<wersja>_amd64.deb: okno, dwa skróty w menu (VizRS CG Artist,
# VizRS CG Artist – serwer zdalny), ikona, skojarzenia .cgpack i .vizrs.json.
# Użycie: packaging/deb/build.sh [ŚCIEŻKA/vizrs-cg-artist] [WERSJA] [katalog-wyjściowy]
#   domyślnie target/release/vizrs-cg-artist, wersja z Cargo.toml, katalog bieżący.
# Wymaga dpkg-deb. Serwer `vizrs` daje pakiet `vizrs` (repo VizRS CG System) – okno szuka go obok siebie (/usr/bin).
# Pliki nazwane po identyfikatorze aplikacji (pl.vizrs.CgArtist), żeby nie kolidować z plikami pakietu `vizrs`.
# WebKitGTK 6.0 jest od Ubuntu 23.04 / Debiana 13 – budować na Ubuntu 24.04.
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
TOP="$HERE/../.."
BIN="$(realpath "${1:-$TOP/target/release/vizrs-cg-artist}")"
VER="${2:-$(sed -n 's/^version *= *"\(.*\)"/\1/p' "$TOP/Cargo.toml" | head -1)}"
OUT="$(realpath -m "${3:-.}")"
[ -x "$BIN" ] && [ -n "$VER" ] || { echo "Użycie: $0 [vizrs-cg-artist] [wersja] [wyjście]" >&2; exit 1; }
case "$VER" in *[!0-9A-Za-z.+~-]*) echo "Zła wersja: $VER" >&2; exit 1;; esac
ID=pl.vizrs.CgArtist
mkdir -p "$OUT"
ROOT="$OUT/vizrs-cg-artist_${VER}_amd64"
rm -rf "$ROOT"
mkdir -p "$ROOT/DEBIAN" "$ROOT/usr/bin" "$ROOT/usr/share/applications" "$ROOT/usr/share/icons/hicolor/256x256/apps" \
  "$ROOT/usr/share/mime/packages" "$ROOT/usr/share/doc/vizrs-cg-artist"
install -m755 "$BIN" "$ROOT/usr/bin/vizrs-cg-artist"
install -m644 "$TOP/packaging/$ID.xml" "$ROOT/usr/share/mime/packages/$ID.xml"
install -m644 "$TOP/assets/vizrs-256.png" "$ROOT/usr/share/icons/hicolor/256x256/apps/$ID.png"

# Wayland rozpoznaje okno po identyfikatorze aplikacji – główny wpis ma tę samą nazwę ($ID.desktop), więc okno ma ikonę;
# okno nie zakłada wtedy własnego ukrytego wpisu w ~/.local/share/applications.
desktop() { # plik nazwa opis argumenty
  cat > "$ROOT/usr/share/applications/$1.desktop" <<D
[Desktop Entry]
Type=Application
Name=$2
Comment=$3
Exec=/usr/bin/vizrs-cg-artist $4
Icon=$ID
Terminal=false
Categories=AudioVideo;Video;
StartupWMClass=$ID
D
}
desktop "$ID" "VizRS CG Artist" "Projektowanie scen grafiki VizRS" "%f"
echo "MimeType=application/x-vizrs-cgpack;application/x-vizrs-scene;" >> "$ROOT/usr/share/applications/$ID.desktop"
desktop "$ID.Connect" "VizRS CG Artist – serwer zdalny" "Artist na serwerze VizRS w sieci (adres i token)" "connect"

cat > "$ROOT/usr/share/doc/vizrs-cg-artist/README.Debian" <<'R'
VizRS CG Artist – okno projektowania scen grafiki VizRS (GTK 4 + WebKitGTK 6.0)

Menu aplikacji → VizRS CG Artist (serwer lokalny) albo VizRS CG Artist – serwer zdalny.
Serwer lokalny: program vizrs z pakietu vizrs (VizRS CG System). Okno dołącza do serwera
działającego na tym katalogu danych albo uruchamia `vizrs serve --idle-exit 10`.
Dane: ~/.local/share/vizrs (zmienna VIZRS_DATA, opcja --data). Pomoc: vizrs-cg-artist --help.
R
cp "$TOP/CHANGELOG.md" "$ROOT/usr/share/doc/vizrs-cg-artist/changelog"

cat > "$ROOT/DEBIAN/control" <<C
Package: vizrs-cg-artist
Version: $VER
Section: video
Priority: optional
Architecture: amd64
Maintainer: VizRS <noreply@github.com>
Depends: libc6, libgcc-s1, libgtk-4-1, libwebkitgtk-6.0-4
Recommends: vizrs
Suggests: hunspell-pl
Installed-Size: $(du -ks "$ROOT/usr" | awk '{print $1}')
Homepage: https://github.com/sdorpl/VizRS-CG-Artist
Description: okno projektowania scen grafiki VizRS (Artist)
 Natywne okno Artist systemu grafiki na żywo VizRS: menu, systemowe
 „Zapisz jako”, pytanie przy zamknięciu, kopia robocza, jedna instancja,
 skojarzenia plików .cgpack i .vizrs.json, łączenie z serwerem zdalnym.
 Serwer vizrs działa jako osobny proces – zamknięcie okna nie zdejmuje
 grafiki z anteny.
C
# Triggery dpkg (shared-mime-info, desktop-file-utils, hicolor-icon-theme) odświeżają bazy same; postinst – dla systemów bez nich.
cat > "$ROOT/DEBIAN/postinst" <<'P'
#!/bin/sh
set -e
if [ "$1" = configure ]; then
  command -v update-mime-database >/dev/null && update-mime-database /usr/share/mime || true
  command -v update-desktop-database >/dev/null && update-desktop-database -q /usr/share/applications || true
  command -v gtk-update-icon-cache >/dev/null && gtk-update-icon-cache -q /usr/share/icons/hicolor || true
fi
exit 0
P
# uprawnienia niezależne od umaski budującego
find "$ROOT" -type d -exec chmod 755 {} +
find "$ROOT" -type f -exec chmod 644 {} +
chmod 755 "$ROOT/DEBIAN/postinst" "$ROOT/usr/bin/vizrs-cg-artist"
dpkg-deb --root-owner-group -Zxz --build "$ROOT" "$OUT/vizrs-cg-artist_${VER}_amd64.deb"
rm -rf "$ROOT"

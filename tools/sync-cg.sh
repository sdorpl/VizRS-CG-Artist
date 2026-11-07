#!/bin/sh
# Moduły strony Artist wspólne z VizRS CG System (rysowanie = antena, WYSIWYG): kopia ze źródła w CG System.
#   tools/sync-cg.sh [KATALOG-CG-SYSTEM]          – skopiuj moduły, fonty i fonts.css do web/
#   tools/sync-cg.sh --check [KATALOG-CG-SYSTEM]  – sprawdź, że web/ jest identyczne ze źródłem (CI, bramka)
# Domyślnie ../VizRS CG System. Wersja źródła: web/CG_SYSTEM (znacznik albo commit CG System). Zmiana rysowania zawsze najpierw w CG System, potem tu ten skrypt.
# artist.html i native.js NIE są tu kopiowane – od wydzielenia (2026-11-07) należą do tego repo.
set -e
CHECK=
[ "$1" = --check ] && { CHECK=1; shift; }
TOP="$(cd "$(dirname "$0")/.." && pwd)"
CG="${1:-$TOP/../VizRS CG System}"
SRC="$CG/source/web"
FD="$CG/source/src/fonts_data.rs"
[ -f "$SRC/renderer.js" ] && [ -f "$FD" ] || { echo "Brak źródła CG System: $CG" >&2; exit 2; }
DST="$TOP/web"
SHARED="renderer.js motion.js qr.js richtext.js ticker-model.js ticker-items.js color-picker.js btb-io.js cgpack.js ui.css"

# fonts.css – to samo, co serwer `vizrs` podaje pod /fonts/fonts.css (src/fonts.rs + fonts_data.rs)
fonts_css() {
  awk '
    /^pub const RANGE_LATIN:/     { s=$0; sub(/^[^"]*"/, "", s); sub(/";$/, "", s); latin=s }
    /^pub const RANGE_LATIN_EXT:/ { s=$0; sub(/^[^"]*"/, "", s); sub(/";$/, "", s); ext=s }
    /Face \{ family:/ {
      match($0, /family: "[^"]*"/); fam=substr($0, RSTART+9, RLENGTH-10)
      match($0, /file: "[^"]*"/);   file=substr($0, RSTART+7, RLENGTH-8)
      match($0, /subset: "[^"]*"/); sub_=substr($0, RSTART+9, RLENGTH-10)
      match($0, /weight: [0-9]+/);  w=substr($0, RSTART+8, RLENGTH-8)
      match($0, /style: "[^"]*"/);  st=substr($0, RSTART+8, RLENGTH-9)
      printf "@font-face{font-family:\"%s\";font-style:%s;font-weight:%s;font-display:block;src:url(/fonts/%s) format(\"woff2\");unicode-range:%s}\n", fam, st, w, file, (sub_ == "latin" ? latin : ext)
    }' "$FD"
}
# pliki fontów: te z fonts_data.rs (ścieżka względem web/) i licencje
font_files() {
  sed -n 's/.*include_bytes!("\.\.\/web\/\(fonts\/[^"]*\)").*/\1/p' "$FD"
  (cd "$SRC" && ls fonts/*/LICENSE.txt)
}

if [ -n "$CHECK" ]; then
  bad=0
  for f in $SHARED $(font_files); do
    cmp -s "$SRC/$f" "$DST/$f" || { echo "różni się: web/$f" >&2; bad=1; }
  done
  fonts_css | cmp -s - "$DST/fonts/fonts.css" || { echo "różni się: web/fonts/fonts.css" >&2; bad=1; }
  # nic poza listą (stare fonty po zmianie w CG System)
  (cd "$DST" && find fonts -type f ! -name fonts.css | sort) > "$DST/.lista.tmp"
  font_files | sort | cmp -s - "$DST/.lista.tmp" || { echo "web/fonts/ ma inny zestaw plików niż fonts_data.rs" >&2; bad=1; }
  rm -f "$DST/.lista.tmp"
  [ $bad = 0 ] && echo "web/ zgodne z CG System ($(git -C "$CG" describe --tags --always 2>/dev/null || echo '?'))"
  exit $bad
fi

mkdir -p "$DST"
for f in $SHARED; do cp "$SRC/$f" "$DST/$f"; done
rm -rf "$DST/fonts"
for f in $(font_files); do mkdir -p "$DST/$(dirname "$f")"; cp "$SRC/$f" "$DST/$f"; done
fonts_css > "$DST/fonts/fonts.css"
# wersja źródła – CI pobiera ten stan CG System do --check
git -C "$CG" describe --tags --always > "$DST/CG_SYSTEM"
echo "Skopiowano z CG System $(git -C "$CG" describe --tags --always 2>/dev/null || echo '?') – sprawdź: git diff --stat web/"

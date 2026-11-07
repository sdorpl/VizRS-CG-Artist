#!/bin/sh
# Budowa bez pakietu libwebkitgtk-6.0-dev: gdy w systemie jest tylko biblioteka uruchomieniowa
# (libwebkitgtk-6.0.so.4, libjavascriptcoregtk-6.0.so.1), zakłada w .dev/ pliki pkg-config i dowiązania .so.
# Właściwe rozwiązanie: sudo apt install libwebkitgtk-6.0-dev. Użycie:
#   eval "$(tools/webkit6-shim.sh)" && cargo build
set -e
ROOT=$(cd "$(dirname "$0")/.." && pwd)
D="$ROOT/.dev"
LIB=$(dirname "$(ldconfig -p | awk '/libwebkitgtk-6.0.so.4 /{print $NF; exit}')")
[ -f "$LIB/libwebkitgtk-6.0.so.4" ] || { echo "brak libwebkitgtk-6.0.so.4 – zainstaluj libwebkitgtk-6.0-4" >&2; exit 1; }
mkdir -p "$D/pkgconfig" "$D/lib"
ln -sf "$LIB/libwebkitgtk-6.0.so.4" "$D/lib/libwebkitgtk-6.0.so"
ln -sf "$LIB/libjavascriptcoregtk-6.0.so.1" "$D/lib/libjavascriptcoregtk-6.0.so"
cat > "$D/pkgconfig/javascriptcoregtk-6.0.pc" <<P
Name: javascriptcoregtk-6.0
Description: shim
Version: 2.52.0
Requires: glib-2.0 gobject-2.0
Libs: -L$D/lib -ljavascriptcoregtk-6.0
Cflags:
P
cat > "$D/pkgconfig/webkitgtk-6.0.pc" <<P
Name: webkitgtk-6.0
Description: shim
Version: 2.52.0
Requires: glib-2.0 gtk4 libsoup-3.0 javascriptcoregtk-6.0
Libs: -L$D/lib -lwebkitgtk-6.0
Cflags:
P
echo "export PKG_CONFIG_PATH=\"$D/pkgconfig\${PKG_CONFIG_PATH:+:\$PKG_CONFIG_PATH}\""

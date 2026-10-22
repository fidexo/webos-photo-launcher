#!/bin/sh
set -eu
umask 077

SOURCE=/tmp/mipantalla-autostart-stage
TARGET=/var/lib/mipantalla-autostart
HOOK=/var/lib/webosbrew/init.d/60-mi-pantalla
APPINFO=/media/developer/apps/usr/palm/applications/com.fidexo.photolauncher/appinfo.json

test "$(id -u)" = 0
test -f "$APPINFO"
grep '"version"[[:space:]]*:[[:space:]]*"1.1.0"' "$APPINFO" >/dev/null
test ! -e "$HOOK"
test -d /var/lib/webosbrew/init.d

for file in home-watch.js home-power.js home-input.js home-autostart.sh; do
  test -f "$SOURCE/$file"
  test ! -L "$SOURCE/$file"
done
test -f "$SOURCE/60-mi-pantalla"
test ! -L "$SOURCE/60-mi-pantalla"
grep '"id":"com.fidexo.photolauncher"' "$SOURCE/home-watch.js" >/dev/null

if test -e "$TARGET"; then
  test -d "$TARGET"
  test -z "$(ls -A "$TARGET")"
else
  mkdir "$TARGET"
fi
chmod 700 "$TARGET"
cp "$SOURCE/home-watch.js" "$TARGET/home-watch.js"
cp "$SOURCE/home-power.js" "$TARGET/home-power.js"
cp "$SOURCE/home-input.js" "$TARGET/home-input.js"
cp "$SOURCE/home-autostart.sh" "$TARGET/home-autostart.sh"
cp "$SOURCE/60-mi-pantalla" "$HOOK"
chmod 600 "$TARGET/home-watch.js" "$TARGET/home-power.js" "$TARGET/home-input.js"
chmod 700 "$TARGET/home-autostart.sh" "$HOOK"

"$HOOK"
printf '%s\n' 'AUTOSTART_CONFIGURED'

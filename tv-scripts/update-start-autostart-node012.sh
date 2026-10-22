#!/bin/sh
set -eu
SOURCE=/tmp/mipantalla-autostart-stage
TARGET=/var/lib/mipantalla-autostart
HOOK=/var/lib/webosbrew/init.d/60-mi-pantalla

test "$(id -u)" = 0
test -d "$TARGET"
test -f "$HOOK"
if test -f /tmp/mipantalla-home.pid; then
  OLD=$(cat /tmp/mipantalla-home.pid)
  case "$OLD" in
    ''|*[!0-9]*) exit 1 ;;
  esac
  if test -r "/proc/$OLD/cmdline"; then
    if tr '\000' '\n' <"/proc/$OLD/cmdline" | grep -Fx "$TARGET/home-watch.js" >/dev/null; then
      exit 1
    fi
  fi
  rm /tmp/mipantalla-home.pid
fi
grep '"id":"com.fidexo.photolauncher"' "$SOURCE/home-watch.js" >/dev/null
for file in home-watch.js home-power.js home-input.js; do
  test -f "$SOURCE/$file"
  test ! -L "$SOURCE/$file"
  cp "$SOURCE/$file" "$TARGET/$file"
  chmod 600 "$TARGET/$file"
done
"$HOOK"
printf '%s\n' 'AUTOSTART_NODE012_UPDATED'

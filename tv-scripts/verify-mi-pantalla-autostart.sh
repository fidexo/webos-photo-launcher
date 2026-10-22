#!/bin/sh
set -u
PIDFILE=/tmp/mipantalla-home.pid
WATCH=/var/lib/mipantalla-autostart/home-watch.js
HOOK=/var/lib/webosbrew/init.d/60-mi-pantalla

printf '%s\n' 'PID'
PID=$(cat "$PIDFILE" 2>/dev/null || true)
printf '%s\n' "$PID"
printf '%s\n' 'CMDLINE'
if test -n "$PID" && test -r "/proc/$PID/cmdline"; then
  tr '\000' ' ' <"/proc/$PID/cmdline"
  printf '\n'
else
  printf '%s\n' 'PROCESS_MISSING'
fi
printf '%s\n' 'MATCHING_PROCESSES'
COUNT=0
for cmdline in /proc/[0-9]*/cmdline; do
  test -r "$cmdline" || continue
  if tr '\000' '\n' <"$cmdline" | grep -Fx "$WATCH" >/dev/null; then
    COUNT=$((COUNT + 1))
  fi
done
printf '%s\n' "$COUNT"
printf '%s\n' 'LOG'
tail -n 20 /tmp/mipantalla-home.log 2>/dev/null || true
printf '%s\n' 'HOOK_MODE'
ls -l "$HOOK"

#!/bin/sh
set -eu

enabled="${SNAPCLIENT_ENABLED:-true}"
case "$enabled" in
  0|false|no|off)
    echo "snapclient disabled (SNAPCLIENT_ENABLED=$enabled)"
    exec sleep infinity
    ;;
esac

host="${SNAPSERVER_HOST:-snapserver}"
port="${SNAPSERVER_PORT:-1704}"
name="${SNAPCLIENT_HOSTNAME:-resolver-host}"
card="${SNAPCLIENT_SOUNDCARD:-default}"

set -- snapclient -h "$host" -p "$port" --hostID "$name" --soundcard "$card"
if [ -n "${SNAPCLIENT_EXTRA_ARGS:-}" ]; then
  # shellcheck disable=SC2086
  set -- "$@" $SNAPCLIENT_EXTRA_ARGS
fi

echo "starting snapclient: host=$host port=$port name=$name soundcard=$card"
exec "$@"

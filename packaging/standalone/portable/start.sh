#!/bin/sh
set -eu
uid=$(/usr/bin/id -u)
if [ "$uid" -eq 0 ]; then echo STANDALONE_NONROOT_REQUIRED >&2; exit 1; fi
here=$(CDPATH= cd -P -- "$(/usr/bin/dirname -- "$0")" && pwd -P)
configuration=$here/config/bridge.json
runtime=${XDG_RUNTIME_DIR:-/tmp}/freerdp-bridge-$uid
if [ "$#" -ne 0 ]; then
  if [ "$#" -ne 4 ] || [ "$1" != --config ] || [ "$3" != --runtime-root ]; then
    echo STANDALONE_PORTABLE_USAGE >&2; exit 1
  fi
  configuration=$2
  runtime=$4
fi
case "$configuration" in /*) ;; *) echo STANDALONE_ABSOLUTE_PATH_REQUIRED >&2; exit 1 ;; esac
case "$runtime" in /*) ;; *) echo STANDALONE_ABSOLUTE_PATH_REQUIRED >&2; exit 1 ;; esac
umask 077
if [ ! -e "$runtime" ] && [ ! -L "$runtime" ]; then /bin/mkdir -m 700 -- "$runtime"; fi
if [ ! -d "$runtime" ] || [ -L "$runtime" ] ||
   [ "$(/usr/bin/stat -c %u -- "$runtime")" != "$uid" ] ||
   [ "$(/usr/bin/stat -c %a -- "$runtime")" != 700 ]; then
  echo STANDALONE_PRIVATE_RUNTIME_REQUIRED >&2; exit 1
fi
exec /usr/bin/env -i PATH=/usr/bin:/bin LANG=C.UTF-8 HOME="$runtime" TMPDIR="$runtime" \
  "$here/node/node" "$here/service/dist/main.js" --config "$configuration" --runtime-root "$runtime"

#!/bin/sh
# Separate public test tool; no product runtime or dependency pins change.
set -eu
test "$#" -eq 3 || { echo 'Expected ARCHIVE SOURCE PREFIX' >&2; exit 2; }
archive=$1
source=$2
prefix=$3
case "$archive:$source:$prefix" in *[!A-Za-z0-9_./:-]*) echo 'Build paths must be ASCII without spaces' >&2; exit 2;; esac
case "$source" in /*) ;; *) exit 2;; esac
case "$prefix" in /*) ;; *) exit 2;; esac
test "$source" != / && test "$prefix" != / && test "$source" != "$prefix"
test -z "${ASAN_OPTIONS:-}${LSAN_OPTIONS:-}${UBSAN_OPTIONS:-}${LD_PRELOAD:-}${LD_AUDIT:-}" || {
  echo 'Default sanitizer/loader options required' >&2; exit 2;
}
fixture=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
echo "a6f54defb6fd7c84f41dba13d61e78e9b4e0961712cf61f29715c05f5ced94fc  $archive" | sha256sum --check
# Bind resumable objects to the exact script/probe/toolchain and install path.
identity=$({
  sha256sum "$0" "$fixture"/link_probe*
  gcc-12 --version
  g++-12 --version
  dpkg-query -W -f='${Package}=${Version}\n' gcc-12 g++-12 libasan8 libubsan1 libstdc++6 libc6
  printf '%s\n' "$prefix"
} | sha256sum | cut -d' ' -f1)
mkdir -p "$source"
stamp="$source/.bridge-asan-input"
if test -f "$stamp"; then
  test "$(cat "$stamp")" = "$identity" || { echo 'Use a fresh source directory for changed tool inputs' >&2; exit 2; }
else
  test -z "$(ls -A "$source")" || { echo 'Fresh source directory required' >&2; exit 2; }
  tar --extract --xz --file "$archive" --directory "$source" --strip-components=1
  printf '%s\n' "$identity" > "$stamp"
fi
probe="$source/.bridge-link-probe"
g++-12 -std=c++20 -O2 -fsanitize=address -fsanitize-address-use-after-scope \
  -fdata-sections -ffunction-sections -fvisibility=hidden -fno-rtti -fno-exceptions \
  -fno-toplevel-reorder "$fixture/link_probe_first.cpp" "$fixture/link_probe_main.cpp" -o "$probe"
"$probe" build_id
status=0
"$probe" overflow > "$source/.bridge-link-probe.log" 2>&1 || status=$?
test "$status" -eq 1
test "$(wc -c < "$source/.bridge-link-probe.log")" -le 65536
grep -q 'AddressSanitizer: global-buffer-overflow' "$source/.bridge-link-probe.log"
cd "$source"
CC=gcc-12
CXX=g++-12
CXXFLAGS=-fno-toplevel-reorder
CFLAGS=
LDFLAGS=
export CC CXX CXXFLAGS CFLAGS LDFLAGS
if ! test -f .bridge-configured; then
  ./configure --enable-asan --prefix="$prefix"
  printf '%s\n' "$identity" > .bridge-configured
fi
make -j2
make install

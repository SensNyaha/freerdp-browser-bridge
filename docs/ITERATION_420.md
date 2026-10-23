# Iteration 420 — Native npm runtime checkpoint

2026-10-22, `feature/fastify-0.2.1`, after Fastify checkpoint `03aefc6`.
Implements the native npm distribution part of SPECIFICATION §2.1/2.11 and the
same separate-worker architecture. Product manifests remain 0.2.0 while the
unreleased 0.2.1 feature is completed. No tag, merge or publication is claimed.

## Implemented

`resolveNativeRuntime` is exported through the Node/Fastify public interface.
It validates the installed package/version/platform, pinned FreeRDP metadata,
bounded complete file inventory/hashes and Linux IPC pairing. It returns
trusted WorkerOptions without downloading, compiling, launching RDP or creating
runtime entries. Explicit packageDirectory and normal module resolution are
supported. Windows paths retain their namespace form; Linux executes remain
permission checked. The runtime is currently installed explicitly alongside
the adapter; automatic optionalDependencies installation remains open.

The native npm generator consumes only a project-local installed native stage,
checks its product version/pin/probes, flattens internal file links into a new
package, verifies relocated codec/module origins and writes a hashed receipt.
Libraries, helpers, features, licenses and original vcpkg metadata accompany the
worker. There are no lifecycle install scripts. Linux bin records preserve
executable permissions during npm/pnpm installation.

## Evidence and failures retained

Unit cases cover both platform manifests, version/FreeRDP drift, path/count/size
bounds, missing required files, tampering, extra payload, absent/bad metadata,
relative private roots, symlinks and Linux missing executable permission.
Windows and Linux focused tests pass 3/3; build/lint pass. Full Windows
`pnpm check` passes 912 / 61 skips / 973 total, Linux passes 889 / 87 skips /
976 total, zero failures (`iteration-420-windows-check.log`,
`iteration-420-linux-check.log`). The Linux symlink negative fixture is an
additional focused follow-up against unchanged resolver code. Native CTest
repeats pass GCC 8.3 37/37 and MSVC 36/36 (`iteration-420-linux-ctest.log`,
`iteration-420-windows-ctest.log`); no C++ source or SDK change is made.

Initial failures exposed real integration requirements:

- The CLI --version transport is framed-pipes; actual seqpacket is selected
  through pairing and startup. The packager no longer mistakes that CLI scalar
  for runtime IPC acceptance.
- An initial consumer helper accidentally assigned the runtime tarball to all
  JS dependencies. This caused missing exports/TypeScript errors and was fixed.
- Windows installed pnpm paths exceeded MAX_PATH. Worker startup failed with
  `RUNTIME_DIRECTORY_UNAVAILABLE`; namespace paths fix the same installed case.
- Linux installed binaries lost executable bits and failed spawn with EACCES.
  Explicit bin metadata fixes installation; resolver now refuses missing bits
  before worker startup. No install script or writable-session repair is used.
- A 64-MiB per-file hashing limit was accidentally used for the final compressed
  Linux archive. The archive has its own bounded 128-MiB limit; per-file and
  aggregate runtime limits remain 64/256 MiB.

Full Windows external consumers pass using installed native packages: pnpm
`iteration-420-pnpm-native-consumer3.log` / `build/fastify-consumer-R4VXQt`, npm
`iteration-420-npm-native-consumer2.log` / `build/fastify-consumer-bQER7F`.
Both include strict TypeScript, fake binary media, same-port host WS survival,
browser assets, actual native build probe and strict TLS rejection. Separate
default-resolution probes pass in those same consumers without packageDirectory
(`iteration-420-default-runtime-npm.log`, `...pnpm.log`).

Linux external offline consumer passes with installed native binaries and empty
LD_LIBRARY_PATH (`iteration-420-linux-native-consumer3.log`,
`build/fastify-consumer-yYF7yD`). The permanent fixture then switches to normal module resolution and also
passes in a fresh consumer (`iteration-420-linux-default-native-consumer.log`,
`build/fastify-consumer-42KkTu`). Fake media is transport evidence; actual
native TLS refusal is native integration, not a remote desktop acceptance.

| Development archive | Compressed bytes | Runtime file bytes | Files | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| runtime-win32-x64 0.2.0 | 6,463,313 | 15,860,908 | 59 | `55c93f808094b4a6f4c36b12d035f3a01d7841b67b057922bd8e88f4287e272f` |
| runtime-linux-x64-gnu 0.2.0 | 72,480,863 | 188,009,088 | 164 | `847cfd625c9a085ee6a9874f56b45bfe97ea27cfb47d848e5ee6c72560ba3fb6` |

Windows source is the immutable 0.2.0 native ZIP extracted into a new fixture;
Linux uses `build/native-stage-418-release`. These are development repackagings
with 0.2.0 workers, not accepted or published 0.2.1 release artifacts. Original
native archives and tags are untouched. File links are flattened for npm, which
explains the Linux footprint increase versus the original compressed native
archive. [Runtime usage and build contract](NATIVE_NPM_RUNTIME.md).

An actual RED OS package-browser attempt connects and renders the initial
desktop, observes the first resize, then receives RDP_DISCONNECTED before its
nonuniform resized-image acceptance. Cleanup passes; the attempt is not full
acceptance (`iteration-420-redos-npm-browser-jpeg.log`). Subsequent RED OS H.264 and Astra H.264 package-browser attempts fail before
certificate presentation while connecting, with cleanup passing
(`iteration-420-redos-npm-browser-h264.log`, `iteration-420-astra-npm-browser-h264.log`).
The earlier Astra source-adapter desktop acceptance in iteration 419 remains
separate from these installed-npm attempts.

Remaining gates include actual RDP/browser tests using the installed native npm package, final aligned
0.2.1 native/version packaging and release acceptance. The user has reconfirmed
both 10.0.77.105/106 RDP endpoints; RED OS 10.0.77.105 TCP now connects and its
previous timeout is not treated as a code failure. npm publication credentials
and prepared local delivery repositories remain separate steps of the full goal.

### Lab address correction

The user subsequently changes the lab profiles and explicitly reports the IP
change. The authoritative current targets are RED OS `192.168.56.21` and Astra
`192.168.56.20`. Both TCP 3389 probes connect from the owned viewer container
(`iteration-420-current-lab-network.log`). Helpers now select those profile
addresses and retain the approved RDP certificate pins. Earlier failures against
10.0.77.105/106 are retained, not attributed to a product fix. The read-only SSH
inventory stopped at stale profile admission before auth; no SSH server/key
policy was weakened and no remote settings were changed.

The RED OS JPEG repeat on current `192.168.56.21` connects, renders initial
desktop and acknowledges 1280×720 with a fresh rendered generation, but fails
the required nonuniform resized-image observation and reaches a closed state.
Cleanup passes (`iteration-420-redos-current-npm-jpeg.log`). This remains an
open platform gate; it is not replaced by transport-only evidence.

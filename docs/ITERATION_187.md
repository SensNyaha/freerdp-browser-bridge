# Iteration 187 — linked private Linux build

2026-10-14. Implements TODO Stage 0 and ADR-010 after `be57705`. The local Linux
amd64 Release worker now links exact FreeRDP/WinPR 3.32.1. This is native build /
lifecycle / local TLS evidence, not actual Linux desktop or device acceptance.

## Private channel prerequisites

The retained printer client requires CUPS. A Linux-only overlay builds client
libcups **2.4.20** from commit `ef80eeaea51430a055948240eea3f28ef5354edf`, with a
locked SHA-512. It retains the driver/PPD APIs required by pinned FreeRDP, uses
private OpenSSL/ZLIB and installs no CUPS scheduler. The initial non-DNS-SD build
failed because upstream's fallback destination data structure lacks the two
local-queue fields used by its enumeration implementation. A narrow source patch
adds those fields; the existing initialization/copy/free code remains in place.
The patched library compiles/installs. The patch and its SHA-256 ship with Linux
build metadata; no printer/discovery integration is claimed.
[Upstream release](https://github.com/OpenPrinting/cups/releases/tag/v2.4.20).

Enabled FreeRDP client-common configuration also requires FUSE3. The existing
pinned registry supplies **libfuse 3.18.3** and transitive **numactl 2.0.19**.
These build privately; the libfuse port excludes privileged utility installation.
The feature inspection and license rules include CUPS/FUSE/NUMA in Linux only.
Actual FreeRDP configure passes the private Kerberos, ICU, CUPS and FUSE cache
path checks. No required printer or file-clipboard build option was disabled.
Remote printing, mounting and clipboard behavior remain unverified.

## GCC and lifecycle corrections

GCC 12 Release warnings-as-errors exposed range-insert diagnostics in IPC and
test vectors, a test member initialization-order warning, deduced C++ bool versus
public WinPR BOOL callbacks, and optional request-ID diagnostics in fake peers.
IPC now allocates its validated exact envelope size before copying header/body;
empty/maximum/boundary behavior is retained and a byte-preservation case is added.
That IPC correction is committed separately as `4152919`.
Test packet builders also use final-sized storage. Callback return types and
member initialization follow the pinned public declarations. Fake peers use
explicit zero-initialized IDs, with zero representing no held nonzero correlation.
Compiler warning checks remain enabled; no optimization or warning is suppressed.

ELF RUNPATH does not search a child's transitive dependencies through the parent
executable's path. CTest therefore scopes the two private SDK prefixes to its
test processes. The CLI feature probe now preserves the same explicitly allowed
LD_LIBRARY_PATH as WorkerProcess. CI's Linux Node-check step specifies only those
two build directories. Installed-runtime relocation runs separately without it.

The pinned settings initializer requires HOME before any RDP connection. Normal
Linux HOME is now inherited unchanged. Immediately after context construction,
the public settings API selects private cwd HomePath/ConfigPath and clears the
unused ActionScript. XDG profile variables remain excluded. The first proposed
child-HOME replacement was rejected by automatic approval review; it was removed
and never executed. The implemented alternative does not mutate HOME.
The existing lifecycle case checks the environment contract; 100-worker and
parent-death tests verify private-directory cleanup.

The initial full Linux run also exposed system OpenSSL CLI 3.0 loading private
3.6.5 libraries while generating synthetic TLS certificates. Only that test
tool's environment is restricted to system PATH/Windows system keys; native
FreeRDP still uses private OpenSSL. Focused local TLS connection tests pass 8/8.

## Acceptance evidence and retained limits

- Linux linked native CTest **20/20**, GCC 12 Release, C++20, warnings-as-errors.
- Linux complete `pnpm check`: **448 passed / 76 skipped / zero failures**, 524
  cases. Windows browser/audio/device-only cases are explicit skips, not passes.
- Linux actual native lifecycle includes 100 sequential workers, HELLO/heartbeat,
  parent death and cleanup. Local TLS exercises rejection/prompt/decision/cancel;
  there is no actual Windows/XRDP Linux desktop evidence here.
- Linux relocation **1/1**: codecs and exact linked version/static addin inventory,
  private loaded ZLIB/FreeRDP/JPEG/OpenH264/Opus paths, HELLO/ping/cleanup and shipped
  Linux dependency licenses/CUPS patch metadata pass without dependency PATH.
- Windows foundation CTest **10/10**, linked CTest **22/22**, relocation **1/1**;
  complete bundled Node **524/524** is recorded in iteration 188.

The first Linux TGZ is approximately **24 MiB**, with about **64 MiB** installed
disk usage, excluding Node.js/installers. Passing the current relocation test
does **not** prove all transitive dependencies are private: ELF audit finds
**libudev.so.1 from the host** through libusb. Private libudev and an exhaustive
closure check are immediate follow-up work. The earlier suspected Kerberos
installed absolute RPATH is not present in this actual ELF; its RUNPATH is
`$ORIGIN`. Fresh-checkout/clean-machine, production Docker, actual GitHub CI,
Linux primary IPC/priority writer, RDP/device/platform/soak gates remain open.

Retained logs: `build/iteration-187-*`, including compiler failures, missing
transitive build lookup, no-HOME lifecycle failure, initial Node/fixture failures,
passing linked CTest/relocation and final full Linux checks. The owned no-network
container `freerdp-bridge-linux-verify-187` holds the checked private SDK/build;
it is a development cache, not a production service image.

# Iteration 411 — private Linux dependency portability

Date: 2026-10-22. Branch `feature/astra17-gcc83`, following `8f3acce` and
[iteration 410](ITERATION_410.md). Requirement: GCC 8.3.0/Astra Linux 1.7.5,
mandatory RED OS 7.3/GCC 11 and a verified **0.2.0** compiler-port release.
This block retains C++20, the pinned FreeRDP 3.32.1 commit, strict certificate
checks and the existing private-runtime verifier. No OS/VM or external-host
software installation is performed.

## CUPS client link correction

The prior actual RED OS consumer compiles all targets but fails 12 native
tests because the Debian-built CUPS client imports absent `libcrypt.so.1`.
The exact pinned client has no undefined crypt symbols: its global configure
`AC_SEARCH_LIBS([crypt], [crypt])` adds a library used outside this client.

The Linux CUPS overlay keeps upstream commit/archive/version and the existing
local-queues patch, increments its port revision to **1**, and links only
`libcups.so.2` with `--as-needed`. It retains TLS, zlib, public driver/PPD APIs,
all functions and printing support. No scheduler/service is installed.

A separate GCC 8.3 source build retains all **594** exported symbol names/types,
requires private OpenSSL 3/zlib and no longer needs libcrypt. Unmodified upstream
Core IPP tests pass. The standalone library's SHA-256 is
`da2bf770ef76438f786e90f47b9aba3c946a446137539477dd44a6881845580b`;
the original library is
`3a0d1b818f211cfab086acae866220a099f196c3e8622381ce26109ca253da72`.

The actual RED OS GCC 11.4.1 consumer from iteration 410 then repeats unchanged
native CTest: **37/37**, zero failures, **12.77 s**, followed by successful
private codec/eudev probes and worker capabilities. Only its owned test CUPS
input is replaced after checking both hashes and backing up the original.
This is explicitly a diagnostic runtime replacement, separate from a new
complete SDK/dependency source-chain receipt.

On the same RED OS host, Node 24.21.0 packet-addon/lifecycle/clipboard/process/TLS
checks pass **54/54**, no skips/failures, **26.44 s**. The first JS fixture lacks
the compiled configuration package and reports four suite-load failures;
that log is retained. The complete public input bundle contains 8,449 entries /
78,594,305 data bytes / 16,741,431 compressed bytes, SHA-256
`03302379fd22894e3b3325c83e8bca4cceb2769a876a8ee3501ba0e00c61f135`.
SSH uses the user-confirmed key; saved authentication stays in the private client
and is absent from process arguments, environment, test artifacts and logs.

## NUMA atomic probe correction

The first completely rebuilt CUPS source chain passes linked CTest 37/37 and
Node lifecycle/protocol checks 40/40. Its package's unchanged strict ELF check
finds another external dependency: `libnuma` imports `libatomic.so.1` without
undefined atomic symbols. The system-runtime allowlist is not broadened.

The pinned numactl 2.0.19 configure test asks for an external
`__atomic_fetch_and_1` symbol instead of linking the actual byte atomic builtins
used by `libnuma`. The new Linux overlay retains the pinned source hash and
existing pkg-config/config-module files, increments port revision **2 → 3**, and
first links those three actual operations on a volatile byte. If they need a
library, the original libatomic search still runs.

The initial as-needed link attempt is retained as failed evidence: libtool moves
the flag after the library, so it does not remove the dependency. It is replaced
by the configure correction. A normal GCC 8.3 build keeps all **114** exported
symbols and the existing init/fini hooks, omits libatomic, and passes the
unchanged upstream bitmap test. A compiler wrapper forcing
`-fno-inline-atomics` proves the opposite branch still discovers `-latomic`.
Passing the flag only through CFLAGS initially fails this negative fixture
because upstream moves CFLAGS before its probes; that result is retained.

The corrected standalone NUMA library SHA-256 is
`690deb1fd4cb15a17bd5abe8303b30062536205c21bc9403768eba313bfe2813`;
the original is
`8dc3093b4bd8af4513dbd5dbad845a8cf594cae9af27e54e75115945c741fadd`.
A separate copied diagnostic stage with this library passes the unchanged
private runtime verifier: **34 unique ELF files / 333 dependency resolutions**.
The original failed package stage remains unchanged.

## Modern compiler and artifact provenance

An independent GCC **12.2.0** control rebuilds both pinned libraries in a new
owned directory, using its prepared private OpenSSL/zlib. Both export sets
match their original modern-library controls (**594 / 114**), neither unused
dependency remains, and Core IPP/bitmap tests pass. CUPS installs into lib64
on that fixture; the final repeat explicitly uses and checks that new runtime
directory. Initial missing-input/path fixture failures are retained.

Native packaging now includes the libfuse and numactl overlay recipes alongside
CUPS/eudev. Generated native feature metadata binds the CUPS link patch, FUSE
compiler-standard patch and NUMA byte-atomic patch, plus the new portfiles.
The relocation test checks hashes against the actual installed recipe bytes.
No private/public protocol version or product version is changed in this block.

## Source-chain checkpoints

The first CUPS-only full source rebuild records **22 installed records / ten
required roots**, no downloads or binary cache and unchanged recipes. Its
canonical CUPS library also keeps all 594 exports and omits libcrypt, SHA-256
`285844b9ab2507f2031aa081499eedf967371733efada151433e751470a5af6a`.
It precedes the NUMA/package-provenance changes above.

| CUPS-only checkpoint | SHA-256 |
| --- | --- |
| Dependency receipt | `4f32deabf65057c891a3266e7cdf1b0586b1d2a2f6e7d814c4264388e8ca5999` |
| SDK receipt, strict origins and foreign-prefix refusal | `e51c5c890e2a219ad979b029466d19f1ebaa0ee58fd259cf3f5b83bd26230a77` |
| Native source, 364 files / 2,021,804 bytes | `0956f14947683eb39f3ecf6ac3f2ab5ca7bd899acd486997b936ca7bba69dcf1` |
| Worker | `a0781944ae556ff8c7618e2b9076c34e06437dd3eb1c94de0f0e192ba6c85b29` |
| IPC-only addon | `6fedaf4e3af30ae9b5580b7aec7fb7fbb86bbeb8071568ed69ca49b0583290d1` |

The subsequent complete source rebuild includes both final overlays and uses
a new prefix; previous receipts/outputs remain available. Its public source
export has 1,383 files / 9,584,640 tar bytes, SHA-256
`b67846a254d8bca1dbbbe8c4d3de7d58a91ac28cea8fc94cd4f42cc0d8e050a1`.
The build-metadata script is subsequently reformatted without changing its
values or dependency recipe inputs.

Local ignored evidence includes `iteration-411-cups-gcc83.log`,
`iteration-411-redos73-cups.log`, `iteration-411-redos73-node2.log`,
`iteration-411-numa-gcc83-probe2.log`, `iteration-411-numa-gcc83-outlined.log`,
`iteration-411-stage-numa-probe.log`, `iteration-411-gcc12-vendor-controls3.log`
and the source-chain logs/receipts under root `build/`. Build-input provenance
and SDK-profile refusal tests pass **3/3**; changed JS files pass formatting.

## Final complete source chain and cold artifact

The final no-download/binary-cache-disabled source rebuild completes all ten
required roots / 22 installed records with unchanged recipes. A new pinned
SDK passes its strict private-origin probe and foreign-prefix refusal. A new
untouched Release consumer passes CTest **37/37**, **15.39 s**, and actual
Node lifecycle/protocol fixtures **40/40**, zero skips, **27.22 s**.
The final full `pnpm check` passes **877 / 87 skips / 964 total**, zero failures,
**188.54 s** for the test suite, with version/build/lint/format checks passing.

The final installed package passes strict private-runtime verification
**34 ELF files / 333 dependency resolutions** and the real relocation test
**1/1**, including all installed overlay hashes. It contains 207 entries /
67,662,808 data bytes / 24,864,512 compressed bytes. No system-runtime
allowlist expansion, foreign libc copy or post-build DSO replacement is needed.

| Final bound input/output | SHA-256 |
| --- | --- |
| Dependency recipe | `82c76319ceb50bdc621a864301108faee1bdb7a45d4bd0309f612c81f9563dea` |
| Dependency receipt | `372b65d2c0ba2fe66f4117cc90a65f236fdb9b80ddb9ad43be5b42844594df2a` |
| SDK receipt | `cfe3598d7166728903ff62006d7ea8fff4b256efb51989f8b1cc4c78e9c8c53a` |
| Native source, 369 files / 2,025,396 bytes | `66e82faa36349b7b74e35c8aa96f729d7e1e513b33998c0bf4f9cc980e6d876c` |
| Worker | `eb3c7b13b51dc8d6d6ed98ebbfe55f6babcbb2928722706e13005bbb099d15eb` |
| IPC-only addon | `6fedaf4e3af30ae9b5580b7aec7fb7fbb86bbeb8071568ed69ca49b0583290d1` |
| Final native package | `666c2f203c30161858f664d1365f19c857845a25654751d886ac03aa22cd7a89` |

The exact package also passes the independent artifact-only probe on the
authorized actual RED OS host as UID 1000 / Node 24.21.0: six module origins,
codec roundtrips, paired IPC addon, three acknowledgements and empty runtime
cleanup. The probe has no workspace packages, SDK or dependency paths in its
environment. Only its fixed runtime directory is adapted into the user's
private test root. `REDOS_ARTIFACT_ONLY_ACCEPTED` and exit 0 are observed.

The local host configuration now points to `10.0.77.105`. An unauthenticated
handshake first verifies the same original user-confirmed ED25519 fingerprint
before password authentication. Initial attempts refuse the old-address local
assertion; no password is sent by those attempts. An automatic approval-review
usage-limit failure temporarily prevents one retry; it is not bypassed and the
later reviewed retry succeeds. No host software or service is installed/changed.

Final evidence additionally includes `iteration-411-gcc83-dependencies-final.log`,
`iteration-411-gcc83-sdk-final.log`, `iteration-411-gcc83-linked-final.log`,
`iteration-411-gcc83-node-final.log`, `iteration-411-gcc83-package-final.log`,
the final build receipts and `iteration-411-redos73-artifact.log`.

Actual RDP desktop regression remains separate. Installed Astra and security
profiles remain separate from the user's selected container checks. No shared
merge, Stage 0/platform checkbox or 0.2.0 tag is accepted by this report alone.

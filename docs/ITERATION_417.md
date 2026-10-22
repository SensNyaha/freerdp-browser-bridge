# Iteration 417 — bounded legacy XRDP negotiation and actual distro desktops

2026-10-22. Branch `fix/redos73-xrdp-receive`, based on `07faaff`.
Implements SPECIFICATION §3.1 and ARCHITECTURE §11/12 without changing the
ADR-012 output profiles. All tracked changes are in the repository root.

## Defect and correction

Iteration 416 identifies a rejected complete 52-byte RDPSND record on the
actual RED OS 7.3 / XRDP 0.10.6.1 node. Public XRDP v0.10.6.1 source
(`sesman/chansrv/sound.c`, `sound_send_server_input_formats`) sends an optional
52-byte `SNDC_REC_NEGOTIATE` proposal: opcode 39, version 5, a 16-byte fixed
header and two WAVEFORMATEX descriptors. The downloaded source archive SHA-256
is `367b0f8235159f7d37501cfcf4a6bb38e2af3975bd8d20315c2d455a5b991359`.
This source/length match is not a retained capture of remote channel contents.
Pinned FreeRDP 3.32.1 ignores this unsupported control without replying, but
the bridge validator previously rejected it before delegation.

The validator now admits this specific control after checking exact outer
length, version 5, at most 64 complete descriptors, at most 1,024 extra bytes
per descriptor and no trailing data. It shares the existing bounded table
parser and retains the 64 KiB, fragment and deadline limits. A distinct
`legacy_input_formats` kind cannot be mistaken for output formats or samples.
No recording response/device/data path is enabled; opcodes 40–43 still fail.
AUDIN policy/capability gates and all dependency pins remain unchanged.

The new portable test first fails against the old validator, then passes
77 assertions after correction. It checks empty/two/64 formats, maximum extra
data, over-limit claims, every truncated prefix, version/count/trailer faults
and unsupported recording opcodes. The linked pinned RDPSND fake-backend test
accepts the exact upstream proposal at every one of its 51 fragment splits,
performs no writes, still processes a subsequent volume record, and never
delegates a malformed count. This fixture is separate from actual RDP evidence.

## Clean builds and packaging

| Profile | Native CTest | Focused Node | Full `pnpm check` |
| --- | --- | --- | --- |
| Exact GCC 8.3.0, linked Release | 37/37 | 40/40, zero skips | 877 passed / 87 skipped / 964 total |
| MSVC 19.44, linked Release | 36/36 | 27 passed / 1 skip | 900 passed / 61 skipped / 961 total |

Both full checks include version, build, lint and formatting and have zero
failures. Linux/Windows test durations are 204.69 / 436.68 seconds. Native and
CMake source snapshots match after CRLF normalization; only the generated
platform feature JSON differs. Raw source hashes therefore differ legitimately.

GCC source snapshot: 369 files / 2,028,866 bytes, SHA-256
`9774871d56d8539100dc370f3e1987cdd1f9fd7430a233bd2d5c6fccbe07aa9f`.
Linux worker SHA-256:
`3ed3a8a86c13aa80c66ec3e13dbaed6d8b294dd649ce9ed82a7d934ed38c76d3`.
MSVC source SHA-256:
`9ecfd850addaaa207ef63088df513460b5c39b994762dbba857b6f84e78086b4`;
worker SHA-256:
`92814ea745f0deb9b61744fdf17056e9ba2352cbe30e2dc9242096d05715d7b4`.
The independently staged Linux package passes strict private-runtime closure
of 34 ELF files / 333 resolutions and relocation 1/1. Archive SHA-256:
`f3a69f7e2a5875b32954ec6c2f2374a6d6115ccfc00910db0e1cbb58f329a7f6`.
No foreign DSO replacement or new loader allowlist is used.

## Actual RDP acceptance

The same installed GCC 8.3 package runs in an isolated Astra-library client
container, without `LD_LIBRARY_PATH`. The remote machines are the actual
user-authorized RED OS 7.3 and user-confirmed Astra Linux 1.7.5 nodes. Each
connection accepts only its previously user-confirmed certificate fingerprint.
No external server software, settings or applications are installed/launched.

Both nodes pass independent public HTTP/WebSocket Edge **H.264 and JPEG** runs:
nonuniform 1920×1080 canvas, resize to 1280×720, restoration to 1920×1080,
viewer reattachment with fresh tokens, and joined session/runtime cleanup.
Native idle controls also pass connection, both codecs, fresh JPEG, heartbeat
and cleanup on both nodes. The former RDPSND receive rejection does not recur
in these passing controls. This accepts the named desktop profiles, not audio,
remote application input/clipboard, security profiles or a new long soak.

Earlier attempts remain evidence: RED OS initially shows a locked/blank desktop;
the user manually unlocks it and confirms the prepared editor is available.
A headed observer times out waiting for its separate readiness button and is
not counted as passing. Two JPEG attempts fail before certificate presentation;
a later connected attempt fails its resize observation. The subsequent bounded
diagnostic repeat passes both sizes and reattachment without a product change
or longer deadline. Their intermittent cause is not established. A separate
native repeat connects then receives native error 65548, which the pinned
public header maps to `FREERDP_ERROR_LOGOFF_BY_USER`; it is distinct from the
original bridge receive rejection. One Astra attempt starts before the prior
test releases its listener and fails at startup; sequential repeats pass.

Evidence under ignored root `build/`: `iteration-417-{legacy-red-test,
legacy-green-test,gcc83-linked,gcc83-full-check,msvc-root,windows-full-check,
source-comparison,package}.log`, `iteration-417-redos-native-idle.log`,
`iteration-417-redos-native-repeat.log`, `iteration-417-redos-browser-h2642.log`,
`iteration-417-redos-browser-jpeg{,2,3,4}.log`,
`iteration-417-astra-native.log`, `iteration-417-astra-browser-h2642.log` and
`iteration-417-astra-browser-jpeg.log`. Reports retain selected scalars only,
not credentials, clipboard text or screen contents.

This completes this fix's named acceptance. Merge and 0.2.0 preparation are
separate steps; stable `v0.1.0` artifacts and the unfinished managed-drive
branch remain intact. New-worker Windows application/audio acceptance is not
claimed by the local MSVC regression; the accepted historical Windows MVP
profile retains its original scope.

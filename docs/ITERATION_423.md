# Iteration 423 — Native npm corresponding-source companions

2026-10-22, `release/0.2.1`, after checkpoint `7885125`. The actual RED OS
repeat after the user-reported session restart passes both codecs with the
unchanged iteration-422 artifacts. Historical blank-image attempts remain
recorded separately. This report does not by itself accept a tag or publish
any package.

## Packaging correction

The existing candidate packages carry license texts and vcpkg build SBOMs,
but omit corresponding source for their bundled LGPL libraries. The final
native npm producer now includes full pinned upstream source archives,
the exact recipe/patch bytes from each dependency's build SBOM and the
project's platform triplets under `corresponding-source/`. Windows includes
libusb; Linux includes libusb, eudev, libfuse and numactl. This follows the
source-distribution requirements in the bundled LGPL texts; own bridge code
remains MIT and dependency code retains its terms. The generic vcpkg tools
remain referenced at their pinned commit. Microsoft CRT notices separately
link the applicable [runtime terms](https://visualstudio.microsoft.com/license-terms/vs2022-cruntime/)
and [redistributable list](https://learn.microsoft.com/en-us/visualstudio/releases/2022/redistribution).
This records the implemented distribution materials, not a blanket legal,
vulnerability or third-party patent clearance assertion.

The helper accepts only the expected source version/revision/SHA-512 and
SBOM SHA-256 recipe records, including every recorded patch. It rejects
oversized inputs before allocating content, outside-root paths, final file
symlinks, missing/mismatched sources and invalid/duplicate/traversing metadata.
Windows checkout CRLF conversion is accepted only when the resulting recipe
bytes exactly match the dependency build's recorded hash. The source archives
are copied without extracting or executing them; no install hook is added.
New unit coverage passes 3/3 on both platforms, including corrupt cache,
bounded reads and malicious metadata. Additional malformed-record cases are
also included before the final regression repeat.

## Candidate artifacts and unchanged runtime

The new candidate set is `build/release-423-archives/`; prior iteration-422
archives are preserved. The five JS tarballs retain their exact iteration-422
bytes. Both native runtime inventories compare byte-for-byte equal to the
earlier candidate, including every runtime file's SHA-256 and pairing data.
Only source companions and notices/package inclusion change. Clean native
CTest/lifecycle receipts remain those recorded in iteration 422; no C++ or
native compiler input is changed here.

| Native package | Bytes | Source components / input bytes | Archive SHA-256 |
| --- | ---: | --- | --- |
| runtime-win32-x64 | 6901070 | 1 / 441432 | `4622f2cc743111dbd379db029386dfaaee50b710f33d1985ebb3acbd0d0785f6` |
| runtime-linux-x64-gnu | 76472676 | 4 / 4028841 | `dcc0411d8db5bb8c125473b1816667a2c46e78bc4ede16c0b46c22ff44a94f40` |

Receipts: `build/npm-native-win32-DHCi7a/receipt.json` and
`build/npm-native-linux-R2Jihs/receipt.json`. The bounded seven-tarball audit
passes pack paths, version/workspace expansion, own licenses/native notices
and known lab password sentinels (`build/iteration-423-artifact-audit.log`).
This is a scoped check; source archives are separately bound to expected
upstream hashes rather than treated as newly authored project files.

The exact Linux consumer passes offline pnpm installation, strict TypeScript,
host HTTP/WS coexistence, fake binary media, packaged native strict TLS refusal,
rollback to the previous **development** 0.2.0 package set, upgrade to 0.2.1,
uninstall and reinstall. That rollback result does not declare the old
development adapter an accepted stable 0.2.0 release. Evidence:
`build/iteration-423-linux-exact-consumer.log`. Full Linux regression passes
892 tests, 87 skips, zero failures (`iteration-423-linux-check.log`).

All seven exact archives pass `npm publish --dry-run` with matching SHA-512
integrity and sizes (`build/release-423-npm-dry-run.json`). The initial helper
mistakenly expects flat JSON; npm 11 returns a keyed object. Inspecting that
public metadata establishes the shape mismatch; correcting only the helper
passes without changing archive bytes. No registry write is performed.

## Retained incomplete observations

The initial Windows external npm install reaches the bounded subprocess
failure without a completed consumer report. The initial Windows full check
records failures in synthetic Edge microphone cases and does not produce a
successful terminal summary before its observation handle disappears during
tool-session replacement. Those checks are not credited as passing. An
isolated microphone Worklet repeat passes unchanged, 1/1. Final Windows
regression and an isolated cached npm install/reinstall remain to be recorded.

The first final-source-package Astra H.264 form attempt connects but does not
complete the first resize; cleanup passes (`build/iteration-423-astra-h264-form.log`).
It remains a failure. The already-passing iteration-422 RDP results are not
silently relabeled as this package's complete installed-browser acceptance.
Final installed-package browser repeats and release/publication remain open.

## Isolated consumer and browser follow-up

The fresh Windows cached/offline npm consumer now passes strict TypeScript,
host HTTP/WS coexistence and actual native strict TLS refusal, then removes
all bridge packages, verifies the import is absent, reinstalls the same exact
archives and passes again. Evidence:
`build/iteration-423-windows-exact-consumer-offline.log`. No install scripts,
compiler, system FreeRDP or registry overrides for native binaries are needed.
Local file dependencies/overrides still identify this as tarball acceptance,
not a registry-only consumer acceptance.

Sequential installed-package browser repeats pass Astra H.264 form and JPEG
direct API with both sizes, restoration, reattach, host HTTP and diagnostics,
and full runtime cleanup. Evidence:
`iteration-423-astra-h264-form-isolated.log` and
`iteration-423-astra-jpeg-api-isolated.log` under build/.
RED OS JPEG form again connects and decodes frames but fails the nonuniform
render predicate; cleanup passes (`iteration-423-redos-jpeg-form-isolated.log`).
No further codec is started by that failing command. Runtime manifest bytes
remain identical to the set which passes both codecs after the user's restart.
This narrows the package comparison but does not establish the remote cause
or waive the failing desktop acceptance. Read-only desktop-state inspection
and isolated final Windows regression continue; release is still open.

Read-only pinned-key SSH inspection then observes an active remote X11
`xrdp-sesman` session on display `:10` with `LockedHint=true`. The user bus
reports GNOME ScreenSaver active. Process counts include a running GNOME shell
and two `gnome-session-b` entries; the older exact-name `pgrep gnome-session`
inventory cannot establish their absence. The user's small readable
`.xsession-errors` contains none of the enumerated error markers. These
observations establish current lock state, not a product failure cause or an
audited desktop-log analysis. The user is asked to unlock through their ordinary
client. No service, lock policy, screensaver state or remote configuration is
changed by the helper. Evidence: `build/iteration-423-redos-session-state.log`
and `build/iteration-423-redos-login-sessions.log`.

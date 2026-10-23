# Iteration 400 — bounded XRDP CLIPRDR trailer compatibility

2026-10-21. Addresses the owned-XRDP CLIPRDR readiness gap in [397](ITERATION_397.md)
under SPECIFICATION §2.7. Work is isolated from concurrent input changes.

The official XRDP 0.9.21.1 [clipboard source](https://github.com/neutrinolabs/xrdp/blob/v0.9.21.1/sesman/chansrv/clipboard.c)
appends a zero DWORD outside the declared `dataLen` to capabilities, Monitor Ready,
ACK, requests and text responses. The bridge's exact-length ingress rejects
these records. A byte-exact Monitor Ready fixture reproduces the rejection in
both the allocation-free inspector and the actual pinned CLIPRDR receive host.
Both new tests fail before the correction (`build/cliprdr-padding-red.log`).

Ingress now admits either the original exact envelope or exactly four trailing
zero bytes. It checks the declared body limits before fragmented allocation,
checks every trailer byte and forwards only the declared record to FreeRDP.
Unknown types/flags, malformed bodies, nonzero/other-sized trailers, original
deadlines, fragment count and the absolute 16 MiB + 8 outer cap remain refused.
The extra bytes never enter Unicode/application data or quota measurements.
Over-quota fragmented data still drains without body allocation and validates
the trailer before completing a refusal. No dependency, Release configuration,
public/private IPC schema or persistent trust change occurs.

New boundary tests cover every split of the padded controls, exact quota and
outer-cap boundaries, nonzero trailers and the allocation-free quota drain.
Linked pinned FreeRDP tests receive normalized capabilities/Monitor Ready,
format lists and Unicode data. Original exact-envelope tests remain intact.
Full linked Release CTest passes 34/34 in 23.66 s
(`cliprdr-padding-final-native-repeat.log`). A previous full attempt hits the
Windows executable lock while a Node fixture owns the worker; it is retained
in `cliprdr-padding-final-native.log`. No assertion/deadline is relaxed.

The isolated Node 24 / pnpm 10.11.0 check passes build, ESLint, formatting and
885 tests / 61 skips / 946 total, zero failures/cancellations, in 576.89 s
(`cliprdr-padding-pnpm-check-native.log`). Native fixtures use the explicit
new binary directory. Ten additional skips reflect absent ordinary bundled
artifacts in this worktree. The earlier missing-PATH/default-fixture attempts
are retained as fixture failures, not product evidence. The new lab CLI mode
also passes syntax/ESLint/format checks after its addition.

Actual owned loopback XRDP with the corrected worker reaches ready state,
heartbeat and joined empty-runtime close, with zero text reads/writes
(`cliprdr-owned-ready.log`). A separate actual headed Edge/public API check
reads the prepared Tk application's bounded F2/Ctrl+C JSON through CLIPRDR and
the viewer's explicit Get action. It observes one read, zero native writes,
cleared viewer fields and empty runtime (`cliprdr-owned-public-read.log`).
Only fixed pointer counters are retained; local OS Clipboard API is unused.
This accepts the named XRDP source/read path, not browser-to-XRDP text entry,
Windows regression, multi-session clipboard isolation or the full 16 MiB
real-server transfer matrix. Existing Windows clipboard acceptance retains
its separate scope. A current combined-build/30-minute observation remains.

The subsequent final-binary read repeat reaches ready but receives no new text
offer after F2/Ctrl+C, zero reads/writes and joined empty-runtime close
(`cliprdr-owned-public-final.log`). The application/selection re-offer cause is
not established. The earlier successful read keeps its exact scope; repeatable
XRDP clipboard re-offer after a fresh connection remains open. Readiness remains
confirmed in this repeat. No retries or timeouts are weakened.

The reproducible `--owned-clipboard-read --focus-editor` mode uses the same
prepared application and receipt-bound worker selection. It refuses the
external/default lab and conflicting modes before credentials and disables
failure-frame capture. [Ingress contract](CLIPBOARD_INGRESS.md).

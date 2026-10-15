# Iteration 233 — revoke a retained clipboard offer

2026-10-15. Implements native/private offer retirement needed for SPECIFICATION
§2.7 and exclusive controller ownership, following `c96cc08`.
[Wire and lifetime contract](CLIPBOARD_IPC.md#native-offer-revocation-iteration-233).

Empty Unicode text and no offered format are separate operations. The new
content-free schema-2 revoke command shares the existing single flight, requires
its own HELLO capability and returns only after empty-list ACK/publication.
Old read/set bytes, per-item maxima, output slots and transport limits remain
unchanged. Old peers refuse this method before dispatch. Native text is wiped
before sending; negative ACK, timeout and output pressure cannot restore it.
Receive-only selection, which never retains a local value, needs no remote write.

The first linked Windows/Linux tests fail because pinned FreeRDP 3.32.1
`cliprdr_client_format_list` returns success but suppresses every empty list after
the initial one (`cliprdr_main.c`, `initialFormatListSent` check). The corrected
path uses public APIs only: drain accepted SDK channel writes, resolve/check the
stable CLIPRDR channel and send one fixed 8-byte empty list with checked
`SendChannelData`. This prevents older queued replies overtaking the ACK barrier.
Public dispatcher, send failure/exception, missing/changed channel, ACK refusal,
deadline, post-revoke data refusal, new-owner value and result-backpressure cases
pass against the actual pinned CLIPRDR with simulated transport. This is not
actual remote revocation or a bound on upstream dispatcher CPU/queued copies.

Golden vectors independently verify schema-2 metadata, no text/revision, exact
length and refusal of schema-1 revoke/schema-2 read/set. Synthetic private IPC
tests verify capability refusal, one flight, reuse, copied state and rejection of
a revoke success that still publishes an accepted local value. Actual local TLS
fixtures verify CLI/HELLO capability, unavailable pre-ready/retired operations,
strict certificate rejection, heartbeat and directory cleanup.

Windows foundation CTest passes 14/14; linked Windows 29/29 and Linux 30/30 pass.
Six focused local non-PIE ASan/UBSan clipboard executables pass; SDK libraries
remain uninstrumented. Seeded instrumented wire fuzz completes 1,020,059 runs in
21 seconds, coverage 664 / 1,859 features, peak RSS 293 MiB, exit zero. Full
bundled Linux `pnpm check` passes 590 with 54 skips / 644 cases, and installed
relocation passes 1/1. Full bundled Windows repeat passes 595 with 49 platform
skips / 644 cases; installed relocation passes 1/1. Logs: `build/iteration-233-*`.

Retained setup failures: one Windows link attempt raced a running Node suite,
leaving its worker executable unavailable; that invalidated the first full
Windows run. Builds and worker-consuming tests are now serialized. A test-only
MSVC handle-null analysis warning is fixed with explicit control flow. Linux
package copying also replaced workspace links; frozen offline pnpm installation
restored them, followed by a successful forced source build and full check. None
of these failed runs is counted as a pass; no lockfile or checks were weakened.

The single user-authorized actual XRDP write/empty-text test was already consumed
in Iteration 232. It is not repeated or reinterpreted as revoke acceptance.
No remote clipboard read, OS clipboard or physical device is used here. Public
controller/transport/browser integration and actual remote/application acceptance
remain open; Stage 7 and managed-drive requirements remain unchanged.

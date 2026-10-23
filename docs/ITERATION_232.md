# Iteration 232 — private typed clipboard and actual XRDP ACK

2026-10-15. Implements the private Node selection/ownership portion of
SPECIFICATION §2.7, on top of `85e6080`.
[Current contract](CLIPBOARD_IPC.md#private-typed-node-selection-iteration-232).

The paired worker/Node HELLO adds the guarded `clipboardText` capability.
Explicit text-only direction/size selection maps to schema 10; legacy workers
and unsupported formats refuse before configuration/secret delivery. Existing
write budgets remain unchanged. Allocation-free Unicode/item validation precedes
command allocation. Copied scalar state carries current generation/revision;
read/write share one finite flight, recheck source authority and never retry.
Transport content is wiped; accepted read buffers belong to the caller.

RDP/source retirement immediately cancels the pending operation and retains one
scalar correlation to validate and discard a late reply. Queued ready events
cannot restore authority. Synthetic private IPC cases cover directions, stale
offers, one flight, malformed/duplicate/oversized replies, generation/revision
faults, source/connection loss, late replies, local quotas and seven-second
completion expiry. Three actual worker/local TLS profiles verify selection,
strict rejection, heartbeat and cleanup; these are not remote clipboard tests.
The public native adapter still refuses clipboard before spawning the worker.

Windows focused repeat passes 15/15. Full bundled Windows `pnpm check` passes
593 with 49 platform skips / 642 cases. The first full run retained one failing
fixture assertion requiring exactly one waiting source event after failed TLS
startup. That assertion incorrectly assumed admission/delivery despite bounded
output credit and terminal control priority. It now permits no event, validates
every observed event, and requires no usable authority after failure. The repeat
passes; no production scheduling guarantee was weakened. Full bundled Linux
passes 588 with 54 skips / 642 cases; corrected actual TLS repeat passes 7/7.

Windows foundation CTest passes 14/14, linked Windows 29/29 and Linux 30/30.
Fresh installed relocation passes 1/1 on each platform. This block changes no
native parser or channel owner; the preceding linked sanitizer/fuzzer evidence
remains scoped to Iteration 231, rather than being claimed as a new run here.
Evidence logs: `build/iteration-232-*`.

Two initial Windows lab attempts timed out before clipboard readiness. After the
user restored access, actual XRDP metadata inventory passes: ready generation 1,
revision 0, both directions, 65,536-byte maximum, heartbeat, joined shutdown and
empty runtime. No remote clipboard content is read.

Automatic approval review initially rejected a proposed write/clear because it
could replace existing remote contents. After explicit user permission for one
test, exactly one Windows XRDP run offers a fixed synthetic Unicode value, waits
for the format-list ACK, offers empty text and receives its ACK. Both return
accepted; heartbeat and empty-runtime cleanup pass. This permission is consumed.
No host OS clipboard is accessed. ACK proves offer completion, not that a remote
application requested or consumed Unicode. Empty text remains an accepted Unicode
offer; it is not format revocation.

Public controller ownership/revocation, browser transport/gesture integration,
actual remote read/application transfer and total-resource acceptance remain open.
Stage 7 remains IN PROGRESS; managed drives and other clipboard formats retain
their requirements. Secrets/content do not enter diagnostics or commits.

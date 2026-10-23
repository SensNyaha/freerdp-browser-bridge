# Iteration 240 — initial clipboard ACK readiness and bounded lab probe

2026-10-16. Continues SPECIFICATION §2.7 with the current reference client and
the [one-off control probe](XRDP_CLIPBOARD_CONTROL_PROBE.md).

The helper now supports a synthetic run with no lab input/RDP and a separate
explicit real action. Real mode is limited to 192.168.21.149:3389 and the exact
previously approved session-only fingerprint. Credentials come from bounded
ignored JSON and private IPC. Only browser-to-server text/1,024 bytes is selected.
Read hooks throw before native dispatch, non-reset input is rejected, and OS
Clipboard API requests are intercepted with refusal. One exact fixed Unicode
item is permitted, with no automatic set/revoke retries. The current owner must
deliver one no-format revoke ACK while the native source/RDP are ready before
fresh-token viewer replay can pass. Failure cleanup is bounded and reports only
known scalar status, never clipboard contents or raw errors.

Synthetic probe passes exactly one set/revoke, ready-after-revoke, fresh viewer,
zero reads/OS requests and empty runtime. A new explicit user permission then
authorized one real invocation, separate from the consumed Iteration 232 test.
That invocation failed at offer: zero backend writes, zero revokes, three source
events, no remote data reads or host API access and empty runtime. It is retained
in `build/iteration-240-xrdp-offer-revoke.log`; it is not a remote acceptance pass
and is not silently retried. The first permission applies to that one invocation.

Code inspection shows MonitorReady marks the native channel ready before its
initial format-list ACK. The reference UI previously enabled Send from ready /
direction alone, while the transfer/ownership layers correctly refuse pending
native work. A deterministic Edge/fake-RDP case withholds the initial ACK:
before the fix Send is incorrectly enabled; afterward it stays disabled, sends
nothing automatically and becomes usable after observed ACK. This reproduces
an independent readiness gap; the failed real invocation did not retain enough
admission diagnostics to prove that gap was its exact cause.

ClipboardClient now projects per-operation admission using native local/remote
pending flags and current grant/previous local-offer ownership. Both direct
operations and UI buttons respect it. No quota/deadline/refusal is weakened.
The lab probe additionally waits for initial source admission and projects known
source/session/status metadata on failure. Six client cases and three Edge
viewer cases pass 9/9; the updated synthetic probe passes with recorded quiescent
admission. Full Windows check passes 644 with 49 skips / 693 cases; full Linux
check passes 639 with 57 skips / 696 cases, both with zero failures. Existing
native baseline remains Iteration 238 Windows 29/29 and Linux 30/30 for unchanged
C++ code; no new native test execution is claimed here.

The user subsequently authorized necessary repeated controlled offer/revoke
tests. That instruction covers the fixed-sentinel/revoke scope of this helper;
remote content reads and real host Clipboard API access remain blocked. No new
permission is required for each covered repeat.

The corrected actual Windows producer / XRDP / Edge repeat passes, recorded in
`build/iteration-240-xrdp-offer-revoke-repeat.log`: exactly one backend write with
accepted ACK, one no-format revoke with accepted ACK, seven scalar source events,
ready source after revoke and fresh-token viewer replay. Admission starts at
generation 1 with no accepted/pending local offer. One actual JPEG frame is
observed; remote reads and host Clipboard API requests both remain zero. Joined
shutdown leaves an empty runtime. This accepts the named public browser/native
offer/revoke lifecycle slice, not remote application consumption or readback.
The initial failed invocation and its unverified cause remain recorded above.

Application text consumption, reverse readback, physical OS permission, total
resource/network and complete Stage 7/managed-drive acceptance remain open.

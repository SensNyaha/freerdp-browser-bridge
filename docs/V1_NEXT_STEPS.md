# Next stage — full V1

Begin after the named [practical MVP acceptance](MVP_ACCEPTANCE.md). This is a
plan, not implementation or acceptance of the deferred features. The normative
requirements and existing statuses remain in [TODO](../TODO.md), SPECIFICATION
and accepted ADRs. Do not expand the current MVP delivery further.

1. **Complete remaining core profiles and Stage 7.** Preserve the accepted
   desktop/input/audio/Clipboard regressions. Investigate a recurrent Get refusal
   using its fixed status/revision evidence; do not hide it with retries. Finish
   remaining XRDP producer/server profiles after the named owned XRDP 0.10.1
   Clipboard roundtrip [acceptance](ITERATION_404.md), along with
   direction/quota/isolation/resource matrices and additional Clipboard formats.
   Implement RDPDR managed drives /
   `thinclientDrives` with policy, bounded CRUD and actual remote application
   read/write/cleanup acceptance. Complete remaining audio profiles, measured
   handoff/latency gates and microphone/hardware acceptance separately.
2. **Stage 8 devices.** Implement policy-controlled, capability-gated USB,
   printing, smartcard and serial/parallel through the documented native channel
   architecture. Each advertised device needs actual hardware/application,
   cancellation, unplug and ownership/cleanup evidence. Preserve touch/pen code
   and complete its hardware matrix. Browser hardware access must use an
   explicitly supported companion/virtual mechanism where required.
3. **Stage 9 advanced connection features.** Complete Gateway/proxy, RemoteApp,
   general reconnect and remaining settings/authentication/error profiles.
   Reconnect must preserve certificate policy, session isolation and safe input /
   channel ownership; ordinary viewer reattachment is not that acceptance.
4. **Finish Stage 0/1/10 release gates.** Complete configured capacity and
   abnormal/orphan cleanup, remaining platform/build/sanitizer matrices and
   manual CI. Package exact private dependencies for supported Windows/Linux
   installations and test relocation/clean-machine installers. Perform the
   remaining sustained concurrent-session/resource/network acceptance, including
   the original larger session target, rather than extending MVP claims.

Keep one C++20 worker per session, private credential IPC, strict certificate
verification and pinned dependencies. Do not change Release settings without
explicit authorization. Unsupported/unverified devices stay unavailable;
compiled channels and synthetic fixtures do not establish hardware support.
One primary monitor at 100% scale remains the agreed scope under ADR-011;
multimonitor and additional scale/layout profiles are not added by this plan.

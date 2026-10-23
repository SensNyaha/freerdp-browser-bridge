# Iteration 114 — finite microphone ownership transfer

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
bounded ingress `daa0c3d`.

One exclusive grant composes immediate revocation, Node drain, private reset
and observed fresh epoch. One overall deadline prevents new ownership after
uncertain completion; faults request host termination once. Timer/listener
retirement, cancellation of late reset initiation and old-owner immunity keep
resources and authority bounded. No device or public socket is activated.

Seven portable cases pass with the ingress suite **14/14**; the focused private
process and ownership suites pass **20/20**, including one new synthetic IPC
process case. This fixture checks actual private Node request/publication
ordering but does not run FreeRDP or capture a microphone. Existing real-native
TLS refusal remains a distinct test. The initial full run passed 321/322 and
exposed an existing certificate test race: awaiting-user state arrived before
the separately framed certificate prompt. The test now waits for the scoped
prompt event as well as the state, retaining replay/denial/cleanup assertions.
Its separate actual-native TLS suite passes **8/8**. Full bundled `pnpm check`
retry passes **322/322**, without skips. Unchanged bundled CTest passes **17/17**,
foundation **6/6**. Formatting and diff checks pass.

Public session/control/media integration, host termination completion,
permission/capture/resampling/Opus input, actual remote/physical/LAN/platform and
upstream core/lost-write gates remain open. [Contract](MICROPHONE_OWNERSHIP.md).

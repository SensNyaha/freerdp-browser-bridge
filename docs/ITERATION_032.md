# Iteration 32 — honest pen capability and RDPEI negotiation

Date: 2026-10-10. Implements the Stage 5 pen placeholder from SPECIFICATION §2.5,
with capability honesty under ADR-008 / ADR-009 and unchanged ADR-011 scope.
Implementation commit: `26688c5`.

The public capability/CLI/decoded HELLO reports now explicitly say penInput=false,
including legacy peers. No new wire bit, pen command or synthetic mouse fallback
exists. The owned registration clears the public ENABLE_MULTIPEN_INJECTION mask
before Initialize, preserving all other feature bits. This corrects pinned
upstream's default UINT32_MAX mask, which otherwise accepts server multi-pen
despite the bridge having no pen owner or dispatcher.

Verification:

- Actual linked addin with fake DVC: owned registration and scoped-provider paths
  receive a multi-pen SC_READY, reply without multi-pen and retain touch readiness.
  The separate unowned upstream fixture remains unchanged. RDPEI now **64 cases /
  12,659 assertions**; bundled CTest **10/10**, /W4 /WX /analyze pass.
- Pure injected public-context test proves only the unsupported flag is cleared.
  Browser Edge fixture sends pen Pointer Events before touch; no input is emitted.
- Actual XRDP private inventory still reports **ready / ten contacts**, with
  heartbeat and JPEG. No contact was sent. Public browser H.264/JPEG readiness and
  replay evidence from the preceding block is [Iteration 31](ITERATION_031.md).
- Bundled pnpm check **139/139**, no skipped/cancelled tests, **107.80 s**;
  foundation CTest **4/4** passed. Actual worker HELLO/CLI/build REST consistency
  and the explicit false pen capability are verified by lifecycle integration.

Logs: ignored build/iteration-032-*.log. Pen is explicitly unsupported; optional
future pen remains. Physical/remote touch, no-stuck acceptance, timestamp/v1.0,
same-plugin reopening, upstream resource/reassembly limits and platform/soak gates
remain open. No FreeRDP source/pin or deployment/antivirus policy is modified.

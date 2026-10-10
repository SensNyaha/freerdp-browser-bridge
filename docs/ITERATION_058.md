# Iteration 58 — Windows worker selects bounded priority output

Date: 2026-10-10. Implements ARCHITECTURE §11/12, SPECIFICATION §3.1/3.3 and the
native writer activation prerequisite for Stage 6. Continues Windows driver
`6636e32`. Audio playback remains disabled; no new HELLO capability/config flag.

Both Windows foundation and bundled workers now route output through the bounded
driver instead of holding the global stdout mutex across synchronous writes.
Control admission retries only queue-mutex contention for at most 50 ms; full,
invalid, closed or expired admission fails with a fixed IPC error. The separate
writer emits control/audio/cursor ahead of queued video, with one whole-record
deadline. This cannot preempt an already writing record. Linux retains its current
framed stdio path and its unverified transport/priority gates.

The connection scope retires and joins all RDP producers before output finish.
Graceful shutdown/EOF drains accepted output before releasing the pipe owner.
Failure preserves in-flight spans until cancellation completes, and Node's
watchdog/forced cleanup remains the outer boundary. No per-session secret enters
outbound queues; incoming secret/config/request kinds remain refused.

Verification:

- Narrow foundation handshake/REST/malformed checks **3/3**.
- Foundation 100 sequential workers, parent death and raw paused-output flood
  **3/3**, without leaked processes/directories. The flood proves bounded admission
  failure; it does not identify a pipe timeout. Actual pipe timeout is separate
  native coverage in iteration 57.
- Bundled CTest **14/14**, foundation CTest **6/6**, bundled `pnpm check`
  **163/163** (zero skips, 113.67 s), /W4 /WX /analyze, clang-format and diff checks.
- Actual authorized XRDP / Edge H.264 reset + resize/replay/restoration: **43**
  rendered frames, one decoder reset, cursor replay, display generations 2→3→4,
  1920×1080→1280×720→1920×1080. JPEG: **35** rendered frames with the same display
  resize/restoration and cursor replay. Each helper sends only one pointer motion
  and four input resets; no keyboard/buttons/wheel/text/touch.

Logs: ignored `build/iteration-058-*.log`; local protected media metric artifacts
remain in Git-ignored `.local-tests/`. No before/after performance claim or 30-minute
soak acceptance is made. Native PCM source reset-to-queue barriers, RDPSND worker
configuration/provider/channel retirement, Node/browser audio delivery, audible
RDP/microphone, Linux and resource/soak acceptance remain open.

# Iteration 398 — actual owned desktop input and two RDP sessions

2026-10-21. Continues the MVP input/limited-concurrency requirements using only
the user-requested synthetic Linux stand. No external host is changed.

The first active H.264 soak has 53 samples through 1,568,247 ms (26.14 minutes),
1,584 frames, peak worker RSS 151,810,048 bytes, at most one queued frame /
2,548 bytes and no observed error. Its tool handle is missing after continuation;
an authoritative process inventory confirms its Node/worker are absent. There
is no completion/cleanup receipt, so this is **not** a 30-minute pass. The
server container remains alive. No automatic restart is inferred from elapsed
time alone. Original evidence: `build/iteration-397-owned-active-soak.log`.
Its stale runtime directory is retained rather than deleted to hide the result.

The owned `--owned-pointer-test` mode reuses the existing public viewer and
fixed pointer sequence. F2 selects the prepared application's scalar snapshot;
a bounded Docker/X11 PRIMARY reader obtains only that fixed result from the
ID/label-verified own container. This is an application readback, explicitly
**not CLIPRDR or host Clipboard API acceptance**. The mode refuses the external
default lab before loading credentials. No screenshots or event history are used.

Actual public input passes with the existing Release worker:

- left/right/middle down/up and movement;
- actual movable canvas object drop, 576×324 pixels, with displacement recorded
  only on button release;
- real content scrolling both directions on both axes, two steps each;
- left-button blur release and middle-button detach/fresh-token release;
- balanced final button counters `[4,2,1]` / `[4,2,1]`, zero held bits;
- subsequent cursor/replay and joined cleanup, exit 0.

Log: `build/iteration-398-owned-pointer-repeat.log`. Initial attempts remain:
the new explicit mode was mistakenly blocked by the helper's existing read-only
input gate; after fixing that test-only selection, the fixture's horizontal
wheel handling required Shift-wheel support. The initial successful drag and
vertical scroll receipt is retained, without claiming horizontal acceptance.
The ordinary external read-only scenario keeps its original restriction.

The separate private Node/native two-session control initially uses the same
account and observes server replacement of the first client. Separate synthetic
accounts then pass distinct simultaneous PIDs/desktops (1920×1080 / 1280×720),
five captures and heartbeat rounds each. After terminating the second owner,
the first supplies three more frames/heartbeats. Both PIDs retire, all close
promises join and runtime is empty. Log: `iteration-398-owned-pair-repeat.log`.
This is short private native coexistence/isolation, not two browser/media/audio
sessions or sustained concurrency. Setup now prepares the second account through
the same private-stdin random-password mechanism. No password is logged.

The actual held-input loss control proves Ctrl and left mouse down in X11,
interrupts the RDP relay, then observes both still held. A subsequent fresh RDP
connection clears Ctrl but leaves the mouse button held. Logs:
`iteration-398-owned-held-visible.log`, `iteration-398-owned-reconnect-input.log`.
This exposes missing initial remote button clearing; local tracked state starts
empty. The user explicitly accepts for production that a hard TCP loss cannot
deliver release and requires clearing on the next client connection, while live
blur/detach still requires release. The initial immediate-release assertions
remain as failure history. New-connection clearing is the next native correction,
not accepted by this test preparation alone.

The added fixed X11 input-state parser and target/size/refusal focus pass 12/12;
one subsequent run overlaps an eight-thread native build and exceeds the existing
five-second CLI-child deadline (11/12). Its unchanged isolated repeat passes
12/12 in 3.01 seconds; no deadline or assertion is relaxed. Both logs remain.
script syntax/ESLint/Prettier and diff checks pass. No production/native change
is accepted in this block; pending initial-pointer code belongs to its next
verified build. Current Windows full baseline remains [396](ITERATION_396.md).

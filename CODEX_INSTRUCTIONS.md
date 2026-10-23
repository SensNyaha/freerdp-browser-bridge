# Instructions for Codex implementation

## 1. Working method

Treat this documentation package as the implementation contract. Start at `TODO.md` Stage 0 and proceed sequentially unless a stage explicitly allows parallel work.

For every non-trivial task:

1. inspect existing code before editing;
2. state the exact requirement/ADR being implemented in the commit message or PR body;
3. add/adjust tests in the same change;
4. run the narrow tests first, then relevant full suites;
5. update `TODO.md` only after the acceptance condition is actually met;
6. commit in small logical units; avoid giant end-of-stage commits.

## 2. Do not silently simplify requirements

In particular, do not:

- replace the native worker with `spawn('xfreerdp', ...)` as the final architecture;
- pass session passwords on command line;
- send screenshots as base64 JSON;
- render cursor into every video frame by default;
- omit device redirection because the test environment lacks hardware;
- claim browser USB/smartcard is supported without a companion or explicit browser-virtual implementation;
- turn off certificate validation to make tests pass;
- expose arbitrary FreeRDP command-line options to browser callers;
- use unbounded queues;
- add a persistent database for user profiles; that belongs to the future web application.

## 3. Compatibility-first native code

Pin and target FreeRDP 3.32.1. Prefer public API. Guard optional compile-time channel code with feature macros and surface it through capability reporting.

Do not make assumptions from old FreeRDP 2 examples when 3.x APIs differ. Use current headers/source in the pinned dependency as the authoritative interface.

## 4. Error handling

Check return values from FreeRDP/WinPR APIs. Treat nodiscard warnings as meaningful. Convert native failures into stable bridge error codes and preserve a human diagnostic message without secrets.

## 5. Definition of done per item

A TODO checkbox can be checked only if:

- implementation exists;
- unit test exists where logic is testable;
- integration test exists where protocol/device behavior requires it;
- relevant docs/schema reflect reality;
- no known critical TODO is hidden in code comments.

## 6. Commit discipline

Recommended commit granularity examples:

```text
build: pin FreeRDP 3.32.1 and required channels
native: add worker hello/heartbeat IPC
api: add session create lifecycle
media: expose FreeRDP framebuffer dirty revisions
media: add H264 encoder abstraction
web: decode H264 in reference harness
input: add keyboard scancode state machine
rdpsnd: add browser audio sink
rdpdr: add managed sandbox drive
```

If a change spans unrelated subsystems, split it.

## 7. Performance discipline

Before optimizing, instrument. Do not introduce shared memory, custom lock-free queues or WebRTC merely because they might be faster. The documented v1 design already avoids the dominant waste: raw frames in JS and cursor-driven video encoding.

Any optimization that complicates correctness must include before/after measurements listed in `PERFORMANCE.md`.

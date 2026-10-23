# Iteration 111 — private microphone reset on RDP owner

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
versioned reset contract `07dd347`.

Guarded Windows/AUDIN emits the schema-1 HELLO extension and advertises private
microphoneReset. An independent fixed ResetControl receives only admitted input
status under the existing microphone mutex. IPC queues one epoch/deadline request
and wakes the RDP owner. Owner service rechecks actual open source/epoch, clears
queued samples and advances the source before servicing pending PCM. Reset does
not perform transport writes under the mutex; fresh ready publication authorizes
new samples. Ending drains pending reset as unavailable before source retirement.

Private WorkerProcess.resetMicrophone returns typed results, refuses old peers
without sending the new command, excludes concurrent sample/reset requests and
pauses the scheduled epoch until fresh ready input. Results are validated before
correlation completes. No automatic reset/sample retry or public capture path is
introduced. NativeSessionWorker still refuses non-off public microphone selection.

The new actual-linked AUDIN/fake-DVC case passes **55 assertions**, covering
clear/reset/publication backpressure, stale/fresh samples, duplicate reset,
exact expiry and terminal refusal. Focused Node checks pass **16/16**. New fake IPC checks cover
legacy capability, epoch renewal, one-flight/shutdown, scheduled pause, typed
refusal, malformed/duplicate results. Actual native strict TLS refusal checks
capability and unavailable reset without device activation.

The first linked test build needed its explicit ResetControl library dependency.
After fixing that, Kaspersky classified the new C++ IPC fixture EXE as
VHO:Trojan.Win32.Agentb.gen (cloud analysis, event 302), removing/blocking it
before vcpkg applocal; two retries confirmed the environment failure. No protection
settings/exclusions/quarantine were changed. The additional synthetic scenarios
now run through an explicit audited Node fixture and a protected process-creation
test seam. Default native spawning still uses exactly the worker path and no argv.
The original C++ fixture remains unchanged; actual native process and actual-linked
FreeRDP tests remain native. With this workflow bundled build/CTest passes 17/17.
Foundation CTest passes **6/6**, full bundled `pnpm check` **303/303** without
skips. MSVC /W4 /WX /analyze, clang-format and diff checks pass.

These fixtures use synthetic PCM, not real microphone capture or application
acceptance. Public lease/media/permission/resampling/Opus input, connected-worker
latency, upstream allocation/lost-write limits, real remote/physical/LAN/platform
acceptance remain open. [Reset contract](MICROPHONE_RESET.md).

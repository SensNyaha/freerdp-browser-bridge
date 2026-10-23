# Iteration 351 — Display Control IPC and media regression after Windows smoke

2026-10-20. After the named private Windows RDP resize/restoration in
[iteration 350](ITERATION_350.md), the current Node 24.21.0 local suites pass:
display-worker IPC **10/10** and media/control WebSocket **26/26**. Coverage
includes negotiated display state, observation-before-applied ordering,
generation changes, unchanged/invalid/busy outcomes, timeout, late observation,
disconnect cleanup, resize epoch/config/IDR behavior, ACK preservation, and
stale frame/credit refusal.

These suites use fake workers and transport fixtures. They confirm the local
composition around the new private Windows result, not the public Edge viewer
against that RDP server. The H.264 browser resize/restoration remains open until
its separately authorized lab run. No production source, Release artifact,
dependency, or server setting changed in this verification.

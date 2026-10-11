# Iteration 126 — production browser microphone startup owner

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
Edge socket composition `afa1962`.

The startup owner creates/resumes a single context in the gesture before device
permission, then requests server grant and initializes the graph. Pending
permission/source/controller loss and denial close context without late
activation. Finite cleanup joins context/graph, server, resume and activation;
unresolved or failed cleanup cannot allow repeated resource acquisition.

Focused **10/10** pass: seven pure lifecycle cases and three actual Edge / WS /
fake RDP cases now use the production owner. Edge covers successful capture and
stop, controller loss with held worker API PCM completion, and permission denial
without grant/samples/reset. getUserMedia is replaced and all streams are
synthetic; no physical capture, OS dialog or private native AUDIN is established.

An initial reentrant observer test hung because completion notification called
stop again, producing another asynchronous notification without owned resources.
Only the identified test process was terminated after checking its PID/file;
stop now emits no fresh notification when it has no prepared resources. The
corrected pure **7/7** and full focused **10/10** pass.

Full `pnpm check`: **397/397** pass. Native CTest: bundled **17/17** and
foundation **6/6** pass; no native source changed in this block.

Reference-viewer/native selection, physical/device/remote/LAN/platform, native
resampling, Opus input and upstream limits remain open.
[Current contract](MICROPHONE_OWNER.md).

# Iteration 158 — bounded DVC entry-point registry

Date: 2026-10-12. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §12 after
`8e22c2a`. Public entry capture, original GetPlugin projection, delayed host
publication, inert uncertain-failure proxies and a shared listener manager form
the full tested DVC ownership chain. [Contract and retained gates](DVC_PLUGIN_REGISTRY.md).

Seven new public/generic fixtures and one actual drdynvc/fake-SVC fixture pass.
Linked DVC suite **105 cases / 6,877 assertions**, bundled CTest **18/18**,
foundation **7/7**, MSVC /analyze /W4 /WX. An initial test compile caught an
incomplete rdpContext definition and deprecated unbounded strcpy; corrected with
the public definition and bounded copy before the native gates passed.
No dependency/source/pin/ABI/wire/capability changes. Provider/worker placement,
actual allocator faults and remote aggregate/cached/nested resource acceptance
remain open.

Initial full Node gate finished **497/498**, one failure, zero cancellations:
an existing Opus viewer Stop action saw its button hidden. Exact-case rerun
**1/1** and whole fixture **12/12** pass; root cause remains unestablished.
Bounded failure diagnostics are added without weakening assertions/deadlines.
[Fixture evidence](MICROPHONE_VIEWER_FIXTURE.md), diagnostic commit `814a266`.
Full bundled gate retry passes **498/498**, zero failures/cancellations. The
original intermittent failure remains recorded; no product cause/fix is claimed.

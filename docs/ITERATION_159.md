# Iteration 159 — scoped production DVC ownership and admission

Date: 2026-10-12. Implements SPECIFICATION §3.1/3.3 and ARCHITECTURE §11/12 after
`eb2549e`. The complete public entry/plugin/manager/listener/channel chain is now
selected by the worker's scoped provider. Known logical declarations reserve a
fixed aggregate budget before native allocation; independent bridge faults and
deadlines are checked around dispatch/event batches. Teardown retires callback
targets before original plugin state can be freed. [Contract](DVC_PROVIDER.md).

Five new provider cases and one actual drdynvc/fake-SVC case pass; linked DVC suite
**111 cases / 7,001 assertions**, bundled CTest **18/18**, MSVC /analyze /W4 /WX.
No source/pin/SDK ABI/public wire/capability change. The tested provider was then
integrated in the worker and bundled CTest passed again. Total RSS/pool/nested codec,
Windows-server, Linux, sanitizers/fuzz/soak and actual resource/device gates remain
open. Foundation CTest **7/7**, bundled full `pnpm check` **498/498** with zero
failures/cancellations, and native relocation **1/1** pass.

Actual XRDP H.264/resize attempt ended before certificate challenge with zero
frames. A separate credential-free TCP connect to the authorized
192.168.21.149:3389 timed out after five seconds. The viewer runtime directory
is empty after cleanup. No actual XRDP compatibility of this new integration is
claimed; previous iteration 149 lab evidence remains historical. Other remote
checks were not launched against the same unavailable endpoint. Continue local
nested GFX/resource work while this external acceptance gate remains open.

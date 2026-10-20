# Iteration 354 — HTTP snapshots for selected remote failures

2026-10-20. The fake-backend Fastify integration test now checks that selected
remote timeout, logoff, server refusal and operational failure codes survive
manager failure handling and appear in `GET /v1/sessions/:id` with their exact
fixed public message and retryability. The existing disconnect, NLA-required
and replaced-session cases remain in the same table.

The focused session API integration suite passes **10/10** under the pinned
Node 24 runtime. Prettier and `git diff --check` pass. No production mapping,
IPC contract, Release artifact or dependency version changed. Fake-backend
propagation does not establish that a real server emits each ERRINFO reason;
actual reason emission and broader server profiles remain open.

# Iteration 357 — connection failure HTTP snapshots

2026-10-20. The fake-backend Fastify session failure test now verifies that
connection failure, authentication failure, certificate refusal, connection
timeout, connect cancellation and protocol failure each survive manager
handling into `GET /v1/sessions/:id` with the exact fixed public message and
retryability. The table also retains selected server-disconnect categories.

The focused session API integration suite passes **10/10** under Node 24.
Prettier and `git diff --check` pass. No production mapping, IPC contract,
Release artifact or dependency pin changed. This verifies API propagation for
fake-backend failure events; it does not prove real-server error emission.

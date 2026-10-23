# ADR-001: One native FreeRDP worker process per session

Status: Accepted

## Decision

Run each FreeRDP client session in a dedicated native worker process. Node.js does not host `freerdp*` in its own process.

## Consequences

Positive: crash/security isolation, event-loop safety, per-session resource limits, easier FreeRDP upgrades, simple session teardown. Cost: process/IPC overhead and more packaging work. This cost is accepted.

## Rejected alternative

One N-API addon holding all sessions: unacceptable failure blast radius and memory/thread ownership complexity.

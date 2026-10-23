# ADR-009: Pin FreeRDP exact patch release

Status: Accepted

## Decision

Initial implementation pins FreeRDP 3.32.1 exactly. Upgrades are deliberate and require full regression/device matrix.

## Rationale

FreeRDP is security-sensitive native protocol code with evolving APIs/features. Exact pinning makes builds reproducible and avoids untested ABI/behavior drift.

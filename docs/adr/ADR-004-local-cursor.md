# ADR-004: Transport cursor separately

Status: Accepted

## Decision

Send cursor shape/position independently and render in browser overlay by default.

## Rationale

Pointer motion should not require video encoding; improves latency and bandwidth.

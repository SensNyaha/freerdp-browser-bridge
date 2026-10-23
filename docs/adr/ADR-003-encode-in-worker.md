# ADR-003: Encode media before Node boundary

Status: Accepted

## Decision

Video/audio encoding occurs in the native worker. Node forwards compressed payloads.

## Rationale

Avoid multi-megabyte BGRA copies through JS, reduce GC pressure, keep codec/data locality, simplify backpressure.

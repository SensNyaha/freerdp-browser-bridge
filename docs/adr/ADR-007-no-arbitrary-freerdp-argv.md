# ADR-007: No arbitrary FreeRDP command-line passthrough

Status: Accepted

## Decision

Map validated API fields to FreeRDP settings/addin APIs. Do not expose a browser field containing arbitrary `/option` strings or executable helpers.

## Rationale

Prevents injection, secret leakage, accidental unsupported configurations and uncontrolled channel/helper activation.

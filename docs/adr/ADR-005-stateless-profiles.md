# ADR-005: Bridge does not own connection profiles

Status: Accepted

## Decision

Core bridge accepts normalized session configuration and keeps runtime state only. Future web application owns user profiles/preferences.

## Rationale

Prevents UI/product storage concerns from coupling to transport/session service. Persistent bridge state is limited to deployment policy/trust/audit as needed.

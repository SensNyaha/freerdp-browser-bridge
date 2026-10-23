# ADR-006: Explicit device origin model

Status: Accepted

## Decision

Every redirected device declares an origin: `bridge-host`, `browser-virtual`, or `companion`.

## Rationale

Browser sandbox limitations make generic physical USB/smartcard/serial passthrough impossible to promise from a remote web page. The capability model must be truthful and composable.

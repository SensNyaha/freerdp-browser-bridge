# Iteration 349 — replaced-session error reaches the public snapshot

2026-10-20. The fake-backend HTTP regression now also injects
`RDP_SESSION_REPLACED` and checks the exact fixed message and
`retryable: true` result returned by `GET /v1/sessions/:id`. Together with
the existing `RDP_SERVER_DISCONNECT` and `RDP_SECURITY_MODE_REQUIRED` cases,
the route preserves the distinct public classification and retryability of all
three tested remote terminal codes.

Node 24.21.0 session API integration passes **10/10**. ESLint, Prettier check,
and `git diff --check` pass. No production code, wire contract, native source,
Release artifact, dependency pin, or RDP host was changed. This is fake-backend
HTTP evidence and does not establish that a remote server emits a replacement
reason. The earlier manager and HTTP propagation coverage is in
[iteration 348](ITERATION_348.md).

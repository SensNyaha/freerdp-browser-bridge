# Iteration 3 — session registry and authorized API

Date: 2026-10-08. Platform: Windows x64.

Implemented Stage 2: owner-scoped lifecycle, bounded admission/retention,
channel-scoped attach credentials, authenticated REST, Origin-checked WebSocket
upgrades, state/error events, redacted logging and baseline metrics.
See SESSION_API.md for the contract and remaining native backend boundary.

The Windows Stage 1 lifecycle gate permits the independent Stage 2 fake-backend slice.
Linux Stage 0/1 acceptance remains open. Continuing user-authorized development
does not count those gates as passed.

Dependency updates pin Fastify 5.12.5, ws 8.22.0, pino 10.4.0 and prom-client 15.1.3.
Production dependency audit reported zero known advisories.

Validation: pnpm check passes types/lint/format and 32/32 Node tests with bundled
native workers. Existing CTest passes four cases/43 assertions. Native bundle
relocation passes with private ZLIB/FreeRDP runtime paths.

Session API tests use explicit fake backends. Native lifecycle tests use actual
C++ processes. Real RDP, certificate prompts, graphics, input, audio and devices
are not implemented or claimed by this iteration.

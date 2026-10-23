# ADR-002: WebSocket-first browser media transport

Status: Accepted for v1

## Decision

Use separate secure control and binary media WebSockets. H.264/Opus are encoded in the worker and forwarded by Node. Keep a transport interface that can add WebRTC later.

## Rationale

Simpler self-hosting and debugging, no ICE/TURN requirement, sufficient for primary LAN/VPN use when queues are bounded.

## Constraint

If lossy-network tests show unacceptable TCP head-of-line latency, evaluate WebRTC in Stage 11 without changing FreeRDP/session logic.

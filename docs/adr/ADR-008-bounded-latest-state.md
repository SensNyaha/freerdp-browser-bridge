# ADR-008: Bounded queues and latest-state video scheduling

Status: Accepted

## Decision

Desktop framebuffer is authoritative state. When encoder/network is behind, discard obsolete pending video work and recover with newest state/keyframe. Audio/control have higher queue priority.

## Rationale

For interactive remote desktop, seconds of perfectly preserved old frames are worse than dropping them. Latency is the primary QoS objective.

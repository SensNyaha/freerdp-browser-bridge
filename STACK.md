# Selected implementation stack

## 1. Runtime split

### Control plane

- **Node.js 24 LTS**
- **TypeScript** with `strict` enabled
- **Fastify 5** for HTTP lifecycle/capability API
- **ws** for WebSocket control/media endpoints initially
- **TypeBox + JSON Schema** for request/response validation and generated API schemas
- **pino** for structured logging
- **prom-client** for Prometheus metrics

Reason: the bridge's public contract is naturally event-driven and Node.js is well suited for connection/session orchestration. TypeScript reduces protocol-shape mistakes. Fastify gives predictable lifecycle hooks and schema validation without a large framework.

### Native session worker

- **C++20** for bridge-owned native code, with C-compatible boundaries around FreeRDP
- **FreeRDP 3.32.1 pinned exactly for the first implementation**
- **WinPR** from the same FreeRDP build
- **CMake + Ninja**
- **libavcodec/libavutil/libswscale** as codec abstraction where licensing/build policy allows
- **OpenH264 or hardware H.264 encoders** as the preferred AVC provider; `libx264` only in builds whose redistribution policy permits GPL components
- **libopus** for compressed audio transport
- **libusb** for URBDRC
- **PC/SC** for smart-card support
- **CUPS** for bridge-host printer passthrough where available

FreeRDP must be built with client channels required by this project, including AUDIN, CLIPRDR, DRIVE/RDPDR, PRINTER, SERIAL, PARALLEL, SMARTCARD, RDPSND, DRDYNVC and URBDRC. Optional features such as RDPECAM/RDPEWA are feature-detected.

## 2. Why not one giant N-API addon

A direct N-API wrapper around a long-running `freerdp*` session is rejected as the primary design because:

- a native crash would terminate the Node service and all sessions;
- FreeRDP callback/event threading can block or complicate Node's event loop;
- binary ABI coupling makes upgrades harder;
- memory ownership across JS/C becomes a major failure surface;
- per-session process resource limits and sandboxing are lost.

A very small N-API module may be added later for shared-memory notification primitives, but it must not own the RDP session.

## 3. Node ↔ worker transport

Primary implementation: **Unix domain `SOCK_SEQPACKET` on Linux** with a documented framed-stream fallback for platforms lacking it. Messages are binary, length-delimited and versioned.

Why not JSON for the worker boundary: high event rate, cursor/media metadata, strict bounds and low allocation overhead. Control payloads may use compact CBOR or fixed structs; media payloads are opaque bytes.

Production video and audio are encoded in the worker before crossing IPC. Node forwards encoded payloads to the browser with minimal transformation.

## 4. Browser media transport

### Baseline v1

- secure WebSocket control channel;
- secure WebSocket binary media channel;
- H.264/AVC access units decoded using WebCodecs where available;
- Opus decoded using WebCodecs/AudioWorklet path where available;
- PCM fallback for audio;
- JPEG/WebP diagnostic/fallback desktop mode when WebCodecs AVC is unavailable.

### Optional v2 transport

A transport abstraction shall permit WebRTC later for lossy-network behavior and congestion control. WebRTC is not required to unblock v1 and must not be allowed to infect FreeRDP/session logic.

Reason for WebSocket-first: one deployable server, no ICE/TURN/SFU requirement, simpler debugging, and sufficient performance for LAN/VPN/self-hosted usage when queues are aggressively bounded.

## 5. Testing stack

- Node: built-in `node:test` or Vitest; choose one and use it consistently. Recommendation: **Vitest** for TS ergonomics.
- Native: **Catch2 v3 + CTest**.
- Browser: **Playwright** reference harness.
- Protocol fuzzing: clang `libFuzzer` for native IPC parsers and FreeRDP-facing adapters owned by this project.
- Sanitizers: ASan/UBSan in CI debug job; TSan on selected worker tests where practical.

## 6. Packaging

Recommended repository layout:

```text
/
  package.json
  pnpm-workspace.yaml
  CMakeLists.txt
  apps/
    bridge-api/              # Fastify + WS
    browser-harness/         # minimal test client, not product UI
  native/
    rdp-worker/
    plugins/
      rdpsnd-browser/
      audin-browser/
      printer-spool/
    ipc/
    media/
  packages/
    protocol/                # TypeScript protocol types/schemas
    config/
  docs/
  tests/
    integration/
    fixtures/
  docker/
```

Use **pnpm** for JS workspace dependency determinism. Keep native dependencies system/package-manager based or built in a pinned builder image; do not download arbitrary binaries at runtime.

## 7. Version policy

- Pin FreeRDP exact patch release in the builder image/lock metadata.
- Upgrade FreeRDP deliberately, running full integration and device matrix.
- Never compile against headers from one FreeRDP patch and run against an unverified different ABI package.
- Expose `GET /v1/build` with bridge version, git commit, FreeRDP version and feature flags.

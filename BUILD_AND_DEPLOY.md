# Build, packaging and deployment

## 1. Supported baseline

First-class build target:

- Ubuntu 24.04/26.04-class Linux x86_64 host/container environment;
- Node.js 24 LTS;
- FreeRDP 3.32.1 pinned;
- modern CMake/Ninja toolchain;
- OpenSSL supported by FreeRDP;
- optional libusb, PCSC, CUPS, FFmpeg/OpenH264, libopus depending feature set.

Exact distro package names belong in `docker/` and CI scripts because they vary by distribution.

## 2. FreeRDP build profile

Create a reproducible CMake preset/container layer that enables required client channels and disables unnecessary GUI clients if they are not used by tests. Preserve licensing notices.

Build output should include FreeRDP/WinPR shared libraries and the bridge worker. Pin source tag + checksum/commit.

Expose compile-time feature report in build logs and `/v1/build`.

## 3. Docker image strategy

Multi-stage image:

1. native builder: FreeRDP + worker;
2. Node builder: install pnpm lock, compile TS;
3. runtime: only runtime libraries, bridge JS, worker, minimal tools.

Runtime rules:

- non-root user;
- read-only root filesystem where possible;
- writable `/run/freerdp-bridge` and optional persistent trust/audit path;
- no Docker socket;
- no privileged mode;
- optional device mounts for `/dev/bus/usb`, `/dev/dri`, serial devices only when needed;
- optional PCSC socket mount if smartcard deployment uses host pcscd.

## 4. Reverse proxy

Terminate HTTPS at Nginx/Caddy/Traefik or Node in simple deployments. Requirements:

- WebSocket upgrade support;
- long-lived connection timeouts;
- access log query-token redaction;
- request body streaming for files;
- upload limits aligned with bridge policy.

## 5. Configuration

Environment/config file controls deployment policy, not individual RDP secrets. Example categories:

```text
BRIDGE_LISTEN_HOST
BRIDGE_LISTEN_PORT
BRIDGE_PUBLIC_ORIGIN
BRIDGE_MAX_SESSIONS
BRIDGE_SESSION_RUNTIME_DIR
BRIDGE_MAX_UPLOAD_BYTES
BRIDGE_ALLOWED_HOST_CIDRS
BRIDGE_ALLOW_HOST_PATH_DRIVES
BRIDGE_ALLOWED_HOST_PATH_ROOTS
BRIDGE_ALLOWED_SERIAL_DEVICES
BRIDGE_ENABLE_USB
BRIDGE_ENABLE_SMARTCARD
BRIDGE_ENABLE_CUSTOM_CHANNELS
BRIDGE_ALLOWED_STATIC_CHANNELS
BRIDGE_ALLOWED_DYNAMIC_CHANNELS
BRIDGE_TRUST_STORE_PATH
BRIDGE_LOG_LEVEL
```

Do not place per-session RDP passwords in environment variables.

## 6. Graceful updates

Recommended behavior:

- readiness goes false before shutdown;
- reject new sessions;
- allow active sessions a configurable drain window;
- then close workers gracefully;
- process manager/container restarts service.

Session migration between bridge instances is out of v1 scope because RDP client state is not trivially serializable. Load balancers must use session affinity for WS connections.

## 7. Diagnostics

`GET /v1/build`:

- semantic version;
- git commit;
- Node version;
- FreeRDP version;
- protocol version;
- enabled channels;
- codec providers;
- OS/arch.

`/metrics` must avoid secrets/high-cardinality session IDs by default. Per-session debug stats can be available through authenticated session API.

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

The pinned Linux WinPR profile requires private Kerberos and ICU for its default
authentication/Unicode implementations. These are Linux-only manifest entries;
`build-freerdp.mjs` selects the local `krb5-config` and requires local ICU paths.
Linux builder prerequisites include Bison for the Kerberos source grammar.
[Historical dependency checkpoint](docs/ITERATION_186.md).
Linux now also builds private CUPS 2.4.20, libfuse 3.18.3 and numactl 2.0.19;
linked Release CTest and the current codec/lifecycle relocation probe pass.
Pinned private eudev 3.2.14 now resolves libusb's udev dependency. Before Linux
CPack, every shipped ELF executable/library passes bounded canonical dependency
and origin-relative loader-path checks. Canonical relocated codec/lifecycle and
libudev-context checks pass. This is separate from clean-machine/device acceptance.
[Build evidence](docs/ITERATION_187.md), [closure evidence](docs/ITERATION_189.md).

Expose compile-time feature report in build logs and `/v1/build`.

## 3. Docker image strategy

Current runtime: [artifact-based API/native service image](docs/CONTAINER_RUNTIME.md).
The final non-root/read-only image and separate host/native HTTP fixture pass
locally on Bookworm. Source/native building and frozen Node installation remain
upstream steps; fresh-checkout/distro and CI execution are still open. Historical
foundation/native-only checkpoints below retain their original scope.

Multi-stage image:

1. native builder: FreeRDP + worker;
2. Node builder: install pnpm lock, compile TS;
3. runtime: only runtime libraries, bridge JS, worker, minimal tools.

Runtime rules:

- non-root user;
- an init/subreaper that reaps adopted child processes when the service is PID 1
  (Docker `--init`, Compose `init: true`, or an equivalent supervisor);
- read-only root filesystem where possible;
- writable `/run/freerdp-bridge` and optional persistent trust/audit path;
- no Docker socket;
- no privileged mode;
- optional device mounts for `/dev/bus/usb`, `/dev/dri`, serial devices only when needed;
- optional PCSC socket mount if smartcard deployment uses host pcscd.

Actual Linux foundation verification passes under UID 1000, read-only root,
bounded runtime tmpfs, dropped capabilities and the default Docker seccomp
profile with init. Without init, an exited orphan worker remained a zombie;
this is a failed cleanup condition. [Evidence and retained deployment gates](docs/ITERATION_185.md).
The local verification image contains build/test tools and no linked FreeRDP;
it does not satisfy the multi-stage production service-image requirement above.

An independent native-only TGZ check now passes in a pinned Node 24 Bookworm
image without SDK/system FreeRDP/libudev, under UID 1000 and the restricted
runtime flags above. The probe checks canonical private modules, codecs and real
worker lifecycle/cleanup. This verifies the archive, not the complete API/service
deployment image. [Evidence and reproducible checks](docs/ITERATION_190.md).

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

Linux application/native packages now have a separate schema-validated SPDX 2.3
companion generated from the exact archives and supplied vcpkg provenance.
Base OS/Node distribution and Windows runtime inventory remain open.
[Generation and scope](docs/SBOM.md), [evidence](docs/ITERATION_214.md).

The private bundle also includes pinned libopus 1.6.1 and its BSD copyright.
Its 20 ms encoder now supports explicit public Opus output with gesture-gated
AudioDecoder/Worklet playback and native epoch recovery; audible RDP acceptance
remains open. See [public contract](docs/AUDIO_OPUS_PUBLIC.md).
The relocation probe checks real Opus encode/decode and the loaded
private DLL/version. The local version-fix overlay and hash ship alongside build
metadata. See [Opus foundation](docs/AUDIO_OPUS.md).

The current Windows native bundle includes private libjpeg-turbo/libspng and
OpenH264 DLLs and licenses. The relocation test performs actual JPEG and AVC
roundtrips, FreeRDP AVC420 decoding and checks the loaded module locations. The OpenH264 overlay and
its patch checksum ship with build metadata; see [native AVC contract](docs/MEDIA_H264.md).
The diagnostic browser check uses pinned Playwright core
and an already installed Edge; browser binaries are not part of the runtime bundle.
See [JPEG media contract](docs/MEDIA_JPEG.md) for the local harness test.
The same helper accepts `h264` and `h264-reset` modes. They verify actual
WebCodecs rendering and decoder-error recovery with fresh config/IDR, using the
previously approved exact lab fingerprint. No browser binaries ship in the package.
The helper also verifies pointer motion and detach reset through the native input
API. It explicitly forbids keyboard, button and wheel input on the operational
lab desktop. [Input fixture and wire contract](docs/INPUT.md) cover broader input
tests; their remote keyboard-layout acceptance remains pending.

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

The Windows CMake build probes the installed MSVC `/showIncludes` language using
UTF-8 decoding for Ninja dependency tracking. This works with the Russian-only
compiler installation and does not require an English language pack. The first
build using the correction recompiles old objects so header/ABI changes cannot
retain stale callers. See [Iteration 9](docs/ITERATION_009.md) for evidence.

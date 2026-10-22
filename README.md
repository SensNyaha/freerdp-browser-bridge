# FreeRDP → Browser Bridge

Latest stable: **0.2.0**, tag `v0.2.0` (GCC 8.3 port and named Astra/RED OS
desktop profiles). [Release evidence and limits](docs/ITERATION_418.md).
The original named practical MVP remains the immutable `v0.1.0` baseline.

Prepared: 2026-10-07  
Target baseline: FreeRDP 3.32.1, Node.js 24 LTS, Linux x86_64 first

The implemented MVP is [accepted](docs/MVP_ACCEPTANCE.md), with a
[tested launch runbook](docs/MVP_RUNBOOK.md). The remaining original V1 scope
is preserved in TODO. See [release notes](CHANGELOG.md) and
[version/branch policy](docs/VERSIONING.md). A version number alone does not
make an untagged feature build the stable release.

Delivery planning: [npm/Fastify on the existing application port and standalone
release options](docs/DISTRIBUTION_OPTIONS.md). Fastify targets 0.2.1 on its own
feature branch; these proposed interfaces are not implemented in 0.2.0.

## 1. Purpose

This package defines a cross-platform bridge that uses FreeRDP as the RDP protocol implementation and exposes a browser-consumable API for remote desktop image, cursor, audio and input. The bridge is not a Remmina clone and does not include a full visual application. A future web client may implement a Remmina-like UI on top of the API described here.

Explicit user requirement (2026-10-14): the reference WEB visualization must also
demonstrate manual RDP host/settings and username/password entry, an interactive
certificate decision, and Remmina-like connection actions. This extends the
integration harness into a reusable connection UI example; the original exclusion
of a full production application/profile store remains. Unsupported backend
features must remain explicit rather than being silently enabled by a UI control.
[Manual WEB example and launch](docs/WEB_CONNECTION_EXAMPLE.md).

The implementation must preserve broad FreeRDP capability coverage, including RDP Gateway/security/display options and device/channel redirection. Where the browser sandbox cannot expose a physical client device directly, the bridge must state the boundary explicitly and support one of three modes: bridge-host redirection, browser-mediated virtual redirection, or an optional local companion agent.

## 2. Required result

The first production-capable result is a service with these properties:

- creates and destroys isolated RDP sessions;
- connects through FreeRDP to Windows RDP and XRDP endpoints;
- delivers a low-latency desktop stream to a modern browser;
- delivers remote cursor shape/position separately from the video stream;
- accepts keyboard, mouse, wheel and touch input;
- delivers RDP audio output to the browser and accepts microphone input when enabled;
- supports clipboard and file transfer;
- supports FreeRDP device redirection: drives, printers, smart cards, serial/parallel ports, USB/URBDRC and other enabled channels where technically possible;
- exposes Remmina-like connection settings without reproducing Remmina UI;
- is safe for concurrent multi-session use;
- is containerizable and observable;
- keeps native crashes and untrusted RDP parsing outside the Node.js process.

## 3. Recommended reading order for Codex

1. `SPECIFICATION.md` — normative product requirements.
2. `ARCHITECTURE.md` — target component architecture and data flows.
3. `STACK.md` — selected technologies and rationale.
4. `CONFIG_SCHEMA.md` — session configuration contract.
5. `PROTOCOL.md` — REST/WebSocket/native IPC contracts.
6. `FREERDP_MAPPING.md` — mapping to FreeRDP features/settings.
7. `MEDIA_PIPELINE.md` — framebuffer, video, audio, cursor and backpressure.
8. `DEVICE_REDIRECTION.md` — complete redirection matrix and browser limitations.
9. `SECURITY.md` and `PERFORMANCE.md`.
10. `TEST_PLAN.md` and `BUILD_AND_DEPLOY.md`.
11. `TODO.md` — implementation order and acceptance gates.
12. `CODEX_INSTRUCTIONS.md` — rules for autonomous implementation.
13. `docs/adr/*` — architecture decisions that should not be silently reversed.

## 4. Core architectural principle

Do not embed a long-lived FreeRDP session directly into the Node.js event loop. Each RDP session runs in a dedicated native worker process linked to FreeRDP/WinPR. Node.js owns HTTP/WebSocket APIs, authentication hooks, session lifecycle, browser protocol, rate limits and observability. The native worker owns FreeRDP, codecs that must be close to the framebuffer/audio pipeline, device channels and RDP event processing.

This boundary is intentional: malformed RDP input, native memory bugs or a codec crash must terminate at most one session worker, not the whole service.

## 5. Non-goals

The documentation does not require:

- a production web UI;
- profile management UI;
- a desktop GUI;
- Electron;
- reimplementation of RDP in JavaScript;
- proxying arbitrary USB/smart-card devices attached to a remote browser machine without a local companion agent.

A minimal browser harness for integration testing is allowed and expected.

## 6. Source of truth and conflict order

When implementation documents conflict, use this priority:

1. latest explicit user requirement;
2. `SPECIFICATION.md`;
3. accepted ADRs in `docs/adr/`;
4. `ARCHITECTURE.md` and `PROTOCOL.md`;
5. `TODO.md`.

Any contradiction must be recorded in `TODO.md` under an explicit blocking decision instead of being silently resolved by Codex.

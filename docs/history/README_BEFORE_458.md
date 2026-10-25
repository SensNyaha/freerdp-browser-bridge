# FreeRDP → Browser Bridge

Latest accepted public release: **0.2.5**, standalone web service with portable
Windows/Linux distributions and MSI/DEB/RPM service installers. Full/native,
exact consumers, eight real desktop profiles and Windows/Ubuntu/Astra/RED OS
upgrade checks pass. [Local acceptance](../ITERATION_455.md).
All ten exact npm packages, all five OIDC workflows and all four fresh
Windows/Linux registry-only consumers pass; [public npm delivery](../ITERATION_456.md).
Automatic main-push installer publication, final file hashes and actual public
DEB/RPM upgrades on Astra/RED OS pass; [delivery acceptance](../ITERATION_457.md).
[Download standalone](https://github.com/SensNyaha/freerdp-browser-bridge/releases/tag/v0.2.5).

Previous public adapter delivery is **0.2.4**, tag `v0.2.4` (Express root
middleware, same-port HTTP/HTTPS/WS and aligned native runtimes). All ten npm packages and
five GitHub Releases are public; four fresh Windows/Linux registry-only
consumers pass. [Publication acceptance](iterations/401-450.md#iteration-441),
[release evidence and limits](../ITERATION_438.md).
HTTP 0.2.3, NestJS 0.2.2, Fastify 0.2.1 and the immutable `v0.2.0`
compiler/Astra/RED OS baseline is preserved.
The original named practical MVP remains the immutable `v0.1.0` baseline.

The separate test-candidate prerelease does not establish stable publication.

Prepared: 2026-10-07  
Target baseline: FreeRDP 3.32.1, Node.js 24 LTS, Linux x86_64 first

The implemented MVP is [accepted](../MVP_ACCEPTANCE.md), with a
[tested launch runbook](../MVP_RUNBOOK.md). The remaining original V1 scope
is preserved in TODO. See [release notes](../../CHANGELOG.md) and
[version/branch policy](../VERSIONING.md). A version number alone does not
make an untagged feature build the stable release.

Delivery planning: [npm/Fastify on the existing application port and standalone
release options](../DISTRIBUTION_OPTIONS.md). Fastify is accepted in 0.2.1
after separate feature/release branches; it is absent from 0.2.0.
NestJS **0.2.2**, built-in `node:http` **0.2.3** and Express **0.2.4** are
accepted after their own feature/release branches.
Real-project usage documentation belongs in `docs/`; the
[Fastify contract](../FASTIFY_PLUGIN.md) and
[real-project guide](../FASTIFY_USAGE.md) describe the accepted interface.
The [NestJS contract](../NESTJS_PLUGIN.md) and
[NestJS real-project guide](../NESTJS_USAGE.md) cover both host adapters.
The [HTTP contract](../NODE_HTTP_PLUGIN.md) and
[HTTP real-project guide](../NODE_HTTP_USAGE.md) cover raw HTTP/HTTPS servers.
The [Express contract](../EXPRESS_PLUGIN.md) and
[Express project guide](../EXPRESS_USAGE.md) describe root middleware mounting,
body-parser order and same-port upgrades for the 0.2.4 target.
[Host identity/cookie boundaries](../HOST_AUTHENTICATION.md) apply to all adapters.
[Framework selection and additional-adapter assessment](../FRAMEWORK_SELECTION.md)
distinguish tested adapters from unverified integration possibilities.
[Standalone service/installers](../STANDALONE.md) provide bounded JWT ownership,
approved destinations and a private runtime; their current public-delivery gate
is recorded in [0.2.5 acceptance](../ITERATION_455.md).
All eight **0.2.2** npm packages are public at exact accepted integrity;
fresh Windows/Linux registry-only NestJS consumers pass 15/15 each.
[Publication evidence](iterations/401-450.md#iteration-437). For 0.2.3, both runtimes are public
and seven JS packages are intentionally unpublished: the user archives 0.2.3
on 2026-10-24 and accepts the complete 0.2.4/0.2.5 deliveries instead. Its tag,
source and accepted archives remain unchanged. Manual approvals stay stopped; future
publishing uses the prepared [GitHub OIDC direction](../NPM_TRUSTED_PUBLISHING.md)
under GitHub owner **SensNyaha**. All ten exact 0.2.4 archives are public,
five hosted publication workflows pass, and direct OIDC trust is configured.
Express 0.2.4 uses the separately authorized initial owner approval; its workflow
then skips the matching public version. [Evidence](iterations/401-450.md#iteration-441).
Its first actual automatic OIDC write succeeds in 0.2.5;
[current npm delivery](../ITERATION_456.md).
All seven **0.2.1** packages are published on npm. Fresh Windows and Linux
projects install the public dependency graph and pass strict TypeScript,
same-port HTTP/WS and actual native TLS-refusal checks.
[Publication evidence and package links](iterations/401-450.md#iteration-426).

## 1. Purpose

This package defines a cross-platform bridge that uses FreeRDP as the RDP protocol implementation and exposes a browser-consumable API for remote desktop image, cursor, audio and input. The bridge is not a Remmina clone and does not include a full visual application. A future web client may implement a Remmina-like UI on top of the API described here.

Explicit user requirement (2026-10-14): the reference WEB visualization must also
demonstrate manual RDP host/settings and username/password entry, an interactive
certificate decision, and Remmina-like connection actions. This extends the
integration harness into a reusable connection UI example; the original exclusion
of a full production application/profile store remains. Unsupported backend
features must remain explicit rather than being silently enabled by a UI control.
[Manual WEB example and launch](../WEB_CONNECTION_EXAMPLE.md).

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

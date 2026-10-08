# Technical specification

## 1. Product definition

The product is a **FreeRDP → Browser Bridge**. It is a server-side/session-side adapter. FreeRDP performs the RDP client protocol work; the bridge translates the resulting desktop/audio/cursor/device events into a browser-friendly API and translates browser input back to FreeRDP.

The future web application is a separate consumer. The bridge must therefore expose capabilities and settings rather than hard-code UI assumptions.

## 2. Functional requirements

### 2.1 Session lifecycle

The service shall:

- create a session from a validated JSON configuration;
- return a stable opaque `sessionId` and short-lived browser attach token;
- expose states `created`, `starting`, `connecting`, `awaiting-user`, `connected`, `reconnecting`, `closing`, `closed`, `failed`;
- start one native worker process per RDP session;
- stop a worker on explicit close, unrecoverable error, idle timeout or parent shutdown;
- support configurable reconnect attempts and FreeRDP auto-reconnect cookies where the server permits it;
- expose structured disconnect reasons rather than only process exit codes.

### 2.2 RDP connectivity and authentication

Required connection capabilities:

- host/IP + port;
- username, password and domain;
- NLA/CredSSP and TLS negotiation;
- explicit security policy selection when required;
- server certificate verification, hostname validation, trust-once and trust-persistently decision flow;
- RDP Gateway with independent or shared credentials;
- HTTP/SOCKS proxy settings supported by FreeRDP where applicable;
- restricted admin / pass-the-hash only when explicitly enabled;
- smart-card logon where FreeRDP/PCSC support is available;
- RemoteApp/RAIL configuration as an optional capability, not an MVP blocker;
- IPv4/IPv6 preference and connect/ack timeouts.

Secrets must never appear in command lines, logs, metrics, crash filenames or process listings.

### 2.3 Desktop graphics

The bridge shall:

- initialize FreeRDP GDI/graphics callbacks and maintain an authoritative framebuffer for the remote desktop;
- support classic bitmap updates and modern RDP Graphics Pipeline output through FreeRDP;
- react to desktop resize and dynamic resolution changes;
- expose negotiated width, height, pixel format and scale metadata;
- stream only changed content when possible;
- send a keyframe after browser attach, decoder reset and material resize;
- support 16/24/32 bpp sessions as accepted by FreeRDP, normalizing the browser media pipeline to an internal BGRA/RGBA representation;
- support configurable FPS cap and quality/bitrate profile;
- keep cursor rendering out of the encoded desktop stream by default.

### 2.4 Cursor

Required:

- cursor shape update, hotspot, visibility and position;
- monochrome/color cursor conversion to browser-decodable RGBA/PNG payload;
- local browser cursor overlay so pointer movement does not force full video re-encoding;
- fallback to server-composited cursor only for incompatible servers/modes.

### 2.5 Input

Required browser → RDP input:

- key down/up using physical code/scancode mapping;
- Unicode text input fallback for IME/text entry;
- mouse absolute movement, left/middle/right buttons, extra buttons;
- vertical/horizontal wheel;
- focus synchronization and stuck-key release on detach;
- touch contacts through RDPEI when negotiated;
- optional pen input when supported by the browser and FreeRDP.

The API must not assume a US keyboard layout.

### 2.6 Audio

Required:

- RDP audio output (`rdpsnd`) into the browser;
- microphone/audio input (`audin`) from the browser to RDP when enabled;
- format negotiation and resampling isolated inside the native worker;
- baseline PCM transport for correctness and an Opus mode for production bandwidth reduction;
- bounded jitter buffering and audio-first queue priority.

A host sound server (PulseAudio/PipeWire) must not be required for browser audio; implement virtual FreeRDP audio sink/source backends.

### 2.7 Clipboard

Required:

- text and Unicode text;
- HTML when server/client support permits;
- image clipboard where practical;
- explicit maximum clipboard item size;
- file clipboard as a later capability backed by a session sandbox, not arbitrary host filesystem exposure;
- policy switches for server→browser, browser→server and disabled modes.

### 2.8 Drive and file redirection

Required:

- one or more RDPDR redirected drives;
- read-only or read-write policy per share;
- per-session root sandbox;
- upload/download integration for a future browser client through the Node API;
- `thinclient_drives` treated as a product-level alias for a managed set of per-session RDPDR drive descriptors; it is not a new RDP protocol;
- path traversal, symlink escape and device-node protections.

### 2.9 Device/channel redirection

The implementation shall cover or explicitly capability-report:

- printers;
- smart cards;
- serial ports;
- parallel ports;
- USB via URBDRC;
- audio output/input;
- clipboard;
- drives;
- dynamic/static virtual channels configured by policy;
- RemoteApp/RAIL;
- display control/dynamic resolution;
- multitouch input;
- camera redirection where FreeRDP build and platform support it;
- WebAuthn/FIDO2 redirection where FreeRDP build and platform support it.

See `DEVICE_REDIRECTION.md` for the three execution modes and browser limitations.

### 2.10 Remmina-like settings coverage

The bridge must expose the useful connection controls commonly expected from Remmina/FreeRDP without copying Remmina UI. At minimum:

- target, port, username, domain;
- gateway and proxy;
- security negotiation, certificate policy, TLS security level override;
- resolution, color depth, scaling, dynamic resolution, multimonitor policy;
- performance flags: wallpaper, font smoothing, animations, themes, desktop composition;
- bitmap/GFX/H.264 related toggles only when needed for diagnostics/compatibility;
- quality profile;
- audio output/input;
- clipboard;
- drive/printer/smartcard/serial/parallel/USB redirection;
- custom static and dynamic channels behind an administrator allowlist;
- reconnect count/timeouts;
- RemoteApp parameters;
- logging level/filter per session with secret redaction.

### 2.11 Browser API

The service shall provide:

- JSON REST endpoints for lifecycle/capabilities;
- WebSocket control channel;
- binary media channel;
- versioned protocols with explicit negotiation;
- capability descriptors so a future UI can hide unsupported features;
- no requirement for the consumer to understand FreeRDP C structs or command-line syntax.

### 2.12 Multi-session operation

Required:

- process isolation per RDP session;
- configurable global and per-principal session limits;
- CPU/memory watchdogs;
- bounded queues everywhere;
- per-session temporary directories;
- deterministic cleanup after abnormal worker exit;
- no shared mutable FreeRDP state across session workers.

## 3. Non-functional requirements

### 3.1 Reliability

- Node service must survive native worker crash.
- Worker crash must be reported as a structured session failure.
- Session resources must be reclaimed after parent death using parent-death signal/process group cleanup where available.
- All IPC parsers use length limits and reject unknown mandatory fields.
- Graceful shutdown drains control messages and terminates workers within a bounded timeout.

### 3.2 Security

- strict RDP certificate validation by default;
- TLS for browser-facing deployment;
- short-lived attach tokens scoped to one session;
- no arbitrary host path redirection from an untrusted API caller unless explicitly allowed by server policy;
- no arbitrary FreeRDP command-line passthrough endpoint;
- custom VC/DVC channel allowlist;
- non-root runtime;
- seccomp/AppArmor profile recommended for workers;
- USB/smartcard host device access opt-in only;
- audit events for sensitive redirections.

### 3.3 Performance

Target 1080p interactive desktop:

- bridge-added input→visible latency p95 <= 70 ms on localhost/LAN excluding remote server processing and network RTT;
- total browser media queue target <= 150 ms;
- cursor movement perceived latency <= 35 ms because cursor is transported separately;
- no unbounded video/audio/IPC queues;
- drop stale video rather than accumulating seconds of latency;
- no base64 for media or files;
- avoid raw full-frame copies across the Node/native boundary in production mode.

### 3.4 Portability

Primary deployment: Linux x86_64. Architecture shall not prevent Linux arm64 or Windows worker ports. Browser side must target current Chromium, Firefox and Safari families with capability detection and a fallback media mode.

## 4. Explicit browser sandbox boundary

A web page cannot, in the general case, expose arbitrary physical USB, smart-card, serial or printer devices to a remote server with the same semantics as a local native RDP client. Therefore the bridge distinguishes:

1. **Bridge-host device** — physical/logical device attached to the machine running the bridge; FreeRDP redirects it directly.
2. **Browser-mediated virtual device** — clipboard, uploaded files, microphone, camera or downloadable print spool represented through browser APIs.
3. **Companion-agent device** — an optional local agent on the user's computer tunnels device operations to the bridge for true browser-host USB/smartcard/serial use.

Codex must not claim mode 3 exists until it is implemented and tested.

## 5. Acceptance definition

The bridge reaches v1 when Stage 0–10 in `TODO.md` are green, the reference browser harness can connect to both a Windows RDP host and XRDP, 1080p desktop and audio are usable, reconnect works, clipboard and managed drives work, and capability-reported device redirection passes its integration matrix.

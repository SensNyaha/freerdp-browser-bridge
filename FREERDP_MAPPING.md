# FreeRDP integration and settings mapping

## 1. Baseline

Target FreeRDP 3.32.1 initially. Use the public client interface (`RDP_CLIENT_ENTRY_POINTS`, `freerdp_client_context_new`, `freerdp_client_start/stop`) and current settings APIs. Do not depend on internal private structs when a public setting/callback exists.

The worker is a custom FreeRDP client, structurally closer to the official Sample client than to shelling out to `xfreerdp`.

## 2. Connection initialization

Expected sequence:

1. fill `RDP_CLIENT_ENTRY_POINTS`;
2. allocate custom context containing bridge state;
3. create context with `freerdp_client_context_new`;
4. set application details/namespaces when supported;
5. populate `rdpSettings` using setter APIs;
6. install authentication/certificate callbacks;
7. register update/pointer/channel event callbacks;
8. load client addins with `freerdp_client_load_addins`;
9. start session;
10. run worker event loop until disconnect/stop.

Do not build an `xfreerdp` command string and parse it internally for ordinary settings. Direct settings APIs provide type safety and eliminate injection/escaping mistakes. Parsing `/args-from` or arbitrary command-line input is not part of the public bridge API.

## 3. Graphics callbacks

Register/handle at minimum:

- `BeginPaint`
- `EndPaint`
- `DesktopResize`
- bitmap/surface/GFX update path via FreeRDP GDI
- pointer shape/new/null/default/position callbacks
- server status/session info as useful for diagnostics

Use `gdi_init`/appropriate FreeRDP GDI initialization so the worker has a canonical framebuffer independent of X11/Wayland.

## 4. Input mapping

Use FreeRDP input APIs for:

- keyboard scancode down/up;
- Unicode keyboard events when text mode is required;
- mouse move/button/wheel;
- extended mouse buttons;
- touch/pen client contexts when compiled/negotiated.

Maintain a bridge-side pressed-state table so disconnect/focus-loss can release keys safely.

## 5. Channel mapping

| Product feature | RDP/FreeRDP channel/facility | Notes |
|---|---|---|
| Clipboard | CLIPRDR | text/HTML/image/files according to negotiated formats |
| Drive redirection | RDPDR/DRIVE | `freerdp_client_add_device_channel`/device collection |
| Printer | RDPDR/PRINTER | host CUPS or custom spool backend |
| Serial | RDPDR/SERIAL | allowlisted local device path |
| Parallel | RDPDR/PARALLEL | allowlisted local device path |
| Smart card | RDPDR/SMARTCARD + PCSC | reader selection, PIN handling |
| Audio output | RDPSND | custom browser sink |
| Microphone | AUDIN | custom browser source |
| USB | URBDRC / MS-RDPEUSB | requires libusb and device permission |
| Dynamic resolution | DisplayControl / MS-RDPEDISP | browser resize requests |
| Graphics | RDPGFX / MS-RDPEGFX | FreeRDP decodes into framebuffer |
| Touch | RDPEI | optional negotiated feature |
| RemoteApp | RAIL | optional v1.x capability |
| Camera | RDPECAM | optional/build-dependent |
| WebAuthn/FIDO2 | RDPEWA | optional, FreeRDP >= 3.25 capability |
| Custom DVC | DRDYNVC | admin allowlist only |

## 6. Remmina-like behavior to expose

Use Remmina only as a behavioral/settings reference, not a dependency. The bridge shall cover equivalents for:

- gateway usage and credentials;
- security selection and TLS security level;
- certificate policy;
- FreeRDP log level/filter;
- quality/performance flag presets;
- audio output/microphone;
- drive sharing;
- serial/parallel/smartcard sharing;
- clipboard enable/disable;
- custom VC/DVC;
- reconnect attempts;
- IPv4/IPv6 preference;
- smartcard logon and PIN prompt;
- display scaling/dynamic resolution.

## 7. Build-time capability probe

At worker startup publish a capability bitmap generated from compile-time macros and runtime library probes. Examples:

- `CHANNEL_URBDRC_CLIENT`
- PCSC available and reader enumeration succeeds;
- libusb available;
- CUPS available;
- H.264 encoder provider available;
- Opus available;
- RDPECAM/RDPEWA compiled;
- hardware encode providers detected.

Node `/v1/capabilities` combines build capability with deployment policy. A feature is advertised as usable only when both are true.

## 8. Certificate handling

Default to strict validation. On unknown certificate under `prompt/tofu` policy, worker emits the full non-secret identity needed for the decision: host, port, subject/issuer if available, SHA-256 fingerprint, error class. Node relays to caller and resumes only after an explicit response.

A certificate mismatch after a stored trust decision is a high-severity state; never silently replace.

## 9. Logging

Route FreeRDP logging into worker stderr or callback with a session prefix and sanitization. Do not expose TRACE by default. Known secret-bearing settings and auth callback material must be redacted before structured log emission.

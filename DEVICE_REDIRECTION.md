# Device and channel redirection design

## 1. Capability model

Every redirection capability is reported with:

```json
{
  "name": "usb",
  "supported": true,
  "origins": ["bridge-host", "companion"],
  "requires": ["libusb", "CHANNEL_URBDRC_CLIENT"],
  "policy": "disabled-by-default"
}
```

The bridge must never present `browser` as a generic physical-device origin unless it has a real browser-mediated implementation for that device class.

Linux container deployment opt-ins are described in the
[device mapping reference](docs/CONTAINER_DEVICE_MAPPINGS.md). That reference
does not enable the capability model or satisfy device integration. Current
USB/serial/parallel/smartcard and host-printer selections remain refused until
their implementation and policy gates pass.

## 2. Drives / `thinclient_drives`

### Bridge-host/session drive

FreeRDP RDPDR exposes a directory as a drive to the remote session. Product configuration uses logical descriptors, not raw FreeRDP command strings.

`thinclient_drives` is defined here as a convenience collection of managed session shares. Each maps to a subdirectory under the session sandbox. This satisfies the intended thin-client use case without exposing arbitrary bridge host paths.

Security controls:

- canonicalize every path;
- reject `..`, symlink escapes and mount escapes;
- optional read-only wrapper;
- quotas per session;
- upload temporary name + atomic rename;
- malware scanning hook optional, not built into core.

## 3. Clipboard

Implement CLIPRDR format negotiation. Start with Unicode text, then HTML/image. For file clipboard, bridge clipboard offers must resolve to files inside the session sandbox; remote file requests are streamed from there.

Set maximum clipboard payload sizes. Large file transfer should use redirected drive instead of loading files into one clipboard blob.

## 4. Printers

### Mode A: bridge-host printer

Enumerate CUPS printers allowed by deployment policy and pass selected device/driver to FreeRDP printer redirection.

### Mode B: browser spool

Implement a bridge virtual printer device/spool backend. A print job is persisted to the per-session spool directory and surfaced to Node. The future browser client may download it or hand it to a local printing mechanism.

Important: Windows driver expectations differ by server version and printer model. The integration test matrix must prove at least one generic driver workflow on supported Windows versions before the feature is marked stable.

## 5. Smart cards

Bridge-host mode uses PC/SC and FreeRDP smartcard redirection. Requirements:

- enumerate reader names without exposing card secrets;
- allow explicit reader selection;
- prompt for PIN through the control channel when FreeRDP requests it;
- PIN is held only as long as needed and zeroized in owned buffers where practical;
- never log ATR/PIN/certificate private-key material beyond safe metadata.

A smart card inserted into the user's browser machine is **not** generally redirectable by a remote web server. True browser-host smartcard redirection belongs to the companion agent.

## 6. USB / URBDRC

Bridge-host USB uses FreeRDP URBDRC + libusb.

Requirements:

- enumerate devices as VID/PID/bus/address + human-readable metadata;
- explicit allowlist/selection; no default redirect-all in multi-user deployment;
- detach/reconnect events handled cleanly;
- access failures returned as capability/device events;
- run worker with only required device permissions, not privileged container mode by default.

Browser WebUSB is not a transparent replacement for MS-RDPEUSB/URBDRC. Do not attempt generic raw USB tunneling from browser JavaScript in the core design. Use a companion agent for browser-host USB.

## 7. Serial ports

Bridge-host serial redirection maps logical COM name to allowlisted local device path. Support driver mode where FreeRDP exposes it. Container deployments require explicit device mapping.

Browser Web Serial can support selected device-specific workflows but is not a generic drop-in for native RDP serial semantics. If added, treat it as a browser-virtual adapter with a documented compatibility subset; generic mode belongs to companion agent.

## 8. Parallel ports

Support only bridge-host allowlisted device path. This is legacy and low priority but must remain part of the capability matrix. It may be disabled by default in packaged builds.

## 9. Audio output/input

`rdpsnd` and `audin` are first-class browser-virtual devices and are part of v1, not optional extras. Implement custom virtual backends as described in `MEDIA_PIPELINE.md`.

## 10. Camera

FreeRDP supports camera redirection in suitable builds. Two possible origins:

- bridge-host camera via platform backend;
- browser-virtual camera from `getUserMedia` through a custom adapter.

The browser-virtual path requires careful media-format negotiation and is scheduled after core audio/video. Capability remains false until end-to-end verified.

## 11. WebAuthn/FIDO2

FreeRDP 3.25+ includes RDPEWA support. Treat it as optional/build-dependent. Bridge-host authenticators may be usable through platform support. Browser-host WebAuthn redirection cannot be assumed to be equivalent to native authenticator redirection; prefer a companion agent unless a standards-compliant browser-mediated adapter is implemented and tested.

## 12. Custom VC/DVC

Expose only an admin-configured allowlist. Arbitrary channel loading from untrusted session configuration is forbidden because addins can expand attack surface and may execute external helpers.

## 13. Priority matrix

| Feature | v1 target | Origin | Stability gate |
|---|---:|---|---|
| Clipboard text | yes | browser-virtual | Win + XRDP integration |
| Managed drives | yes | session sandbox | read/write + traversal tests |
| Audio output | yes | browser-virtual | audible low-latency E2E |
| Microphone | yes | browser-virtual | RDP recorder/app test |
| Host printers | yes | bridge-host | CUPS + Windows test |
| Printer spool | yes, after host printer | browser-virtual | generic driver E2E |
| Smartcard | yes | bridge-host | PCSC test hardware/emulator |
| USB | yes | bridge-host | libusb/URBDRC test device |
| Serial | yes | bridge-host | loopback test |
| Parallel | compatibility | bridge-host | capability smoke test |
| Camera | post-v1 core | bridge/browser | explicit E2E |
| WebAuthn | post-v1 core | bridge/companion | explicit E2E |
| Companion agent | later | browser-host | separate threat model |

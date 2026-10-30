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

The development branch starts the Stage 8 inventory with matching bounded
TypeScript/C++ [binary codecs](PROTOCOL.md#host-device-inventory-grammar-in-development).
The private worker/SDK inventory path is implemented in that branch; it has no
HTTP route and is not yet a released or fully platform-accepted capability.
The original inventory checkbox stays open until the actual backend and platform
matrix passes. Physical redirection remains disabled by its existing gates.

### Host inventory in the development branch

`discoverHostDevices(workerOptions, { classes, maxDevices })` is an opt-in
trusted-host SDK operation. Classes are `printers`, `smartcards`, `serial`,
`parallel` and `usb`; the global count is 1..128. Use a dedicated private runtime
root under the service account and the matching native source build. Published
0.6.0 lacks this RPC; the development SDK refuses a 0.6.0 worker with
`DEVICE_INVENTORY_NOT_IMPLEMENTED`. Do not expose
the function as an unrestricted browser/API endpoint or log its device names.
Every returned device has `origin: 'bridge-host'`; inventory IDs are metadata,
not authorizations and not stable across reconnect/reboot.

| Source | Implemented discovery | Limits and exclusions |
| --- | --- | --- |
| Windows printers | `EnumPrintersW`, level 4, local/connected queue names | 2 MiB API buffer ceiling; no print job, driver loading or printer properties/credentials. |
| Windows smart cards | System PC/SC context and `SCardListReadersW` | 16384 UTF-16 units; no card open, ATR, PIN or transaction. |
| Windows ports | `QueryDosDeviceW`, numeric COM/LPT names | 32768 UTF-16 units; names only, no port open or reconfiguration. |
| Linux serial/parallel | Numeric ttyS/ttyUSB/ttyACM/ttyAMA or ppdev entries and existing `/dev` character nodes | At most 4096 directory entries, no device open, permissions change or symlink/device probing. |
| Linux PC/SC | Pinned WinPR public `SCardListReadersA` wrapper | 16384 bytes; absent daemon/library is a reported non-ready state, no card access. |
| Linux CUPS | Pinned CUPS `cupsEnumDests`, one-second enumeration of local configured queues | Fixed `/run/cups/cups.sock`, no caller-supplied server or network discovery, no password prompt, no job submission or option/URI export. |
| Windows/Linux USB | Pinned libusb list and cached descriptors | At most 4096 library entries scanned; VID/PID/bus/address only, no device open, string/serial queries, interface claim, detach or transfer. |

Library providers are linked only in private SDK builds. Foundation builds
truthfully return `unsupported` for absent CUPS/WinPR-PCSC/libusb providers;
Windows native printer/PCSC/port queries and Linux device-node discovery remain
independent. Returned status is `available`, `unavailable`, `denied`,
`unsupported`, `limit` or `failure`; `available` may have zero devices and
`limit` explicitly marks a partial snapshot. A failed class discards its own
entries while preserving earlier class results. Invalid backend metadata fails
the class rather than becoming a truncated or replacement-character name.

The bridge owns fixed 128-device metadata storage and a response of at most
64 KiB. Library enumeration can allocate its own internal lists/caches before
the bridge sees their counts; the bridge's limits do not constitute a hard
allocator limit inside CUPS/PCSC/libusb. Discovery runs in the disposable native
process with the supervisor deadline; existing sampled CPU/RSS policies can
also be supplied in `workerOptions`. No FreeRDP/device library runs in Node.
The account/container still needs explicit device/socket permissions; discovering
a node does not prove that opening or redirecting it is allowed.

The CUPS callback and timeout/filter semantics follow the pinned public
[2.4.20 header](https://github.com/OpenPrinting/cups/blob/ef80eeaea51430a055948240eea3f28ef5354edf/cups/cups.h)
and [OpenPrinting programming manual](https://openprinting.github.io/cups/doc/cupspm.html).

The initial development checks pass actual Windows foundation and linked
worker calls with joined cleanup, native rejection of duplicate/ordinary IO
outside Node's guards, and a separate selected USB call. The linked host
snapshot admits four printer queues and four readers under a global limit of
eight; the selected USB call admits eight metadata records with explicit
`limit`. Names are not logged. This is inventory, not accepted printer/card/USB
redirection or a claim that any device can be opened.

MSVC foundation CTest passes 25/25 and linked CTest 42/42. A restricted offline
GCC 8.3 container passes foundation CTest 25/25 and compiles all library-provider
branches against the pinned CUPS/WinPR/libusb headers. A separate invocation
links the exact public 0.6.0 Linux runtime libraries: CUPS/PCSC/parallel report
unavailable and serial/USB return available-empty with no mapped host devices
or daemons. This is compiler/library invocation evidence, not Astra/RED OS or
populated CUPS/PCSC/device acceptance. The source audit is
`build/current-validation/device-inventory-platform-checkpoint.json`.
The initial GCC 12 source CI refuses a test's copied structured binding under
`-Werror=range-loop-construct`; the loop now borrows the pair. Its failure log
is retained. Corrected hosted gates, populated/emulated Linux backend tests and
exact installed-consumer acceptance remain open. The standalone operator CLI
is implemented and source-tested with the real SDK/native worker under a
controlled runtime resolver; it has not yet passed an installed-distribution
test. [CLI syntax and scope](docs/STANDALONE.md).

The first corrected-source sanitizer job `41042085443` passes native CTest and
then fails the inventory Node test's unconditional seqpacket start: that profile
does not build the Node IPC addon. It now explicitly selects framed-only inventory
integration with `BRIDGE_INVENTORY_FRAMED_ONLY=1`. The skipped seqpacket case
states this reason; it is not inferred from absent/broken files. Ordinary Linux
foundation and bundled jobs retain mandatory framed and seqpacket tests. This
does not establish ASan-instrumented Node-addon or seqpacket composition acceptance.

The latest hosted source checkpoint `4f163229` passes GCC 8.3, Windows/MSVC,
default Linux GCC and the declared sanitizer profile. Its GCC 12 Node suite
exposes a pre-existing HTTP final-body/native-close race; the fix holds the final
chunk until close completes and adds an actual-native regression with delayed
close, including an empty file. The bundled Linux build at `ad38cb18` compiles
and runs native checks but fails a pure coordinator test because its interpreter
selector chooses Python 2. The selector now verifies Python 3.7 or newer before
running those controls. Both original job logs and SHA256 are retained in the
local validation record; corrected hosted acceptance remains pending.

The isolated [daemon fixture](tests/fixtures/device-inventory-lab/README.md)
passes two fresh, networkless, unprivileged Debian containers. It invokes the
actual inventory providers using the pinned private library closure from public
0.6.0, admits one owned local CUPS queue and two virtual PC/SC readers, repeats
the snapshot and observes unavailable states before and after both daemons exit
normally. It sends no print job/card operation and maps no host devices. This
accepts that named metadata component profile, not Astra/RED OS, packaged worker
composition or physical redirection. These broader gates remain open.

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

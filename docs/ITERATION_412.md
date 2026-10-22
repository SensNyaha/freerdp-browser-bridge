# Iteration 412 — GCC 8.3 artifact and actual Linux RDP

2026-10-22. Branch `feature/astra17-gcc83`, following `0a2147c` and
[the complete portable source chain](ITERATION_411.md). Requirement: verify
the GCC 8.3.0 compiler port on actual desktop/clipboard/lifecycle paths before
the requested 0.2.0 release. No production implementation, dependency pin,
certificate policy or accepted MVP duration changes in this block.

## Cold Astra-library artifact

The exact final native package has SHA-256
`666c2f203c30161858f664d1365f19c857845a25654751d886ac03aa22cd7a89`;
its worker has SHA-256
`eb3c7b13b51dc8d6d6ed98ebbfe55f6babcbb2928722706e13005bbb099d15eb`.
It is copied unchanged into an image derived from the checked Astra ISO-library
runtime. This is a userspace-container check with the Docker host kernel, not
an installed Astra OS or security-profile acceptance.

The artifact-only probe passes as UID 1000 with Node 24.21.0, network disabled,
all capabilities dropped, no-new-privileges, private mode-0700 runtime tmpfs
and Docker `--init`. It verifies six private module origins, codec roundtrips,
three acknowledgements, paired IPC and empty joined cleanup. No SDK/workspace
library search environment is needed. The same exact package already passes
the separate unprivileged actual RED OS probe in iteration 411.

The first two cold-container attempts exit 3: Node is container PID 1 and the
worker deliberately refuses a parent PID of 1. An exec-based diagnostic passes;
the final fixture supplies an init process. The worker parent guard is unchanged.
These failures are retained; they are not described as a runtime-loader repair.

## Actual owned XRDP

The producer is the final Linux GCC 8.3 worker in the Astra-library container.
The server is the existing owned XRDP 0.10.1 / prepared Tk desktop, published
only on host loopback port 3392. Credentials travel through private test input
and IPC. Certificate prompt approval is restricted to the exact owned-fixture
receipt fingerprint; no trust store or verification default changes.

The following actual transport checks pass:

- Strict certificate refusal reports `RDP_CERTIFICATE_REJECTED`; heartbeat and
  joined runtime cleanup pass without desktop activation.
- Both primary `unix-seqpacket-rws1` and fallback `framed-pipes` activate at
  1920×1080, produce JPEG and H.264 IDR, resize to 1280×720 and restore.
- Controlled loss passes on both transports: one bounded local proxy connection,
  `RDP_DISCONNECTED`, terminal worker state and empty joined cleanup.
- A fixed clipboard sentinel offer and revoke are accepted, without reading
  either host clipboard. This check alone does not establish application paste.

The first primary connection attempt reaches activation/media but stops during
display testing. The unchanged repeat passes. Its cause is not established.
The first loss attempt refuses a hostname before connecting: the existing proxy
requires an explicit IP. Resolving the fixed Docker gateway inside the owned
container satisfies that test precondition; the proxy restriction is retained.

## Actual browser and Unicode application clipboard

Real Edge runs headless and renders nonuniform canvas output through the public
HTTP/WebSocket session API. Both H.264 and JPEG pass initial display, resize,
restoration, viewer reattachment with fresh tokens and session cleanup.
This is not a headed-browser or audible-output observation.

Additional fresh H.264 and JPEG sessions run without `LD_LIBRARY_PATH`, using
the exact installed package. Both pass browser text offer → CLIPRDR → ordinary
Tk paste, ordinary Tk Copy → CLIPRDR → browser Get, and another fresh Copy/Get.
Fixed multiline Russian/Japanese/emoji strings compare exactly after CRLF
normalization. Every Get waits for a newer public `clipboard.offer` revision;
there is no automatic Get retry. Only the prepared owned document is changed
and cleared. Neither local OS Clipboard API nor host clipboard contents are
accessed in these Linux-producer checks.

The initial clipboard adapter observes the wrong envelope level for
`clipboard.offer` and times out. It is corrected to inspect the public
message's `data` object. H.264 then passes. An immediate new JPEG session fails
the first fixed-text comparison; a separate repeat with the existing prepared
desktop scenario's 15-second settling pause passes. This is evidence for the
passing bounded profile, not proof of that earlier failure's cause or a
production clipboard fix. Failed logs remain available and comparisons are
not weakened.

## Evidence and remaining scope

Ignored local evidence includes `iteration-412-astra-artifact-init.log`,
`iteration-412-rdp-strict2.log`, `iteration-412-rdp-connect2.log`,
`iteration-412-rdp-connect-framed.log`, `iteration-412-rdp-clipboard.log`,
`iteration-412-rdp-loss2.log`, `iteration-412-rdp-loss-framed.log`,
`iteration-412-browser-h264.log`, `iteration-412-browser-jpeg.log`,
`iteration-412-browser-clipboard2.log` and
`iteration-412-browser-clipboard-jpeg2.log`. Earlier failed logs are preserved.
Local adapters select fixed owned containers and synthetic data; they do not
change the tracked native implementation or release binaries.

The user explicitly defers Windows-host access for at least 60 minutes starting
at 06:56 UTC on 2026-10-22. No new Windows RDP connection has been started.
The prepared short Windows regression remains unrun and cannot replace the
historical accepted 30-minute MVP gate. Owned XRDP has no ready audio source;
these checks claim no audible-output acceptance.

Full code checks remain the unchanged verified suites in iterations 410/411.
This documentation block does not accept a shared merge, 0.2.0 tag, installed
Astra/security profiles or the remaining full V1 matrix.

# Iteration 200 — automatic Linux primary with paired private artifacts

2026-10-14. Implements STACK section 3 Linux primary preference on top of
`a9b6618` without changing RWI1/browser fields. `WorkerOptions.ipcTransport`
defaults to auto. Windows/other platforms use framed pipes. Linux selects RWS1
only after the configured executable's canonical private pairing manifest and
both artifact hashes validate. No manifest means the legacy framed fallback;
invalid/incomplete pairing fails before loading the addon or sending credentials.
Explicit framed/packet options remain available to trusted hosts.

CMake emits `rdp-worker.ipc.json` for the exact worker/module pair. It records
schema 1, the exact carrier/filenames, SHA-256 hashes and fixed 32-pair capacity.
Discovery bounds metadata to 8 KiB before reading/parsing, refuses symlink/FIFO
metadata, hashes regular artifacts through fixed 64 KiB scratch under a 64 MiB
file bound, and checks file size/timestamps after reading. This is compatibility /
integrity metadata for trusted installed code, not an authentication signature or
a live-upgrade policy. Addon loading uses the canonical worker directory.

Build and installed ELF bytes differ because install replaces RPATH. Therefore
pairing is regenerated after actual install, including CPack's staging prefix /
DESTDIR; the build hashes are not copied unchanged into the deployed manifest.
Independent artifact verification hashes the extracted worker/addon and loads
the private module without the source tree/SDK. No credentials enter metadata.

Focused metadata/default/legacy and existing supervisor files pass **25/25**.
Both 100-worker loops, parent death, crash, cancellation and exact native settings /
secret retirement remain passing. A dedicated installed-native-stage check without
SDK library environment confirms default packet and explicit framed selection.
Three metadata cases cover exact profile/field/path bounds, absent legacy metadata,
canonical aliases, malformed/oversized/symlink/FIFO refusal and changed artifacts.

Verification: full Linux Node **487 passed / 75 skipped / zero failures**;
Windows **537 passed / 25 platform-specific skipped / zero failures**, 562 cases.
Linked Linux CTest **24/24**, Windows foundation/linked **11/11 and 23/23**.
ELF closure **34 files / 274 edges**, canonical relocation **1/1**, installed
automatic/framed selection **1/1** without SDK library environment, and independent
UID1000/read-only/no-network/init/cap-drop artifact smoke pass. The independent
receipt includes `ipcPairing:true`, `ipcPairs:1`, six private modules and three
worker replies. TGZ SHA-256:
`6f1b9e3c6f0b683c307e2bc373e125405c937b77d790d6f542e0852b70e4d3a7`,
24,778,180 bytes, excluding Node.js.

The
primary Release transport component's default 32-pair lifecycle scope is separate
from connected RDP/device/resource/soak acceptance, configured-capacity admission
across hosts/environments, the open addon sanitizer baseline and unrun actual CI.
Those requirements remain tracked; no larger host session policy is silently
changed to 32. Local logs: `build/iteration-200-*`.

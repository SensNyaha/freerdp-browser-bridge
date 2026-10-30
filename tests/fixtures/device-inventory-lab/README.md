# Isolated Linux inventory daemon fixture

This fixture starts an unprivileged CUPS daemon and PC/SC daemon with the
distribution's virtual-reader driver. It checks metadata enumeration before,
during and after their lifetime, including a repeated populated snapshot.
The expected snapshot has one owned local printer queue and two virtual readers.
It submits no jobs, opens no card and performs no RDP/device redirection.

Build the image with this directory as the entire Docker context. Its package
installation prevents automatic daemon startup; installed package versions are
included in the result. Execute the image by its inspected immutable image ID.
Runtime requirements are UID/GID 1000, no network, read-only root, no capabilities,
`no-new-privileges`, a 512 MiB memory limit and two CPUs. Map only:

- this directory read-only at `/fixture`;
- the explicitly prepared component payload read-only at `/input`;
- private tmpfs directories `/run/cups` and `/run/pcscd` (8 MiB each) and `/tmp`
  (16 MiB), all `uid=1000,gid=1000,mode=0700,nosuid,nodev,noexec`.

Pass `/fixture/run.py` to the image's Python entry point. Do not map host devices,
daemon sockets or credentials, publish ports, or add privileged execution.
The controller refuses ordinary host execution before starting daemons.

The component payload consists of `artifacts/inventory-probe`, its private ELF
library closure in `lib/`, and a JSON `manifest.json` containing `probeSha256`,
`runtimeLibraryArchiveSha256` and `libraries` (basename-to-SHA256 map). Build
`../device-inventory-probe.cpp` with the actual `native/devices` providers,
inventory codec and UTF-8 validator, C++20 and warnings as errors; use the pinned
private CUPS/WinPR/libusb headers and libraries. Enable all three library provider
macros exactly as declared in CMakeLists.txt. Verify the payload against the
known runtime archive before invocation. The probe prints only five bounded
class/status/count JSON records; device names and backend options are omitted.

The fixed CUPS endpoint is checked even when `CUPS_SERVER` points to a sentinel
address. The printer's destination has no live print server and the spool must
remain empty. Success requires both owned daemons to exit normally and fresh
probes to report them unavailable again. Any forced termination fails acceptance.
Only bounded diagnostics from this newly created private test directory may be
returned on failure.

This Debian daemon test is component evidence. It does not prove Astra/RED OS
acceptance, packaged-worker/Node IPC composition, physical card/printer access,
or support for printing, smartcard transactions or USB redirection.

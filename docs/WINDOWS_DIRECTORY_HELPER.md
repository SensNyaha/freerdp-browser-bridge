# Private Windows directory helper

2026-10-13. Implements ARCHITECTURE §2 and SECURITY §2/6 after `8aaa379`.
`rdp-runtime-directory.exe` is a short-lived internal host bootstrap, not an RDP
worker or an arbitrary FreeRDP command runner. WorkerProcess selects it before
marker creation/spawn as documented in [startup ownership](WINDOWS_DIRECTORY_STARTUP.md).
[Native creation policy](WINDOWS_PRIVATE_DIRECTORY.md) and caller-trusted
parent requirements remain unchanged.

Directory creation uses `--create-private-directory <absolute UTF-16 path>`.
The path is internal nonsecret runtime metadata. Wrong argument count/flag exits
2 without filesystem access. A handled operation prints one ASCII JSON record:
`{"v":1,"created":true,"error":0}` on successful new creation, or
`{"v":1,"created":false,"error":<DWORD>}` on refusal. Exit codes are 0 for
creation, 1 for refusal and 3 for output failure. There is no path, account/SID,
credential or raw exception in output. Existing-object collision is refused.
No owner marker, recursive directory creation/repair or network access is added.

CMake builds it on Windows with the same warnings/analysis policy and installs
it beside the worker. Its native dependency is Windows Advapi32 plus the release
CRT already shipped privately; it does not link FreeRDP. Three actual process
cases verify Unicode/spaces, collision/data preservation, invalid commands and
relative/file-parent refusal with empty PATH and bounded 128-byte capture.
Foundation CTest 10/10 and bundled 22/22 pass. The relocation test explicitly
executes the installed helper from a copied bundle with minimal PATH, creates
a fresh Unicode directory, then verifies the usual private runtime dependencies.

Startup now joins creation/receipt ownership before worker spawn and cleanup,
rejects malformed/uncertain output and preserves collision ownership. Parent
namespace trust, uncertain-result reclamation, simultaneous hard-kill
reclamation, clean-machine and actual second-account/service acceptance remain
open. No production ACL capability or completed isolation gate is claimed here.

## Limited process working-set query

`--process-resident-bytes <decimal PID>` is an internal development probe for
the launched worker. It accepts only 1..DWORD_MAX, opens a noninheritable handle
with PROCESS_QUERY_LIMITED_INFORMATION, queries GetProcessMemoryInfo and checks
handle closure. It reads no memory contents, requests no VM_READ privilege and
does not change process permissions. The bounded ASCII receipt is
`{"v":1,"bytes":<WorkingSetSize>,"error":<DWORD>}`; bytes are zero on refusal.
Exit codes retain 0 success / 1 refusal / 2 grammar / 3 output failure.

Windows Kernel32 supplies the modern K32 API; no extra redistributable dependency
is added. Tests query both parent and actual worker, reject invalid PID grammar,
and exercise the installed utility after relocation with minimal PATH. The caller
joins the current worker's lifetime; a PID alone is not a liveness/identity proof.
Working-set snapshots are sampled residency, not private allocation, an absolute
peak, CPU cost or total session memory. [Soak probe](history/iterations/151-200.md#iteration-174).

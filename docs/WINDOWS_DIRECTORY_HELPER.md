# Private Windows directory helper

2026-10-13. Implements ARCHITECTURE §2 and SECURITY §2/6 after `8aaa379`.
`rdp-runtime-directory.exe` is a short-lived internal host bootstrap, not an RDP
worker or an arbitrary FreeRDP command runner. WorkerProcess does not select it
yet; [native creation policy](WINDOWS_PRIVATE_DIRECTORY.md) and caller-trusted
parent requirements remain unchanged.

The only command is `--create-private-directory <absolute UTF-16 path>`.
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

Next work must bind this helper to startup before owner-marker creation/spawn,
hold one child/cancellation/cleanup owner, reject malformed/uncertain output and
preserve ownership on collision. Parent namespace trust, simultaneous hard-kill
reclamation, clean-machine and actual second-account/service acceptance remain
open. No production ACL capability or completed isolation gate is claimed here.

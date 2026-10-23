# Iteration 444 — Windows standalone process supervisor

2026-10-23, `feature/standalone-installers-0.2.5`, following browser/CLI block
`94644b0`. This is a verified supervisor component, not installed SCM/MSI or
aligned 0.2.5 distribution acceptance.

## Implementation

`packaging/standalone/windows` is an independent C++20/MSVC project. Its small
service host never links FreeRDP. It launches the fixed relative private Node
and compiled standalone entry point, with absolute public-config/runtime paths,
an explicit inherited-handle allowlist and a minimal public OS-path environment.
No command interpreter, arbitrary Node arguments or inherited account settings
are used. The child starts suspended and joins a kill-on-close Windows Job
before resuming, so an abrupt host death also terminates descendants.

The host waits for the bounded fixed ready record before reporting running;
it drains and discards child output rather than recording session data. Stop
uses the existing one-byte private pipe, bounded wait and Job fallback. SCM
entry/control handlers are implemented following the public
[ServiceMain contract](https://learn.microsoft.com/en-us/windows/win32/services/service-servicemain-function)
and [CreateProcess inherited handle contract](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-createprocessw).
The `--console` path exercises the same supervision for a portable launcher.

An OS file handle exclusively leases the existing runtime directory. The lock
uses CREATE_NEW/delete-on-close; an existing lock is never overwritten. Before
Node startup, crash recovery accepts only Windows worker directory names with
32 hexadecimal suffix characters, containing nothing or the exact ten-byte
`runtime-v1` ownership marker. Unknown data, changed markers and reparse points
are refused. The bounded traversal never performs recursive deletion. This
intentionally refuses recovery of unsupported future nonempty session data.

## Verification

`scripts/build-standalone-host.ps1` builds the isolated project using the existing
MSVC environment helper and a temporary free workspace alias. Release compiles
and links with `/W4 /WX /permissive-`, C++20 and static MSVC CRT. Output:
`build/standalone-host/bridge-service.exe` (development binary, not signed).

`tests/packaging/standalone-windows.test.mjs` passes **9/9**, using the earlier
private-Node/public-0.2.4 production-graph prototype with the newly compiled host:

- authenticated real HTTP/native certificate prompt, followed by normal stop;
- parent stdin EOF with joined cleanup;
- invalid control and abrupt host termination, actual Node/worker PID retirement
  and a successful subsequent start with scratch recovery;
- a second host cannot acquire an active runtime or disrupt the original;
- unexpected root file, nonempty worker data, changed marker, junction and
  preexisting lock retain their data and cause refusal.

The process inventory selects only PID, parent PID and executable name. Tests
never inspect command lines/environment. Signing keys, tokens and synthetic RDP
credentials stay in memory. Runtime/config fixtures contain only public data;
recursive test cleanup checks exact temp-parent/name ownership first.

Lint and formatting of the new packaging test pass. The preceding complete
Windows/Linux checks remain recorded in [iteration 443](ITERATION_443.md).
No native foundation/FreeRDP code changes in this component.

An initial recovery test correctly fails: the first supervisor implementation
accepts only empty directories, but a forced worker death can leave its standard
ownership marker. Recovery now validates that marker and refuses all other data;
the four lifecycle/recovery cases and five preservation cases pass afterwards.

## Remaining gates

Running the actual SCM service as LocalService, protected installer ACLs, MSI
install/upgrade/recovery/uninstall and hosted Windows acceptance are unverified.
Portable/Linux installers, aligned release preparation and automatic core
publication remain separate work. No desktop GUI or additional feature enters
the delivery scope.

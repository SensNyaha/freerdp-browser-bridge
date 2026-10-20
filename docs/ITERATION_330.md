# Iteration 330 — select a receipt-verified worker in the manual WEB harness

Requirement: let local Windows development exercise the manual reference WEB
form with an isolated linked source-build worker, while keeping the existing
bundled worker as the default. This is harness tooling for the source-build and
manual connection example; it changes no public API, RDP setting, Release
configuration, native binary or dependency pin.

`start-reference-harness.mjs` now accepts `--native-receipt
build/native-clean-ID/receipt.json`, alone or together with `--smoke`. The
receipt loader is shared with the existing RDP resource lab checks: it requires
a linked, unchanged Windows source build against pinned FreeRDP and verifies
both `rdp-worker.exe` and `rdp-runtime-directory.exe` bytes before the local
server, browser or any session is created. Without the option, worker selection
continues to use `build/bundled/rdp-worker.exe`. RDP credentials remain entered
in the visible form, and no session/profile data is persisted.

## Verification

Focused unit tests pass **7/7** for argument bounds, legacy bundled selection,
source-receipt loading and existing resource-lab receipt behavior. The actual
Windows headless Edge smoke with `build/native-clean-7dEHpn/receipt.json`
reports `sourceWorkerSelected: true`, `rdpSessionCreated: false` and
`cleanup: true`. This verifies receipt selection and form startup; it does not
connect to RDP or accept application behavior.

The first full Windows `pnpm check` passes build, lint and formatting, then
records one capacity fixture failure: three of 40 active workers exceeded the
existing resource-query deadline during the paired helper load (maximum query
3,232 ms), with no startup or retirement failures. The same capacity fixture
passes alone: 45 workers created, 902 paired queries, zero policy failures,
maximum query 2,782 ms and empty helper admission after close. A full repeat
passes **742/843 Node tests** (742 passed, 101 platform/profile skips, zero
failures); its capacity case creates 45 workers, completes 810 paired queries,
has zero worker failures and leaves admission empty. The first run and repeat
are recorded here with their observed diagnostics; the capacity timing spike is
intermittent and remains a Stage 10 resource/load gap.

The iteration changes no C++ or native build inputs. Windows native CTest
passes **33/33** against the unchanged native binaries. Linux/manual RDP
verification is not claimed. The attempt to retry lab RDP activation in this
workspace found TCP 3389 reachable, but the existing helper could not start
because the ignored `.local-tests/xrdp-lab.json` is absent.

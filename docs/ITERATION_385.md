# Iteration 385 — actual browser/Notepad Unicode clipboard

2026-10-21. Verifies the real small-text path of SPECIFICATION §2.7 and the
user's P0 MVP objective, preserving existing RWC1 ownership/chunking. The helper
uses public API, ordinary reference viewer controls, actual headed Edge
Clipboard API and the verified linked Debug worker from [378](ITERATION_378.md).
No production/native code, Release profile, dependency pin or wire change.

Each of three Windows connections has separate explicit one-session approval
for the same exact session-only certificate fingerprint. Ignored authorized lab
credentials reach the worker through private IPC. The user supplies an empty
unsaved Notepad and disconnects mstsc. No remote file is saved or arbitrary
command/application launched. Both clipboards may contain only the approved
fixed test data; reports expose booleans/counts/fixed phases, never text.

The first run passes real local Clipboard API paste into the draft with zero
native writes before separate Send, but application roundtrip does not finish.
Its report lacks exact later subphases. The second adds those phases: one native
offer is accepted and 12 key events reach the adapter, but no new remote offer
follows Ctrl+C; zero reads occur. Neither proves a production CLIPRDR defect.
Both exit 1 with empty runtime. Logs: `build/iteration-385-clipboard.log` and
`build/iteration-385-clipboard-repeat.log`.

The third run additionally has approval for one editor-center click and one
native RDP frame on failure. With that single click, both actual chains pass:

- local Clipboard API → explicit Paste → separate public Send → accepted native
  offer → Notepad paste/select/copy → fresh CLIPRDR offer → public Get → exact
  reference-viewer readback;
- public Unicode input replaces the verified document with a different fixed
  value → Notepad select/copy → fresh CLIPRDR offer → public Get → separate local
  Copy → real Clipboard API read confirms the expected value.

Both strings contain Cyrillic, Japanese, supplementary emoji and three lines.
Only CRLF/LF is normalized for comparison. There is one native write, two remote
reads and 24 key events. This accepts the named 1,024-byte bidirectional slice,
not all directions, quotas, formats or actual inter-session isolation.

The third run then fails the test's permission-denial step: its page-scoped CDP
command did not target the owned browser context. A local control corrects it
to browser-level CDP with the single identified context. A new real Edge test
verifies granted → denied through Permissions API, invokes the unchanged UI's
real denied Clipboard API read, observes fixed refusal and zero transfers, then
checks disposal. It accesses no existing clipboard data, writes no OS clipboard
and makes no RDP connection. It passes 1/1 in 1.78 s, separate from application
acceptance (`build/iteration-385-permission.log`).

The third actual invocation exits 1 because of that later test-step failure,
with both roundtrip booleans true, accepted no-format revoke and empty runtime.
The single permitted ignored RDP frame confirms the synthetic document. Test
text may remain unsaved because failure precedes clearing. The corrected helper
clears only its verified test document before the local permission experiment;
that final complete scenario is not rerun on RDP. This is not an overall passing
smoke. Evidence: `build/iteration-385-clipboard-focus-editor.log`.

Existing Edge/actual-WS/fake-RDP direction/explicit-action/retirement cases and
bounded content-free readback tests pass 6/6 in 20.51 s
(`build/iteration-385-clipboard-focus.log`). Their mocked Clipboard API scope is
separate. Full Windows foundation `pnpm check` passes build/lint/format and
835 / 102 profile/platform skips / 937 total, zero failures, in 496.37 s
(`build/iteration-385-check.log`). The new permission test, added after that
run started, passes independently as stated above. Final focused ESLint,
syntax, formatting and `git diff --check` pass; the post-run audit verifies
353 unchanged native inputs, both foundation outputs and all seven protected
inputs. Native CTest 17/17 remains the
unchanged [384](ITERATION_384.md) result.

[MVP acceptance](MVP_ACCEPTANCE.md) now separates P0 evidence from remaining
clipboard cleanup, stable audio, actual input, current Linux and combined soak
gates. Full v1 remains in TODO. Next is active-source audio with existing counters.

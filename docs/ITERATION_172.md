# Iteration 172 — private Windows worker startup

2026-10-13. Implements ARCHITECTURE §2/3 and SECURITY §2/6 after `5c75f26`.
[Ownership contract and retained acceptance](WINDOWS_DIRECTORY_STARTUP.md).

WorkerProcess uses the packaged native creator before owner-marker creation and
worker spawn. It claims only a valid creation receipt, joins normal cancellation
through startup settlement and refuses collision/uncertain output without
deleting objects it cannot prove it owns. No credentials, public wire shape or
advertised device capability change.

Six new Windows tests distinguish actual helper/worker lifecycle from synthetic
receipt/fault seams. The delayed-receipt cancellation fixture holds a completed
native helper result; it does not simulate a still-running native creator.
Missing helper, malformed output, collision, confirmed creation followed by
output fault and publication ordering are covered. Existing missing-worker
coverage now uses a path beside an available helper; a separate case verifies
missing-helper refusal.

Focused worker regression passes 19/19, including 100 sequential actual workers
with heartbeat/shutdown and empty runtime after each. Initial one-second helper
deadline failed during repeated launches; the independent bootstrap deadline is
five seconds, not the shorter protocol-test HELLO deadline.

The first full run was 493/507: synthetic JS microphone workers incorrectly
looked for the helper beside node.exe; two process/UI timeout cases and one
native cleanup deadline also failed. The synthetic seam now uses the trusted
bundle for helper discovery while still launching its fixed JS peer. An initial
fixture correction accidentally replaced the requested legacy peer as well;
that was corrected to preserve every nonsynthetic peer selection. Focused
microphone regression then passed 22/22. Existing Edge/native test deadlines
and audio product behavior were not weakened.

Foundation CTest 10/10 and bundled 22/22 pass with MSVC /analyze /W4 /WX.
CTest must run with the build's temporary drive alias; a direct invocation
without that alias could not locate executables and is not a native test result.
Full bundled `pnpm check` repeat passes **507/507**, with zero failures,
cancellations or skips. Explicit helper/private dependency relocation passes
**1/1**, including normal WorkerProcess startup from the copied bundle.

Unconfirmed bootstrap outcomes, root/ancestor trust, simultaneous hard kill,
other filesystems, actual second-account/service isolation and Linux remain
open. No complete production isolation, remote audio or physical-device claim
is inferred from these checks.

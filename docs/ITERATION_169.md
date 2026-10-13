# Iteration 169 — early microphone DVC allocation profile

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §5/11/12 after
`496acb9`. [Admission and retained gates](AUDIN_EARLY_ADMISSION.md).

Exact public AUDIN identity now selects bounded header admission before native
host assembly/decompression and preserves the existing guarded complete parser.
Four public cases / 30 assertions and two actual linked AUDIN/fake-DVC cases /
61 assertions pass. Linked DVC is 147 cases / 7,909 assertions; bundled CTest
21/21 and MSVC /analyze /W4 /WX pass. The initial fixture expected success after
intentional admission failure; it now checks successful resource retirement
separately from the retained error, plus a normal-close case. No physical or
remote microphone acceptance is inferred.

Foundation CTest 9/9, clang-format and git diff checks pass. Actual authorized
XRDP private PCM input/output-off and Opus input/output-Opus checks pass
heartbeat, 1080p display and empty-runtime cleanup. Input remains waiting epoch
0 and Opus output remains waiting: no permission, physical capture, samples,
remote input or generated audio are used. Ready AUDIN and audible/recording
acceptance remain open.

Actual XRDP/API/Edge H.264 with explicit Opus microphone renders 57 1080p
frames, reattaches/replays cursor and waiting microphone metadata, and cleans
the runtime. Permission requests and sent microphone packets stay zero.
Only one authorized motion and one input reset are sent. No remote recording
or physical microphone acceptance is inferred.

Full bundled `pnpm check` passes 498/498 with zero failures or cancellations.

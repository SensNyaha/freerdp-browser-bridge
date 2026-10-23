# Edge PCM fixture timeout cleanup

Date: 2026-10-12. During iteration 151's full bundled regression, the unchanged
PCM browser fixture reached its 45 s deadline while an uncancelled page.evaluate
kept its child process/browser alive. The completed initial run recorded **497
passed / 1 cancelled of 498**, exit 1. Only its verified Edge process tree (matching
test child parent and unique Playwright profile) was terminated to let that run
finish. No user browser process or product audio module was changed.

The fixture now closes its owned browser when the Node test AbortSignal fires,
reports a fixed phase label, checks abort after launch, and attempts page, browser
and HTTP cleanup through nested finally blocks. Action/navigation bounds are
3/5 s; the existing 45 s overall timeout and all sample/ACK assertions remain.
This fixes resource cleanup and makes a future failure diagnosable; it does not
claim to identify or fix the original browser/runtime stall.

Normal standalone Edge PCM fixture passes **1/1**. A separate ignored build probe
forces an unresolved offline evaluate with a 4 s deadline: the child retains its
timeout failure (exit 1), exits in **5,011 ms** and is **not killed** by the 15 s
outer deadline. Probe artifacts are local build evidence, not production files.
No RDP data, physical microphone or getUserMedia is used.

Full bundled rerun passes **498/498**, zero failures/cancellations, including the
unchanged PCM sample/ACK assertions. The first cancelled run remains recorded.

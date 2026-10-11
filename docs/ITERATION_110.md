# Iteration 110 — microphone reset codec and capability extension

Date: 2026-10-11. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after
private Node PCM admission `e02640f`.

Private reset kinds 42/43 are exact fixed correlated records with nonzero input
epoch and typed scheduled/stale/unavailable/busy results. Worker validates and
explicitly replies unavailable; no reset execution is activated. The Node build
decoder recognizes a fixed versioned eight-byte extension after HELLO's seven
strings; absent extension reports false. Unknown bits, versions, partial/trailing
data and reset without PCM input fail before configuration or credential IPC.
No worker advertises or emits true reset capability in this block.

Two native reset/parser/control-lane cases pass **554 assertions**. The focused
Node codec run passes **16/16**; three actual native TLS-refusal process cases
pass early unavailable reset and continued lifecycle. The first process run
found the new reply missing from control FIFO classification. That routing and
typed validation were fixed, a dedicated queue regression added, and both
focused suites passed on retry. Fuzz dispatch/seeds are prepared; local
Clang/sanitizer campaign remains unrun. Bundled CTest passes **17/17**,
foundation **6/6**, full bundled `pnpm check` **299/299** without skips.
MSVC /W4 /WX /analyze, clang-format and diff checks pass.

After the user restored XRDP access, the authorized actual lab H.264/Opus check
passes: **43 frames at 1920×1080**, cursor replay/reattachment, one permitted
pointer motion and one release reset, gesture/worklet activation and empty
runtime cleanup. Opus source remains waiting at epoch 1 with zero remote audio
packets/played frames; remote audio was not generated and audible acceptance
remains false. This is a current regression check, not microphone acceptance.
Local evidence: `build/iteration-110-xrdp-opus.log`.

No browser/host capture or actual microphone acceptance is claimed. Owner/reset
ordering, Node reset API, public lease/permission/transport and real remote /
physical/LAN/platform/core limits remain open. [Contract](MICROPHONE_RESET.md).

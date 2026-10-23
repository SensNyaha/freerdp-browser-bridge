# Iteration 97 — scoped AUDIN backend loading

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 following public device adapter `6860c26`.

AudinProvider selects only the exact context-bound browser backend with fixed
internal arguments. Registration is attempted once even if the registrar fails;
owner/reentrant checks preserve callback and retirement ownership. Its bounded
scope composes with RDPSND in either order. General AUDIN channel loading stays
explicitly refused until a DVC ingress/lifetime guard is available.

Six new cases pass **197 assertions**. Three actual pinned static AUDIN fixtures
with fake DVC transport cover PCM negotiation/stereo payload/mono format change,
fresh input epochs, write failure, RegisterPlugin failure and delayed host
termination after owner retirement. Pure/public-provider fixtures cover exact
arguments/context, non-null selector refusals, foreign calls, uncertain handoffs,
reentrant retirement and reverse-order composition. Together with the adapter,
AUDIN has **12 cases / 2,240 assertions**.

Initial test compilation caught a signed/unsigned expected-error ternary; its
test type was corrected. Microsoft protocol review also replaced the short
fixture Open with its complete capture-format descriptor. Final bundled CTest
passes **17/17**, foundation **6/6**, /W4 /WX, MSVC /analyze and clang-format pass.
Full bundled `pnpm check` passes **276/276** Node cases without skips. Worker and
public microphone capability remain disabled; no browser/host/remote microphone
input was used. [Contract and remaining guards](AUDIO_AUDIN_PROVIDER.md).

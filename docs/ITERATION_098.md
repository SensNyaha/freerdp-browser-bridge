# Iteration 98 — bounded AUDIN negotiation ingress

Date: 2026-10-11. Implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 after scoped backend `9caed47`.

AudinIngress validates ordered complete server records before parser allocation,
filters a bounded table into consistent supported PCM and checks the selected
index/full Open preference/100 ms frame budget. Reserved server size and arbitrary
trailing Formats data are correctly ignored under the record limit. A no-common
format result explicitly refuses forwarding into upstream's zero-count parser.
The retained table is fixed storage; no per-record allocation/queue is added.

Six portable cases pass **442 assertions**. Two new actual pinned AUDIN/fake-DVC
fixtures pass **72 assertions**: mixed offers omit PCM24 before negotiation and
produce selected mono silence, while excessive table count/FramesPerPacket cause
no upstream reply/device Open. AUDIN public adapter/provider/linked fixtures now
have **14 cases / 2,312 assertions**. Final foundation CTest passes **6/6**,
bundled **17/17**, /W4 /WX, MSVC /analyze and clang-format pass. Full bundled
`pnpm check` passes **276/276** Node cases without skips.

Dedicated audin-fuzz, four-phase input preparation and seed-corpus CI are added;
the four seeds generate locally. Local LLVM inventory has no Clang compiler, so
libFuzzer/ASan/UBSan execution remains unverified. The production channel loader
continues to refuse AUDIN; fixture placement is not production callback lifetime,
server/browser microphone or remote acceptance. No host/browser capture or remote
input was used. [Contract and retained gates](AUDIO_AUDIN_INGRESS.md).

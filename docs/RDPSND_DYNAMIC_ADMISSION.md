# Dynamic RDPSND admission

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §11/12 after
`b63b906`, without changing the FreeRDP 3.32.1 pin or public ABI.

The public DVC registry resolves the exact `AUDIO_PLAYBACK_DVC` name and selects
an internal audio role. Graphics and other channels retain their prior owners.
Before host dispatch, known audio DATA_FIRST/DATA headers are reinspected with
at most 64 KiB declared message/decoded output and 128 KiB encoded input;
trusted narrower limits remain narrower. At most 4,096 codec segments apply.
Oversized declarations fail before reservation and native pool assembly.
Compressed records receive this profile before SDK decompression.

The complete callback validates RDPSND in one fixed 64 KiB arena before the
original rdpsnd OnDataReceived, which otherwise takes/copies a pool stream
before parsing. Callback identity/pInterface is retained, with a temporary
checked stream over owned bytes; caller stream position is preserved.
No device choice, output selection, wire contract or capability changes.
Up to 32 registered channels imply at most 32 fixed audio arenas; this is
not a retained-pool or whole-process RSS bound.

The existing logical DATA_FIRST deadline covers host assembly; a separate
nonrenewing 2 s audio deadline spans the complete legacy WaveInfo/raw-Wave pair.
Registry/worker polling observes audio expiry even without audio traffic.
Close wipes prepared audio before delegated teardown; nested close waits for
the active callback borrow. Failed callbacks release the logical reservation
after return. No retry of uncertain application delivery is added.

Five public ABI and three actual linked rdpsnd/drdynvc/fake-SVC cases pass 120
assertions. They cover exact capacity, compressed/encoded claim bounds,
PDU refusal, legacy expiry, nested close, PCM negotiation and scoped provider
dispatch. Rejected PDU delivery may cause a native drdynvc CLOSE; that control
write is distinguished from audio replies. Linked DVC suite passes 143 cases /
7,879 assertions; bundled CTest 21/21 passes with MSVC /analyze /W4 /WX.

Earlier transport/core allocation, codec dictionary/working memory and retained
pool capacity remain separate requirements. Same-plugin reopening, other formats/
DSP, audible remote samples, actual hostile/lost transport, Windows-server/Linux,
sanitizer/fuzzer and soak acceptance remain open.

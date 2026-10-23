# Iteration 149 — actual drdynvc host and worker admission

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after public
receive adapter `19b8f25`. Worker admission now precedes actual pinned drdynvc
outer assembly, DATA_FIRST allocation and compressed-DVC decompression through
the saved public receive callback. The RDP thread owns hook installation,
deadline polling and retirement/restoration; other SVC arguments remain unchanged.

Six new actual-linked drdynvc / fake-SVC tests use public static entrypoints and
a fixture listener, including compressed first/continuation, refusal before host,
12 MiB legitimate data, two logical channels and partial shutdown. Combined
linked suite **29 cases / 3,386 assertions**, bundled CTest **18/18** pass with
MSVC /analyze /W4 /WX. No dependency source/pin/ABI/wire/capability changes.
Initial fixture compilation required explicit public header/pointer/callback
checks; no warnings were suppressed. This is actual host evidence with simulated
transport, not actual hostile RDP, negotiated GFX or remote device acceptance.
[Contract and remaining resource/lifetime gates](DVC_WORKER_INGRESS.md).

Full bundled `pnpm check` **498/498**, foundation CTest **7/7**, private runtime
relocation **1/1** pass. The restored authorized XRDP also passes real Edge
H.264 (**60** initial frames) and JPEG (**57**) resize/restoration
1920×1080 → 1280×720 → 1920×1080, display/cursor replay and reattachment.
Both helpers send one motion and four release/reset operations across display
epochs, no keys/buttons/wheel/text/touch. Actual RDPEI reports ready with ten
contacts, heartbeat and JPEG frame, **no touch sent**. Selected Opus input with
output off renders **67** H.264 frames and replays microphone waiting revision 1 /
epoch 0: **zero permission requests, zero samples**, no remote microphone/audio
acceptance claimed. All lab helpers exit cleanly and runtime directories are empty.

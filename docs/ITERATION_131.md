# Iteration 131 — bounded microphone Opus packet codecs

Requirement: SPECIFICATION §2.6 / MEDIA_PIPELINE §7, timestamped Opus microphone
transport with bounded packets and explicit codec delay. Added standalone native /
Node private payload and prepared Node/browser RWB1 type 10/stream 4 codecs.
They preserve measured encoder lookahead; they do not guess or remove it.
No capture, public negotiation, private kind, settings or capability is enabled.

Five Node/browser cases pass independent public/private golden vectors,
borrowed compressed storage, exact metadata and size limits, all 256 TOCs,
clock/epoch/sequence/lookahead extrema, shared/detached refusal and unchanged
producer bytes. Three portable native cases cover the same private golden
profile, borrowed storage, bounds/TOCs and fixed output construction.

Full `pnpm check`: **419/419** pass. Bundled CTest **17/17** and foundation
CTest **6/6** pass; focused native parser **3 cases / 334 assertions** pass.
The IPC libFuzzer entry also tries the standalone bounded payload, with a
27-byte seed generated and checked locally. The Linux fuzz/sanitizer job has
not run here and is not counted as acceptance. MSVC /analyze and warnings as
errors pass in both native builds; native formatting and diff checks pass.
Actual AUDIN, codec-delay integration, permission/lease/dispatch composition,
Linux/sanitizer/fuzz/resource and physical/LAN/soak acceptance remain open.

[Wire contract](MICROPHONE_OPUS_WIRE.md).

# Iteration 124 — browser microphone media command and ACK ownership

Date: 2026-10-11. Implements SPECIFICATION §2.6 / PROTOCOL §6 /
MEDIA_PIPELINE §7 after browser graph `2626e4f`.

The negotiated client binds exact profile/source metadata to one start, one
stop and one local sender token. Stop cancels pending start while preserving
issued correlations, and waits for stopped plus observed grant/retirement clear.
A media-owner poll preserves packet ACK/deadline handling after graph stop.
Late replies, invalid correlation/source/clock/transport and reentrant command
callbacks close admission without adopting another owner's grant.

Focused **14/14** pass: seven new pure cases, one new actual loopback WebSocket
case using this browser module under Node/fake RDP, and six existing transport
cases. The new socket case holds private admission, sends latest synthetic PCM,
observes stop/reset and restarts at the fresh epoch. Initial focus passed 13/14
because the new client expected only v/type/data; actual server envelopes also
carry seq/ts. The parser now validates the existing five-field server envelope;
the corrected focused run passes 14/14.

The first full check stopped at lint's no-this-alias rule in the sender facade;
the facade now uses lexical callbacks and a copied statistics getter.

Final verification — 2026-10-12: bundled `pnpm check` passes **387/387**, without
skips. Unchanged bundled CTest passes **17/17**, foundation **6/6**. Formatting
and diff checks pass.

No physical permission/capture, actual Edge graph/socket composition or ready
AUDIN is established. Startup context ownership, viewer/native selection,
physical/remote/LAN/platform, native resampling and Opus input remain open.
[Current contract](MICROPHONE_MEDIA_CLIENT.md).

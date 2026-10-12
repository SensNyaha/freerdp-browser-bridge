# Worker DVC admission before pinned host dispatch

Iteration 149 implements SPECIFICATION §3.1 / ARCHITECTURE §12 after public
adapter `19b8f25`. The worker installs DvcReceiveGuard on its RDP thread before
freerdp_connect, retaining the original public ReceiveChannelData callback.
The context's existing synchronous dynamic-channel / no async channel-update
profile is checked before installation. The public SVC-name lookup selects
drdynvc; other channels retain their argument-preserving delegation.

Only complete inspected drdynvc messages reach pinned outer host assembly,
DATA_FIRST allocation or compressed-DVC ZGFX dispatch. The existing bounds from
iterations 146–148 apply: encoded 16 MiB + 64 KiB, logical and decoded claims
16 MiB, at most 4,096 ZGFX segments, one partial outer buffer and nonrenewing
2 s deadline. Both sides of each event batch poll it; idle connected waits are
at most 50 ms. During blocking connect, callback-time checks and the existing
finite connect watchdog apply; idle 2 s reclamation is not claimed there.

Failure refuses forwarding and publishes stable protocol failure through the
existing session model. Normal disconnect retires upstream channels first; then
the guard releases its staged bytes and restores the saved public callback before
the terminal state. The adapter outlives context destruction. An unexpected
callback replacement is a cleanup failure and is not silently overwritten.
There is no new thread, queue, public wire field or advertised feature.

Six tests load actual pinned drdynvc through public static entrypoints, with
simulated SVC transport and a fixture DVC plugin using public manager/listener
interfaces. They exercise guarded outer fragments plus logical DATA_FIRST,
actual compressed first/continuation literal decoding, huge logical and independent
decompression claims refused before the host, a valid 12 MiB payload, two
independent partial logical channels and shutdown after outer abandonment.
The fake transport's resolver supplies its fixture SVC ID; production uses the
public lookup. True dispatch is not application acknowledgement; channel errors
are checked independently. The large payload is synthetic data, not negotiated
GFX. Combined linked cases pass **29 / 3,386 assertions**, bundled CTest **18/18**
under /analyze and /W4 /WX.

The fixture's initial compile failures were corrected with explicit public svc
header, byte-pointer conversion, function-pointer address and checked init callback;
no warning suppression or dependency changes. No FreeRDP source/pin/public ABI
changes. This gate bounds inspected individual claims, not total process memory.
Pool retention, transient realloc, codec scratch/dictionaries, cumulative channel
and concurrent logical allocation, abandoned logical messages, nested GFX ZGFX,
control/codec allocations, actual malicious/lost transport, Windows server,
Linux/sanitizers/fuzz and soak remain open. Lost touch terminal release is still
not established by transport-return success.

Verified restored XRDP compatibility: actual Edge H.264/JPEG resize/restoration,
cursor/display reattachment, RDPEI readiness without touch, and selected Opus
input waiting without physical capture or sample transmission. Full bundled Node
498/498, foundation CTest 7/7 and native relocation 1/1 pass.
[Current evidence](ITERATION_149.md). Windows-server/actual GFX and resource gates
listed above remain open.

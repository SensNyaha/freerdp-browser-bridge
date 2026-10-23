# Iteration 143 — selected PCM/Opus browser microphone client

Date: 2026-10-12. Implements SPECIFICATION §2.6 / MEDIA_PIPELINE §7 after Opus
sender `785c2c8`. The exact negotiated codec/record-size pair selects the sender
behind the existing command, permission-token and graph facade. Opus is lazy
until authorized ready-source input; no fallback or automatic capture is added.
Stop retires unissued encoding while preserving an issued packet's actual ACK.
The existing media poll still enforces preparation/issued deadlines after graph
shutdown. Local helper routes now include the new imported codec modules.

Focused client/sender/Edge checks pass **25/25**, including five new portable
client cases and six Edge/Worklet/actual loopback-WS cases across PCM/Opus and
stop/controller loss/permission denial. Additional instrumentation verifies
actual Edge codec instances close and denied permission creates none. These
fixtures replace getUserMedia with synthetic streams/results and use a fake RDP
backend. No physical or remote recording acceptance is claimed. Viewer Opus
selection, ready AUDIN/recording/LAN/platform/resource/failure injection and soak
remain open. [Contract](MICROPHONE_MEDIA_CLIENT.md).

The instrumented Edge composition regression passes **6/6**; full pinned-Node-24
`pnpm check` passes **478/478**. CTest bundled **17/17** and foundation **6/6**,
formatting and diff checks pass. No native ABI or public wire shape changes in
this block; exact negotiated profiles are the existing iteration-140 contract.

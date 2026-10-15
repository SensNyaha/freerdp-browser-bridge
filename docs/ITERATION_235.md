# Iteration 235 — finite large-clipboard reservation and byte chunks

2026-10-15. Implements prepared framing/reservation for SPECIFICATION §2.7,
following controller ownership `d878deb`.
[Current contract](CLIPBOARD_CHUNKS.md).

Factories receive only a frozen optional numeric item maximum. The native
adapter reserves one maximum private packet plus 64 KiB ordinary control
headroom; insufficient explicit host limits refuse before private process
construction. Existing unreserved defaults and pending-request limits remain.
No credentials/config object enter the factory argument. Reservation alone does
not remove the native public-selection gate. Example factories forward it.

Prepared RWC1 version-1 codecs independently encode/decode bounded 4 KiB records
in strict TypeScript and browser JavaScript. Exact version/flags/length, sequence,
absolute item-offset bounds, owned encode and borrowed decode pass independent
vectors and malformed boundaries. A full 16 MiB UTF-8 fixture reconstructs through
4,117 records with identical hashes despite scalar splits. Whole-item quota,
current authority and the eight-record credit window require the next transfer
owner; these codecs neither assemble nor activate a public socket.

An actual synthetic Node child uses the adapter's reserved private process for
one valid full 16 MiB set, revoke, heartbeat and joined empty-runtime cleanup.
This exercises bounded framed IPC, not RDP or browser/OS clipboard. Constructor
quota extrema, explicit-host refusal/preservation, unchanged defaults, frozen
nonsecret factory limits, retained public-start refusal and manager/control
composition pass. Focused Windows tests pass 14/14. The first constructor fixture
omitted the required runtimeRoot and failed before startup; the fixture now
supplies its owned workspace path, without weakening constructor validation.

Full bundled Windows `pnpm check` passes 617 with 49 platform skips / 666 cases;
Linux passes 612 with 54 skips / 666 cases. Native CTest baseline passes Windows
29/29 and Linux 30/30. Evidence: `build/iteration-235-*`.
No C++ parser/channel owner changes; sanitizer/fuzzer evidence remains scoped to
Iteration 233. Native private carrier maxima were already implemented earlier.

Public command/reassembly/credit, gesture/permission/browser integration, actual
remote data/revoke and resource/network/platform acceptance remain open. No lab
clipboard mutation approval is reused and no host clipboard is accessed. This
is not Stage 7 completion or a new independent release stage.

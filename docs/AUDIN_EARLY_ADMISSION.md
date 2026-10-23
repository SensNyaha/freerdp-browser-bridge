# Early AUDIN dynamic-channel admission

2026-10-13. Implements SPECIFICATION §3.1 and ARCHITECTURE §5/11/12 after
`496acb9`, using the pinned public channel identity APIs.

An accepted channel named exactly `AUDIO_INPUT` selects the internal microphone
role. Known DATA_FIRST/DATA input is reinspected before drdynvc dispatch with
the existing AudinIngress 64 KiB ceiling for logical message and codec output,
plus 128 KiB encoded input and the existing 4,096-segment ceiling. Trusted
narrower limits remain narrower. Excessive claims fail before host allocation /
decompression and before logical reservation. Other names retain their existing
profiles; no global microphone limit is applied to graphics traffic.

The complete callback also refuses more than 64 KiB before delegate dispatch.
Otherwise it preserves the original stream, callback identity and existing
guarded AUDIN parser, negotiation, capture and retirement ownership. No second
microphone parser, capture arena, device selection, permission, wire extension
or advertised capability is introduced. Existing logical assembly deadlines
and aggregate reservations still apply.

Four public ABI cases / 30 assertions cover exact/excessive capacity, original
stream forwarding, exact-name selection and compressed claims. Two actual
linked guarded AUDIN/fake-DVC cases / 61 assertions negotiate a synthetic
virtual source through this callback chain. Refused DATA_FIRST does not enter
AUDIN, write replies, or mutate the opened source epoch. Normal cleanup returns
success; cleanup after an admission failure retains that failure independently
of resources being retired. Linked DVC suite passes 147 cases / 7,909 assertions;
bundled CTest 21/21 passes with MSVC /analyze /W4 /WX.

These fixtures do not capture a physical microphone or record on an RDP server.
Actual ready AUDIN, core/codec/retained-pool/RSS/CPU limits, lost transport,
same-plugin reopening, platforms, sanitizers/fuzzer and soak remain open.

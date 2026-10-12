# Prepared Opus microphone IPC envelope

Iteration 134 prepares the private transport for SPECIFICATION §2.6 /
MEDIA_PIPELINE §7. Input RWI1 kind **44** (`MicrophoneOpus`) carries the existing
[input-specific payload](MICROPHONE_OPUS_WIRE.md), 26..1,299 bytes, with nonzero
u64 request ID. Native and Node reject incorrect class lengths/correlation from
the fixed 24-byte header before body allocation. Result kind **40** keeps the
same four-byte accepted/stale/unavailable/busy/invalid grammar as PCM.

Current bundled/foundation workers validate kind 44 and always return unavailable
without invoking a decoder or AUDIN. HELLO/CLI/capability REST advertise no Opus
input. Public/private typed microphone settings remain PCM-only; RWB1 type 10
is still unselected. Valid framing is not authority or supported input.

Private CONFIGURE schema **8** keeps prior lengths and assigns bit 5 (32) to
Opus input. Other flags remain dynamic resolution 1, touch 2, PCM output 4,
Opus output 8 and PCM input 16. Input bits 16/32 are mutually exclusive, as are
output bits 4/8; directions remain independent. Bits 6..31, truncation/trailing
data and older-schema Opus claims are refused. False/omitted `opusInput` keeps
the previous encoder bytes/schema. Only true chooses schema 8.

The linked Connection explicitly refuses `opus_input` before settings mapping,
secret delivery or connect; foundation configuration remains unsupported.
No unsupported codec silently becomes PCM/off. The output dispatcher may inspect
the independent output selection before Connection rejects input; no RDP
connection or source is activated. Native producer body copies for PCM/Opus
microphone input are overwritten on scope exit, after any selected slot has
copied them. This does not guarantee SDK/allocator/compiler memory erasure.

Native tests cover every low-byte flags combination, older schemas, high bits,
truncation/trailing data and header extrema. Node tests cover independent
golden schema-8 bytes, unchanged legacy settings, invalid booleans/mixed modes,
all record splits and header refusals. Actual native processes verify bounded
unavailable replies at minimum/maximum body sizes, heartbeat/shutdown, and
configuration refusal without sending credentials/connect. They exercise native
lifecycle, not fake peers or successful RDP/audio/device integration.

The IPC fuzzer includes kind-44 payload validation and generated envelope /
schema-8 seeds. Linux fuzz/sanitizer execution remains unverified here. Codec
owner-thread dispatch, selection/capability, Node/browser ownership and actual
microphone/resource/platform/LAN/soak gates remain open.

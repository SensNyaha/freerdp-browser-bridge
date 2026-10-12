# RDP-thread Opus microphone composition owner

Iteration 135 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7 composition between the bounded decoder and existing guarded
MicrophoneSession. This component is not selected by Connection/worker settings
or advertised as Opus input yet. Kind 44 still replies unavailable; schema 8
selection still fails. No browser/physical capture or new transport is activated.

`MicrophoneOpusOwner` borrows one live MicrophoneSession on its RDP thread. It
owns one lazily constructed OpusCaptureDecoder, fixed codec scratch/partial PCM
and scalar counters; no packet queue, thread, timer or per-packet bridge sample
allocation is added. Producer handoff and source ring remain separate bounded
components. Caller must serialize calls and preserve the borrowed session;
retirement joins input first and destroys codec ownership before session teardown.
Destruction performs no FreeRDP or borrowed-session call.

`MicrophoneSession.input_ready(epoch)` checks actual negotiated gate readiness,
active retirement/publication state, opened source, current nonzero source epoch
and already admitted matching ready publication on the owner thread. A cached
ready snapshot alone cannot admit input after actual channel Close/reset. This
is source authority, not browser permission or a public capture grant.

Submit refuses wrong thread, retirement/failure, unavailable/unpublished source
and stale epoch before SDK work. Packet bounds/TOC/delay/time and first boundary
are checked before lazy SDK allocation. Ordinary invalid input preserves current
prediction/partial PCM; changed source clears obsolete prediction before any new
packet can allocate/decode. Nonzero reported delay primes one input with no PCM;
admission is accepted because the current source/codec consumed it, not because
AUDIN sent remote samples. Complete compensated 960-frame units are synchronously
copied into the existing bounded source through MicrophoneSession.submit.

`synchronize` drops codec state on source loss, unpublished/current epoch mismatch
or changed source. `invalidate` explicitly drops prediction/partial PCM; caller
still owns source reset and permission/lease barriers. `retire` is idempotent and
prevents future admission. These operations refuse foreign thread/reentrant use.
Wrong-thread submit returns unavailable without reading mutable SDK state or
changing counters; stats on foreign thread return empty.

After successful decode, refused downstream PCM is never retried. Ordinary
source loss/staleness clears prediction; invalid/busy downstream state latches
failed admission. Unexpected SDK/resource exception also fails and clears.
Invalid packet/profile/clock returns invalid without advancing prior prediction.
A failed owner cannot recover through invalidate/synchronize; the future host
must enforce its worker failure/reset policy. SDK failure injection and worker
failure propagation remain unverified. Scalar lifetime counters saturate; stats
contain no audio bytes, credentials, request IDs or peer labels.

Five actual-linked AUDIN/fake-DVC cases / 211 assertions verify published versus
actual readiness, delayed admission, stale/invalid refusal before allocation,
compensated PCM entering the real public AUDIN callback, reset/fresh boundary,
foreign threads, invalid-input continuation, failed downstream admission, and
actual channel Close while publication is intentionally still ready. They use
synthetic PCM and the actual pinned Opus SDK/public channel. No RDP server,
physical microphone, host sound service or audible/recording acceptance is used.

Worker selection/dispatch/capability and failure propagation, Node/browser
permission/lease/credit, larger format/resampling support, resource/platform /
sanitizer/fuzz, actual server/device/LAN/soak gates remain open.

[Compensation](MICROPHONE_OPUS_CAPTURE.md), [handoff](AUDIO_CAPTURE_HANDOFF.md),
[private preparation](MICROPHONE_OPUS_IPC.md).

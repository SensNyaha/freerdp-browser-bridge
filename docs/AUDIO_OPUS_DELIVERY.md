# Preparatory Opus transport ownership

Iteration 90 (2026-10-11) implements SPECIFICATION §2.6, MEDIA_PIPELINE §6 and
ADR-008 in an isolated OpusMediaSender. It is not selected by the public API or
reference viewer yet. PCM delivery and native codecs are unchanged.

One uint32 audio sequence and one bounded receiver credit are shared by RWB1
source state/config/encoded packet. True send admission means an ordered bounded
consumer copied the record. Refused sends preserve sequence and copied bytes;
accepted records have a finite ACK deadline. Source validation checks schema,
TOC/size, readiness, config/epoch, first discontinuity and increasing capture PTS.
Encoded bytes, native PTS and packet flags are forwarded unchanged. The owner
retains one copied encoded payload (2..1275 bytes), two pending metadata records
and one flight's scalar sequence/deadline/size; it creates no socket or timer.

An attachment's ready snapshot preserves source/config metadata but requests a
native reset for that epoch before delivering compressed data. It cannot replay
predictive history by rewriting discontinuity. During recovery, old packets are
validated and dropped without owned payload allocation. An occupied pending
packet similarly discards both old/new candidates and requests one recovery.
Repeated old packets keep no payload queue and do not create further requests.
The outer owner reads resetEpoch and schedules WorkerProcess.resetAudio; this
class does not itself call the worker or claim that a reset result is completion.

Existing in-flight credit remains valid through reset/status changes. Pending
config/data are cleared, and a strictly newer source epoch ends recovery. Waiting
status in that epoch can remain idle indefinitely without artificial samples;
ready/config and native-marked first data then resume ordinary prediction.
Metadata states may coalesce before send. Neither a config replay nor an ACK
rewrites prediction. Recovery must observe a newer epoch within timeoutMs of the
first recovery pump (20..2000 ms); missing progress fails boundedly. Native reset
correlation/scheduling and this observation deadline are distinct responsibilities.

Close/failure clears owned encoded bytes, pending metadata and credit. Invalid
clocks/reentry preserve ownership; send exceptions, invalid admissions, malformed
source order, expired/wrong ACK and sequence exhaustion fail closed without wrap.
Saturating diagnostics contain counts, queue bytes, credit/pending flags and
sequence; they contain no payload, PTS, epoch/identity labels or secrets.

Seven portable unit cases and one fake-private-IPC integration case verify
original bytes/PTS/flags, copied storage, blocked retries, snapshot/native reset,
100 skipped packets with one recovery, fresh epoch boundaries, old ACK retention,
deadlines/clock/sequence limits and cleanup/reentry/failure. The linked handoff
uses a fake worker and logical receiver clock; its Opus TOC bytes are framing
fixtures rather than entropy/audio acceptance. Public WebSocket negotiation,
lease/retry/lifetime orchestration, browser integration, actual recovery/audio,
microphone and resource/platform/LAN/A/V/soak gates remain open.

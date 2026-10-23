# Stage 6 — historical implementation records

Archived from TODO.md on 2026-10-13. These are the original iteration-time
statuses and retained gaps, not the current task queue. Later evidence may
supersede an earlier statement that selection/transport was inactive. No
requirement or historical evidence was removed. The current component statuses
and outstanding acceptance gates are in [TODO.md](../TODO.md#stage-6--audio-output-and-microphone).

## Stage 6 — audio output and microphone

- [~] IN PROGRESS — Typed PCM backend events now pass scalar manager validation
  to one current media lease subscriber; detached samples are discarded, metadata
  is copied, and cleanup/stale unsubscribe/consumer faults preserve ownership.
  Fake backend SDK fixtures pass; no public audio negotiation/WS route or audible
  acceptance is added. [Evidence](ITERATION_067.md).

- [~] IN PROGRESS — Windows guarded static PCM selection is opt-in through private
  settings v5/HELLO and typed Node source/config/sample events. LoadChannels runs
  after actual core channel replacement; pre-GDI TLS rejection/cancellation and
  bounded retirement/cleanup pass. Actual idle XRDP connects, reports waiting,
  captures a desktop and closes, with no audio packets observed. Public media,
  audible/browser and transport/latency/resource gates remain open. [Evidence](ITERATION_066.md).

- [~] IN PROGRESS — Guarded static browser/PCM sink is selected by opt-in Windows worker/public settings, with bounded production ingress and serialized teardown. Actual native TLS cleanup and synthetic linked channel fixtures pass. Actual remote samples/negotiation and audible output remain open. [Private activation](ITERATION_066.md), [public viewer](ITERATION_071.md).
- [~] IN PROGRESS — Public pinned RDPSND device callback adapter feeds the bounded PCM pipeline, applies stereo volume, resets on loss and retires owner resources before delayed host Free. Native ABI/lifecycle fixtures pass; worker registration, upstream resource audit and actual server/browser audio remain open. [Contract](AUDIO_PCM.md#public-rdpsnd-device-adapter), [evidence](ITERATION_038.md).
- [~] IN PROGRESS — Scoped public rdpsnd/browser loader binds one synchronous context and preserves other addins. Actual pinned static RDPSND with fake SVC registers the backend, negotiates PCM and dispatches Wave2 into the sink. Upstream reassembly/DSP limits and Close/timestamp gaps are recorded; worker activation and actual remote/browser audio remain open. [Evidence](ITERATION_039.md), [audit](AUDIO_PCM.md#scoped-rdpsnd-backend-loading).
- [~] IN PROGRESS — Fixed 64 KiB SVC assembly and bounded RDPSND PDU validation run ahead of the actual static channel in fake-SVC fixtures, including legacy Wave. Oversized advertised record/count claims are refused before upstream dispatch. Production callback placement, earlier core/DSP limits, raw flags and stream-clock/reset remain open. [Evidence](ITERATION_040.md).
- [~] IN PROGRESS — Public static SVC callback adapter now places ingress limits ahead of actual RDPSND, handles raw flags and Close/reset, bounds outgoing confirmations and retires before delayed host Terminated. Actual linked channel/fake-SVC fixtures pass. Top-level provider/worker selection, real transport lifetime/close faults, earlier core/DSP limits and timestamp gaps remain open. [Evidence](ITERATION_041.md).
- [~] IN PROGRESS — Scoped general addin loader now selects the guarded static browser/PCM path with fixed internal arguments and refuses unprotected dynamic/legacy paths. Actual linked channel/fake-SVC tests cover full loader dispatch and completion-bound provider lifetime. Supported PCM offer policy, worker selection, clocks, close faults, earlier core limits and actual audio acceptance remain open. [Evidence](ITERATION_042.md).
- [~] IN PROGRESS — Guarded static negotiation now filters offers to consistent supported PCM8/PCM16 mono/stereo 8..48 kHz in fixed storage and checks selected client indices before Wave dispatch. Mixed PCM24/PCM16 and no-common-format behavior pass actual linked channel/fake-SVC tests. Broader formats, worker activation, clocks, close faults, earlier core limits and actual remote/browser audio remain open. [Evidence](ITERATION_043.md).
- [ ] PCM normalization/resampling layer.
- [~] IN PROGRESS — Guarded baseline keeps one negotiated PCM table per connection and explicitly refuses replacements before upstream mutation. Initial-table source switching from 48 kHz stereo PCM16 to 8 kHz mono PCM8/PCM16 passes actual linked channel/fake-SVC conversion/reset checks. Broader renegotiation, bursts, worker/browser and actual audio acceptance remain open. [Evidence](ITERATION_047.md).
- [~] IN PROGRESS — Guarded RDPSND retirement retains failed host handles/status, drains confirmations and retries one close per later owner call before finishing pinned public cleanup. Status/exception/repeated/duplicate/owner recovery fixtures pass with actual linked channel/fake SVC. Real transport shutdown and finite worker deadlines remain open. [Evidence](ITERATION_045.md).
- [~] IN PROGRESS — RDPSND volume now uses a documented perceptual -60..0 dB nonzero scale, exact mute/full identity and independent stereo Q30 gains computed only at volume changes. Exhaustive portable and actual linked channel/fake-SVC checks cover the law; worker/browser audible acceptance remains open. [Evidence](ITERATION_044.md).
- [~] IN PROGRESS — Isolated native PCM8/PCM16 mono/stereo 8..48 kHz normalization to S16LE 48 kHz stereo, rational phase, fixed output capacity and atomic rejection are implemented. Wider/higher-rate formats, pipeline/backend integration and actual audio acceptance remain open. [Contract](AUDIO_PCM.md), [evidence](ITERATION_036.md). Stage 5 hardware/remote gates remain open.
- [ ] PCM media transport + AudioWorklet playback.
- [~] IN PROGRESS — Typed backend/media lease ownership and one-record PCM delivery credit are implemented. Status/config/samples share one exact ACK, scalar metadata and one copied latest 3,840-byte sample packet; stop/reset clears unsent samples and attachment starts discontinuously. Pure/fake-backend fixtures pass. Public WS selection, browser admission ACK, gesture activation and actual audible/latency acceptance remain open. [Lease evidence](ITERATION_067.md), [record credit](ITERATION_068.md).
- [~] IN PROGRESS — Opt-in PCM hello/ready, ordered stream-3 forwarding and independent audio ACK are implemented for typed backends. Real local WebSocket/fake-backend tests verify credit, latest/stop/recovery, bounded ACK/rate deadlines and listener cleanup. Public native selection, browser Worklet admission/gesture integration and actual audible RDP remain open. [Socket evidence](ITERATION_069.md).
- [~] IN PROGRESS — Browser PCM record-credit mode acknowledges status/config/samples only after the corresponding accepted Worklet command. Pure and real Edge synthetic PCM fixtures verify exact deferred ACK, stats independence, Close clearing and context-loss cleanup. Harness gesture/routing, public native selection and actual audible RDP remain open. [Worklet evidence](ITERATION_070.md).
- [~] IN PROGRESS — Reference harness PCM opt-in stages attachment until an explicit user gesture prepares AudioContext/Worklet, then routes ordered stream 3 independently of video decode and sends only admission ACKs. Public NativeSessionWorker selection is activated. Actual Edge/socket/Worklet synthetic fixtures, native strict TLS/cleanup and fake legacy refusal pass. Actual audible RDP and broader gates remain open. [Current viewer evidence](ITERATION_071.md).
- [~] IN PROGRESS — Private pinned libopus 1.6.1 encoder accepts fixed 20 ms stereo PCM,
  exposes queried lookahead and bounded packets, and preserves prediction/output on
  invalid input. Real SDK stereo decode/reset/boundary tests and private DLL relocation
  pass. Worker/publisher/framing, browser decode/priming, Linux/resource and audible
  acceptance remain open; public Opus selection is still explicitly unsupported.
  [Contract](AUDIO_OPUS.md), [evidence](ITERATION_073.md). Encoder: `6cc179b`.
  [Stable Windows build environment evidence](ITERATION_074.md) verifies repeat
  dependency builds without transient caller PATH invalidation; fresh-checkout/Linux
  gates remain open.
- [~] IN PROGRESS — Versioned native/TypeScript Opus payloads and RWI1 kind 36 now
  bound one stereo 20 ms frame before body allocation/copy. Independent vectors,
  exhaustive TOC/boundary/fragmentation and actual encoder compatibility pass;
  current PCM-only output lane refuses Opus without retaining it. No Opus HELLO,
  settings, publisher, public media or browser path is activated; those gates and
  actual audible/platform/resource acceptance remain open. [Payload contract](AUDIO_OPUS_WIRE.md),
  [evidence](ITERATION_075.md). Opus SDK: 6 cases / 990 assertions.
- [~] IN PROGRESS — Fixed Opus source state and bounded RWB1 state/config/packet
  encoders plus an isolated browser parser pass independent vectors and malformed
  profile/TOC/clock/sequence checks. The viewer does not import the parser yet;
  decoder, publisher, negotiation and audible acceptance remain open.
  [Wire evidence](ITERATION_076.md).
- [~] IN PROGRESS — Isolated browser Opus decoder owns one decode/admission credit,
  closes AudioData and retires decoder/Worklet/context on failure. Real Edge decodes
  pinned SDK stereo tones with queried-delay correlation and Worklet ACKs; source,
  malformed-output, late-callback and timeout fixtures pass. The reference viewer
  does not select it yet; publisher/negotiation, audible RDP and broader gates remain
  open. [Browser contract](AUDIO_OPUS_BROWSER.md), [evidence](ITERATION_077.md).
- [~] IN PROGRESS — Isolated Opus publisher reuses PCM capture/epoch/reset ownership
  and one fixed encoded retry cache. Actual SDK/native source fixtures verify
  no re-encoding on blocked retry, latest discontinuous replacement, ordered
  state/config and reset barriers. Worker/queue/public selection and audible
  acceptance remain open. [Publisher contract](AUDIO_OPUS_PUBLISHER.md),
  [evidence](ITERATION_078.md).
- [~] IN PROGRESS — Explicit immutable Opus queue/dispatcher mode shares bounded
  slots and refuses a second pending encoded packet. Portable output and actual
  source/SDK publisher-to-queue tests verify copied ownership, profile refusal,
  clock/reset/priority and fresh prediction recovery. Production mode remains
  PCM; codec selection, public negotiation and audible acceptance remain open.
  [Output contract](AUDIO_OPUS_OUTPUT.md), [evidence](ITERATION_079.md).
- [~] IN PROGRESS — Native AudioSession selects exactly one PCM/Opus publisher
  with shared sink/provider and retirement ownership. Actual linked RDPSND/fake-SVC
  verifies Opus Wave2 publication and cancelled-confirmation Close, plus unknown
  mode refusal/default PCM counters. Worker still selects PCM; IPC/Node/public
  selection and audible acceptance remain open. [Session contract](AUDIO_SESSION_CODECS.md),
  [evidence](ITERATION_080.md).
- [~] IN PROGRESS — Default native output owners permit one PCM/Opus startup
  choice before accepted audio, preserving queued/in-flight control and video.
  Constructor choice and accepted audio permanently lock the mode; refusal,
  full admission and discard do not bypass ownership. Production worker still
  uses PCM; private/public activation and audible acceptance remain open.
  [Evidence](ITERATION_081.md).
- [~] IN PROGRESS — Private connection schema 6 prepares an explicit Opus bit
  with mutually exclusive PCM/Opus and preserved legacy masks. Native/TypeScript
  parsers remain bounded; current worker refuses Opus before secret/connect.
  No HELLO/public activation is advertised. Node selection, browser negotiation
  and audible acceptance remain open. [Evidence](ITERATION_082.md).
- [~] IN PROGRESS — Shared typed Node audio source ownership preserves existing
  PCM behavior and prepares an isolated Opus profile. Scalar-only snapshots,
  codec-specific admission and common readiness/epoch/clock/reset guards are
  verified by source/delivery fixtures. No worker/public Opus activation yet.
  [Contract](AUDIO_SOURCE_OWNERS.md), [evidence](ITERATION_083.md).
- [~] IN PROGRESS — Guarded Windows worker accepts raw schema-6 Opus, selecting
  matching output/session profiles before activation. Actual local TLS/native
  lifecycle verifies strict certificate rejection, codec-1 Close and healthy
  control/shutdown; foundation selection is refused. HELLO/high-level Node/public
  selection and audible acceptance remain open. [Evidence](ITERATION_084.md).
- [~] IN PROGRESS — Experimental private Opus capability, CLI/HELLO/REST and
  typed WorkerProcess selection are wired. Old peer/settings refusal, mixed
  profiles, ordered Close and actual local native TLS retirement pass. Public
  startup remains gated pending compressed delivery/attachment recovery. Current
  XRDP Opus idle-source activation/heartbeat/capture/Close now pass after access
  restoration in Iteration 88; no audio packets were observed and no audible
  acceptance is claimed. [Activation evidence](ITERATION_085.md),
  [restored-lab evidence](ITERATION_088.md).
- [~] IN PROGRESS — Serialized AudioSession reset selects its PCM/Opus publisher,
  clears prepared storage and schedules the existing discard/new-epoch barrier.
  Actual linked source/fake-SVC checks verify blocked-output ownership, waiting /
  fresh-Play order and exact fresh-encoder Opus recovery. Foreign/reentrant /
  retiring/failed reset is refused. IPC/public selector remains open.
  [Evidence](ITERATION_086.md).
- [~] IN PROGRESS — Fixed private audio reset request/result codecs, nonzero epoch /
  correlation, header preallocation limits and existing bounded control FIFO are
  verified natively and in TypeScript. Both worker variants return explicit
  unavailable while heartbeat/shutdown stay healthy. RDP-thread dispatch, private
  Node API and public compressed recovery remain open; no reset capability is
  advertised. [Contract](AUDIO_RESET.md), [evidence](ITERATION_087.md).
- [~] IN PROGRESS — Raw native reset now uses one fixed request slot, published
  ready-epoch checks, a one-second service deadline and RDP-thread AudioSession
  ownership. Pending epoch/lifetime/clock changes and duplicate scheduling are
  refused; shutdown cancels before retirement. Portable and linked RDPSND/fake-SVC
  checks pass for PCM/Opus. Private capability/API and public recovery remain open.
  [Evidence](ITERATION_088.md).
- [~] IN PROGRESS — Guarded private audioReset capability and typed
  WorkerProcess.resetAudio(expectedEpoch) now preserve one pending request,
  correlation and scheduled-epoch suppression. PCM/Opus fake-peer recovery,
  legacy/invalid/reply fault and cleanup fixtures pass. Actual XRDP idle PCM/Opus
  lifecycle passes; waiting-source reset is locally unavailable. Native ready-source
  and public compressed recovery/audible acceptance remain open.
  [Evidence](ITERATION_089.md).
- [~] IN PROGRESS — Isolated Opus sender now owns one bounded packet and shared
  receiver credit, preserves bytes/PTS/flags and requests native new-epoch recovery
  for active-source attachment or skipped prediction. Old ACK survives recovery;
  finite deadline/sequence/source/cleanup fixtures and fake private IPC reset
  handoff pass. Public lease/WebSocket/browser activation and actual recovery /
  audible acceptance remain open. [Contract](AUDIO_OPUS_DELIVERY.md),
  [evidence](ITERATION_090.md).
- [~] IN PROGRESS — Server media lease now reserves one expected-epoch backend
  reset, checks current authority before/after completion and preserves reservation
  across detach. Invalid/exception/deadline faults retire uncertain backend
  ownership; PCM native-adapter/private fake IPC handoff passes. Browser command /
  managed Opus/socket activation and actual recovery/audible acceptance remain open.
  [Contract](AUDIO_RESET_LEASE.md), [evidence](ITERATION_091.md).
- [~] IN PROGRESS — Fixed typed managed PCM/Opus source profiles expose copied
  codec/state/config metadata and refuse mixed packets before source progression.
  Backend/lease contracts carry the explicit union; current managed creation and
  socket remain PCM with public Opus startup gated. Isolated and existing PCM
  fixtures pass; socket/browser activation and actual audio remain open.
  [Contract](SESSION_AUDIO.md), [evidence](ITERATION_092.md).
- [~] IN PROGRESS — Preparatory Opus socket owner connects one native epoch-reset
  promise to compressed prediction recovery, preserving transmitted ACK and
  bounding retry/deadline/late completion. Seven synthetic socket cases and PCM
  regression pass. Public negotiation/harness activation and actual recovery /
  audible acceptance remain open. [Contract](AUDIO_OPUS_SOCKET.md),
  [evidence](ITERATION_093.md).
- [~] IN PROGRESS — Public Opus creation, exact codec-matched media negotiation,
  one-record ACK/native reset recovery, separate fixed metrics and gesture-gated
  reference harness are implemented. Fake private IPC/real WebSocket, actual
  linked strict TLS and Edge pinned-SDK decode/Worklet fixtures pass. Restored
  XRDP H.264/Opus viewer/reattachment passes with waiting/zero audio; audible and
  actual ready-source reset acceptance remain open.
  [Contract](AUDIO_OPUS_PUBLIC.md), [evidence](ITERATION_094.md).
- [~] IN PROGRESS — Protected fixed-cardinality PCM record/byte counters, receiver-credit/in-flight and pending-sample gauges, replacement/reset/retirement counts and forwarding/valid-ACK timing histograms are implemented. Real socket/fake-backend and pure failure fixtures verify exact accounting and zeroed cleanup. Native/browser jitter/underflow export and measured LAN acceptance remain open. [Evidence](ITERATION_072.md).
- [~] IN PROGRESS — Fixed 120 ms native PCM handoff ring, packet-atomic overflow, counted underflow silence, reset discontinuity and saturating lifetime counters are implemented. Worker/transport/browser integration, public metrics and actual LAN latency acceptance remain open. [Evidence](ITERATION_037.md).
- [~] IN PROGRESS — Protected PCM/Opus microphone transport counters and Node
  admission/explicit-stop histograms now expose fixed enum labels and actual
  outstanding backend promises. Detached/expired operations remain counted until
  settlement. Pure and actual loopback-WS/fake-RDP checks cover bytes, decisions,
  held stop/admission, failure and privacy bounds; native/browser jitter,
  underflow/encode/host queues and actual LAN/device/platform/soak remain open.
  [Evidence](ITERATION_145.md). Explicit viewer: `daf3ba7`.
- [ ] Implement custom `audin-browser` source.
- [~] IN PROGRESS — Isolated virtual microphone PCM source has exact epoch/time /
  boundary validation, fixed 120 ms newest-data queue, capped prebuffer, counted
  underflow/silence, signed mono projection and wipe-on-stop. Six pure cases pass;
  public AUDIN backend/provider, worker/IPC/browser permission/capture and actual
  microphone remain open. [Contract](AUDIO_CAPTURE.md),
  [evidence](ITERATION_095.md).
- [~] IN PROGRESS — Public IAudinDevice adapter copies supported PCM16 48 kHz
  mono/stereo formats, opens fresh capture epochs, emits bounded PCM/silence and
  retires resources before delayed host Free. Owner-thread/reentrancy and callback
  failure fixtures pass; channel/provider, worker/IPC/browser microphone and actual
  remote acceptance remain open. [Contract](AUDIO_AUDIN_ADAPTER.md),
  [evidence](ITERATION_096.md).
- [~] IN PROGRESS — Scoped public audin/browser backend loading validates exact
  owner/context/arguments, consumes uncertain handoffs once and composes with
  RDPSND. Actual pinned AUDIN/fake-DVC fixtures project stereo/mono PCM and cover
  reopen, write failure and delayed termination. General AUDIN channel loading
  stays refused pending ingress/lifetime guards; worker/browser microphone and
  actual acceptance remain open. [Contract](AUDIO_AUDIN_PROVIDER.md),
  [evidence](ITERATION_097.md).
- [~] IN PROGRESS — Allocation-free AUDIN PDU/offer filtering bounds whole
  records, format claims/extras, complete Open preference, selected indices and
  100 ms callbacks. Pure and actual linked AUDIN/fake-DVC placement fixtures pass;
  dedicated sanitizer/fuzzer CI is prepared but unrun. Production DVC lifetime /
  non-forward refusal, worker/IPC/browser microphone and actual acceptance remain
  open. [Contract](AUDIO_AUDIN_INGRESS.md),
  [evidence](ITERATION_098.md).
- [~] IN PROGRESS — Public AUDIN DVC callback places bounded ingress ahead of
  the linked parser, checks negotiation replies and exact Incoming/Data pairs,
  catches detached false success and preserves callback ownership through owner
  retirement. Actual linked AUDIN/fake-DVC cases pass; plugin/listener/provider
  selection, reopen/cadence/resources, worker/browser microphone and actual
  acceptance remain open. [Contract](AUDIO_AUDIN_DVC.md),
  [evidence](ITERATION_099.md).
- [~] IN PROGRESS — Scoped pinned AUDIN plugin/listener ownership selects the
  guarded public DVC path with fixed arguments, rejects reentry/foreign calls,
  retires before delayed host termination and retains failed listener handles
  for one retry per later owner close. Actual linked AUDIN/fake-DVC fixtures pass;
  same-plugin reopen, finite worker teardown/cadence/resources, IPC/browser capture
  and actual microphone acceptance remain open. [Contract](AUDIO_AUDIN_PLUGIN.md),
  [evidence](ITERATION_100.md).
- [~] IN PROGRESS — Rational 48 kHz capture cadence emits at most one checked
  AUDIN PCM pair per due owner poll, skips missed deadlines without bursts and
  discards bounded old queue samples. Portable and linked AUDIN/fake-DVC fixtures
  pass; production callback/CPU and wakeup budgets, worker/IPC/browser capture and
  actual microphone/LAN acceptance remain open. [Contract](AUDIO_CAPTURE_CADENCE.md),
  [evidence](ITERATION_101.md).
- [~] IN PROGRESS — Native capture reset wipes PCM and advances the exact current
  input epoch while preserving the negotiated AUDIN receiver for silence/fresh
  input. Stale, foreign and reentrant resets preserve ownership; deadline snapshots
  reject previous-epoch cadence. Public device and linked AUDIN/fake-DVC fixtures
  pass; worker/lease/permission/rate limits, IPC/browser and actual remote reset
  acceptance remain open. [Contract](AUDIO_CAPTURE_RESET.md),
  [evidence](ITERATION_102.md).
- [~] IN PROGRESS — Fixed schema-1 microphone PCM codec and correlated RWI1
  kinds 39/40 enforce exact captured-frame metadata and body bounds before
  allocation. Native/TypeScript boundary/framing and real-worker unavailable /
  heartbeat/shutdown fixtures pass; worker handoff/admission, capability, current
  lease/permission, public browser transport and actual microphone remain open.
  [Contract](MICROPHONE_PCM_WIRE.md), [evidence](ITERATION_103.md).
- [~] IN PROGRESS — Single-slot native microphone handoff copies exact PCM once,
  rechecks epoch/readiness and a 20 ms dispatch deadline, protects callback borrows
  and wipes completed/drained samples. Portable and linked AUDIN/fake-DVC producer /
  RDP-owner fixtures pass; worker wakeup/completions/status, finite shutdown,
  Node/lease/permission/browser capture and actual LAN acceptance remain open.
  [Contract](AUDIO_CAPTURE_HANDOFF.md), [evidence](ITERATION_104.md).
- [~] IN PROGRESS — Private microphone status codec/kind 41 and latest-candidate
  publisher distinguish actual source state from transport-admitted input authority.
  Native/Node and linked AUDIN/fake-DVC backpressure/reset fixtures pass; worker
  emission/mutex/wakeup/deadlines, capability/lease/permission/browser/Opus input
  and actual remote/LAN acceptance remain open. [Contract](MICROPHONE_STATE.md),
  [evidence](ITERATION_105.md).
- [~] IN PROGRESS — RDP-owner MicrophoneSession composes guarded AUDIN loading,
  scheduled capture, admitted status authority and epoch reset. Finite retirement,
  failed listener retry, publication failure, reverse provider ordering and
  delayed host cleanup pass actual linked AUDIN/fake-DVC fixtures. Worker
  snapshot/mutex/wakeup/selection, production callback CPU budget, live-handle
  expiry and real microphone acceptance remain open.
  [Contract](MICROPHONE_SESSION.md), [evidence](ITERATION_106.md).
- [~] IN PROGRESS — Microphone owner selects 10..100 ms AUDIN callbacks;
  valid smaller Open gets a checked HRESULT refusal before device/upstream Open,
  with negotiated-table retention for a compatible retry. Portable and actual
  linked AUDIN/fake-DVC boundary, cadence and write-failure checks pass. Owner
  deadline snapshots require admitted readiness/actual epoch. Worker wakeup,
  global CPU/resource and real microphone acceptance remain open.
  [Contract](AUDIO_AUDIN_PROFILE.md), [evidence](ITERATION_107.md).
- [~] IN PROGRESS — Raw private schema-7 PCM input opt-in now selects the guarded
  AUDIN owner in Windows worker. One mutex couples admitted status with producer
  authority; one 20 ms slot rechecks actual source/epoch before root-thread queue
  admission. Wakeup/deadline scheduling and reverse finite cleanup are wired.
  Actual native TLS-refusal/lifetime cases pass with output off/PCM/Opus; no
  physical capture or negotiated remote microphone is claimed. Normal Node /
  HELLO/public selection, reset, connected-worker latency and real transport /
  microphone acceptance remain open. [Contract](MICROPHONE_WORKER.md),
  [evidence](ITERATION_108.md).
- [~] IN PROGRESS — Guarded Windows/AUDIN advertises independent PCM input.
  Private WorkerProcess selects schema 7, validates ordered authority and sends
  one packet at a time without sample retry. Fake IPC and actual native TLS
  refusal/lifetime fixtures pass; public creation still refuses non-off input.
  Reset, lease/permission/capture, resampling/Opus input, real remote/physical /
  LAN/platform acceptance remain open. [Contract](MICROPHONE_NODE.md),
  [evidence](ITERATION_109.md).
- [~] IN PROGRESS — Private microphone reset has fixed epoch/result records and
  bounded versioned HELLO extension decoding, preserving old peers as unsupported.
  Worker validates and replies unavailable; owner execution and Node API remain
  pending. Parser/native refusal evidence is separate from actual capture.
  [Contract](MICROPHONE_RESET.md), [evidence](ITERATION_110.md).
- [~] IN PROGRESS — Private microphone reset now runs on RDP owner ahead of PCM
  handoff, with separate fixed deadline/correlation and fresh admitted authority.
  Versioned capability gates private Node reset; one-flight and scheduled-epoch
  pause prevent sending across reset. Synthetic linked/fake IPC and native TLS
  fixtures are separate from physical/remote acceptance. Public lease/permission /
  transport and measured connected-worker/LAN/platform gates remain open.
  [Contract](MICROPHONE_RESET.md), [evidence](ITERATION_111.md).
- [~] IN PROGRESS — Browser/Node MIC_PACKET PCM codec has fixed direction /
  stream, input epoch/sequence/time and exact 20 ms sample bounds. Independent
  vectors and all-truncation/ownership fixtures pass; no public socket or capture
  activation is claimed. Lease/reset/credit/permission/resampling/Opus input and
  actual remote/physical/LAN/platform gates remain open.
  [Contract](MICROPHONE_WIRE.md), [evidence](ITERATION_112.md).
- [~] IN PROGRESS — Isolated microphone ingress has one owned PCM slot and one
  backend flight, sequence/continuity checks, permanent grant revocation and
  source/lease recheck after completion. Portable and synthetic-process private
  projection/drain/reset fixtures pass; public finite retirement/ownership,
  socket/ACK, permission/capture and remote/physical/LAN gates remain open.
  [Contract](MICROPHONE_INGRESS.md), [evidence](ITERATION_113.md).
- [~] IN PROGRESS — Isolated exclusive microphone ownership revokes immediately,
  drains one operation and requires native reset/new epoch before transfer under
  one finite deadline. Late replies cannot revive expired ownership; failure
  requests termination once. Portable and synthetic-process fixtures pass;
  public host cleanup/lease/socket integration, permission/capture and actual
  remote/physical/LAN gates remain open. [Contract](MICROPHONE_OWNERSHIP.md),
  [evidence](ITERATION_114.md).
- [~] IN PROGRESS — Restored actual XRDP accepts private PCM input with output
  off/PCM/Opus; heartbeat, 1080p JPEG and empty-runtime cleanup pass in all three
  modes. Input remains waiting/epoch 0, so no ready or remote capture acceptance
  is claimed. The reproducible inventory helper sends no PCM or remote input.
  Public activation and remote/physical/LAN gates remain open.
  [Evidence](ITERATION_115.md).
- [~] IN PROGRESS — Preparatory SessionManager PCM input methods bind one grant
  to current control/media attachment identities, revoke on either detach and
  join a finite reset/new-epoch barrier before replacement. Fake-manager tests
  cover late ACK, stop, invalid source and cleanup ownership. Typed native
  forwarding exists; normal native selection and socket/permission/capture stay
  gated. Actual remote/physical/LAN acceptance remains open.
  [Contract](MICROPHONE_SESSION.md), [evidence](ITERATION_116.md).
- [~] IN PROGRESS — Media lease microphone snapshots/subscription now report
  copied source state and explicit grant/retirement, with synchronous controller
  loss notification. Unsubscribe/receiver faults revoke capture; stale and
  reentrant callbacks cannot affect a replacement. Four fake-manager cases pass;
  socket routing, browser permission/capture and actual acceptance remain open.
  [Evidence](ITERATION_117.md).
- [~] IN PROGRESS — Prepared microphone media adapter has explicit grant/stop,
  scalar status, one sample/stop flight, replay/epoch checks, separate ACKs,
  copied deadlines and shared backlog bounds. Pure fake-socket/lease fixtures
  pass; media.hello activation, real socket integration, permission/capture and
  actual remote/physical/LAN acceptance remain open.
  [Contract](MICROPHONE_SOCKET.md), [evidence](ITERATION_118.md).
- [~] IN PROGRESS — Explicit media.hello PCM microphone selection now routes
  scalar status, grant/stop and fixed binary input with independent ACKs and
  unchanged 4 KiB input preallocation. Negotiated mixed media has a bounded
  160/s message budget and 16/s microphone-command cap. Actual loopback sockets
  with fake RDP verify revocation, stop epoch, video-credit separation and flood /
  oversized-input refusal. Native selection, permission/capture and actual
  remote/physical/LAN acceptance remain open. [Evidence](ITERATION_119.md).
- [~] IN PROGRESS — Isolated browser PCM sender copies one latest unsent block,
  expires it after 120 ms and preserves one issued sequence/epoch ACK. Local
  permission tokens, source progress, explicit no-write, refusal/deadline and
  reentrant callbacks pass eight synthetic cases. Capture/device ownership,
  viewer/native selection and actual remote/physical/LAN acceptance remain open.
  [Contract](MICROPHONE_SENDER.md), [evidence](ITERATION_120.md).
- [~] IN PROGRESS — Isolated 48 kHz microphone capture packetizer and AudioWorklet
  have a fixed collector/latest block and one transferred packet awaiting port
  ACK, sample-clock timestamps, age/deadline guards and silent local output.
  Six pure, two simulated processor/parser and actual Edge synthetic offline/live
  checks pass. No device permission is requested; permission/track/context owner,
  sender/viewer/native composition and actual microphone acceptance remain open.
  [Contract](MICROPHONE_CAPTURE.md), [evidence](ITERATION_121.md).
- [~] IN PROGRESS — Explicit browser permission/track owner has a gesture and
  eligibility gate, one pending permission/activation attempt, stopped late
  streams, listener cleanup and a finite scope retirement barrier. Eight pure
  fake-API and one actual Edge synthetic-stream checks pass without physical
  capture. Capture/sender/context/server-grant composition, viewer/native
  activation and actual microphone acceptance remain open.
  [Contract](MICROPHONE_PERMISSION.md), [evidence](ITERATION_122.md).
- [~] IN PROGRESS — Browser graph scope now composes actual capture Worklet with
  the bounded RWB1 sender, separate port/network credit, sample wiping and
  main-thread authority/ACK/stall checks. Six pure and one actual Edge synthetic
  permission/stream/Worklet/sender fixture pass. Native/server ACKs are simulated;
  public command/socket ownership, startup context cleanup, viewer/native
  selection and actual microphone acceptance remain open.
  [Contract](MICROPHONE_GRAPH.md), [evidence](ITERATION_123.md).
- [~] IN PROGRESS — Negotiated browser microphone media client has bounded
  start/stop correlation, immediate token revoke and a persistent media-owner
  ACK/deadline poll across graph stop. Seven pure cases and actual loopback WS /
  fake RDP client stop/reset/restart pass; full media focus is 14/14. Edge socket /
  permission/graph composition, startup context cleanup, viewer/native selection
  and actual microphone acceptance remain open.
  [Contract](MICROPHONE_MEDIA_CLIENT.md), [evidence](ITERATION_124.md).
- [~] IN PROGRESS — Actual Edge / loopback WebSocket / fake RDP microphone
  composition now passes synthetic permission, Worklet, sender, Node admission
  and observed stop/reset. Controller loss stops track/context before a held
  worker API PCM completion; fake worker reset follows its release. Both cases
  preserve media attachment and send no late samples. No physical capture,
  private RWI1/native AUDIN or RDP graphics/audio acceptance is claimed.
  Production startup owner, viewer/native selection and actual microphone
  acceptance remain open. [Evidence](ITERATION_125.md).
- [~] IN PROGRESS — Browser startup owner now composes permission, prepared
  AudioContext, server grant and Worklet/sender graph. Denial/cancellation closes
  startup context; finite cleanup and unresolved guards prevent overlapping
  acquisition. Seven pure and three actual Edge/WS/fake RDP cases pass, including
  permission denial and held worker API completion on controller loss. Viewer /
  native activation and actual microphone/device/LAN acceptance remain open.
  [Contract](MICROPHONE_OWNER.md), [evidence](ITERATION_126.md).
- [~] IN PROGRESS — Reference viewer explicitly negotiates PCM microphone and
  enables capture only from its button after ready source/control ownership.
  Stop/detach, source change, denied/late permission and reattachment barriers
  pass four actual Edge/viewer/WS/Worklet cases with synthetic capture/fake RDP;
  existing PCM/Opus output viewer cases also pass. Native SessionWorker selection,
  negotiated AUDIN/physical/remote/LAN/platform/soak acceptance remain open.
  [Contract](MICROPHONE_VIEWER.md), [evidence](ITERATION_127.md).
- [~] IN PROGRESS — NativeSessionWorker now selects explicit PCM input only
  after pcmInput and microphoneReset HELLO capabilities; legacy peers and Opus
  input fail before configure/start respectively. Three actual native registry /
  strict TLS fixtures pass with output off/PCM/Opus. Restored XRDP/API/Edge H.264
  renders 52 frames at 1080p and replays waiting source epoch 0 without permission
  or PCM capture. Manual viewer input/output flags exist. Ready AUDIN/remote /
  physical/LAN/platform/soak, resampling/Opus input acceptance remain open.
  [Evidence](ITERATION_128.md), [launch](DEVELOPMENT.md#explicit-nativebrowser-microphone-viewer).
- [~] IN PROGRESS — Isolated private Opus input decoder accepts one bounded
  stereo 20 ms frame, owns fixed heap scratch/two SDK states and commits only
  successful decode. Profile/clock/refusal/reset and actual SDK PCM equivalence
  pass 4 cases / 78,189 assertions. No Opus input capability/settings, worker /
  transport/browser encoder selection or capture is enabled. SDK failure /
  resource/sanitizer/platform and actual microphone gates remain open.
  [Contract](AUDIO_OPUS_INPUT_DECODER.md), [evidence](ITERATION_129.md).
- [~] IN PROGRESS — Isolated browser AudioEncoder Opus input foundation owns
  one unfinished 20 ms input, fixed scratch, bounded output/metadata and finite
  deadline; discontinuity retires the old generation, stop sends no flush tail.
  Seven pure cases and one actual Edge synthetic AudioData case pass. It obtains
  no device/socket and is not selected by capture/media/native dispatch. Opus
  input, complete codec/permission/AUDIN composition and actual recording remain
  open. [Contract](MICROPHONE_OPUS_ENCODER.md), [evidence](ITERATION_130.md).
- [~] IN PROGRESS — Prepared microphone Opus Node/browser RWB1 type 10 and
  standalone native/Node private payload preserve measured lookahead with
  fixed bounds, strict single stereo 20 ms TOC and borrowed compressed storage.
  Five Node/browser and three portable native cases cover golden agreement,
  malformed framing and extrema. No RWI1 kind, route, capture, settings or
  capability is activated. Delay compensation, ownership/codec composition
  and actual microphone/platform/resource gates remain open.
  [Contract](MICROPHONE_OPUS_WIRE.md), [evidence](ITERATION_131.md).
- [~] IN PROGRESS — Isolated native Opus capture composition removes reported
  pre-skip and reblocks into fixed 960-frame PCM with less than one partial
  block and the original capture timeline. Three native cases / 689 assertions
  and actual Edge/native synthetic stereo codec composition pass. No physical
  capture, worker/AUDIN dispatch or Opus input selection is enabled. Handoff,
  network credit/permission/lease, actual recording/platform/resource/LAN/soak
  gates remain open. [Contract](MICROPHONE_OPUS_CAPTURE.md),
  [evidence](ITERATION_132.md).
- [~] IN PROGRESS — The serialized microphone handoff now owns exactly one
  immutable PCM/default or prepared Opus slot; both profiles share bounded
  arrival deadline, epoch/readiness checks, typed callback completion and wipe.
  Eight portable PCM/Opus cases / 8,323 assertions and actual native SDK/source
  priming/reset composition pass. Opus kind/config/capability/worker callback,
  permission/lease/network and actual AUDIN/device/platform/resource/LAN/soak
  gates remain open. [Contract](AUDIO_CAPTURE_HANDOFF.md),
  [evidence](ITERATION_133.md).
- [~] IN PROGRESS — Prepared Opus microphone RWI1 kind 44 has 26..1,299-byte
  header limits/nonzero correlation; schema 8 adds exclusive PCM/Opus input
  flags independent of output. Native/Node parser/config and actual process
  refusal/heartbeat/shutdown fixtures pass. Worker dispatch is unavailable and
  Opus selection/capability remains disabled. Decoder/AUDIN ownership, browser /
  Node selection and actual device/platform/resource/LAN/soak gates remain open.
  [Contract](MICROPHONE_OPUS_IPC.md), [evidence](ITERATION_134.md).
- [~] IN PROGRESS — RDP-thread Opus microphone owner now composes bounded
  compensation with guarded MicrophoneSession using actual negotiated/open /
  admitted ready epoch before decode. Source reset/loss clears partial state;
  invalid packets preserve prediction, refused decoded PCM is never retried.
  Five actual-linked AUDIN/fake-DVC cases / 211 assertions pass with synthetic
  samples. Worker selection/capability/failure propagation, Node/browser and
  actual device/platform/resource/LAN/soak gates remain open.
  [Contract](MICROPHONE_OPUS_OWNER.md), [evidence](ITERATION_135.md).
- [~] IN PROGRESS — Raw guarded-Windows schema-8 Opus input now selects one
  compressed handoff and RDP-thread AUDIN/decoder owner. Epoch/readiness and
  reset/loss/ending cleanup are enforced; failed codec ownership propagates.
  Eleven actual native lifecycle/local TLS cases pass, including independent
  input/output modes and wrong-profile refusal. HELLO/typed Node/browser Opus
  selection and actual ready remote/device/LAN/resource/platform/soak acceptance
  remain open. [Contract](MICROPHONE_OPUS_WORKER.md),
  [evidence](ITERATION_136.md).
- [ ] Underflow/silence behavior that does not block RDP loop.
- [~] IN PROGRESS — Typed private Node Opus microphone now uses guarded
  HELLO/CLI/build opusInput capability, immutable schema-8 selection, copied
  encoded storage and one shared send/reset flight. Legacy/wrong profile,
  stale epoch and malformed/duplicate completion are refused without retry.
  Focused protocol and synthetic IPC/actual native local TLS checks pass;
  public session/browser, ready AUDIN/device/LAN/resource/platform/soak gates
  remain open. [Evidence](ITERATION_137.md).
- [ ] Audio reconnect/discontinuity reset.
- [~] IN PROGRESS — Reference viewer now explicitly selects Opus input after
  a fixed-profile capability query, one replaceable pending attachment and 2 s
  preflight deadline. Both codec paths retain gesture-only permission and shared
  cleanup; unsupported/late/timeout/replaced provider cases never open stale
  sockets or downgrade. Portable and synthetic actual Edge/viewer/WS checks pass;
  actual ready AUDIN/device/recording/LAN/platform/resource/failure injection and
  soak remain open. [Evidence](ITERATION_144.md). Client: `6ecfe61`.
- [~] IN PROGRESS — Negotiated browser microphone client now selects exact
  PCM/Opus profiles and composes the Opus sender behind shared permission,
  command/ACK/stop ownership. Five pure cases and actual Edge/Worklet/WS fixtures
  pass for both codecs across stop, controller loss and permission denial;
  all input is synthetic and RDP backend admission is fake. Viewer Opus selection,
  ready AUDIN/recording/LAN/platform/resource/failure injection and soak remain
  open. [Evidence](ITERATION_143.md). Opus sender: `785c2c8`.
- [~] IN PROGRESS — Browser Opus sender now composes lazy encoding with current
  permission/source ownership, one preparation/issued reservation and latest
  unencoded PCM. Seven pure cases and actual Edge synthetic codec/ACK/epoch
  composition pass; no physical capture occurs. Client/viewer selection, ready
  AUDIN/recording/LAN/platform/resource/failure injection and soak remain open.
  [Evidence](ITERATION_142.md). Preparation: `b606e46`.
- [~] IN PROGRESS — Browser microphone sender now separates optional unissued
  codec preparation from issued transport ACK ownership, with one latest PCM
  block and 120 ms freshness across preparation. Correlation, cancellation,
  no-write discontinuity and uncertain-failure bounds pass pure tests; real
  synthetic Edge/Worklet/WS PCM regression passes. Opus provider/permission /
  graph/client/viewer composition and actual device/LAN/platform/soak remain
  open. [Evidence](ITERATION_141.md). Public transport: `e39b1eb`.
- [~] IN PROGRESS — Explicit public Opus microphone now selects a typed
  session/native backend and matching media hello/ready/type-10 receiver.
  Control/media ownership, reset/deadline/backlog bounds and separate ACK/video
  credit remain; wrong codec refuses without fallback. Portable, actual socket /
  fake-RDP and native local TLS checks pass. Browser encoder/permission/graph
  composition, ready AUDIN/device/LAN/platform/resource/soak remain open.
  [Evidence](ITERATION_140.md). Selected ownership: `3f52594`.
- [~] IN PROGRESS — Selected microphone ownership now supports explicit Opus
  with the existing single grant/drain/reset/fresh-publication barrier. No
  replacement is granted on scheduled reset alone; reentrant callbacks,
  stale owners and reset/publication failures preserve bounded ownership.
  Portable and synthetic private process composition pass; public session/WS /
  browser and actual AUDIN/device/LAN/platform/resource/soak remain open.
  [Evidence](ITERATION_139.md). Selected ingress: `cd01a7c`.
- [~] IN PROGRESS — Selected microphone ingress now accepts PCM/default or
  prepared Opus in one immutable bounded slot and backend flight. Opus requires
  stable lookahead/predictive PTS; sequence gaps or fresh refused packets require
  new discontinuity, including interruption during pending reset boundary.
  Portable and synthetic process/private-IPC checks pass; public ownership/WS /
  capture and actual AUDIN/device/LAN/platform/resource/soak remain open.
  [Evidence](ITERATION_138.md). Private typed activation: `d7e0ee7`.
- [~] IN PROGRESS — Guarded static PCM detects epoch/gap/block/format/type changes before Open/Play, resets stale queue/interpolation, preserves ordinary timestamp/block wraps and validates whole-frame/100 ms preparation budgets. Pure clocks and actual linked channel/fake-SVC fixtures cover recovery; larger packet splitting, server table renegotiation, browser PTS and actual audio acceptance remain open. [Evidence](ITERATION_046.md).
- [~] IN PROGRESS — The initial PCM table is fixed for one connection; replacement tables fail before upstream mutation. Source rate/layout/width changes within that table pass actual linked channel/fake-SVC tests. [Evidence](ITERATION_047.md); `2713056`. Broader renegotiation remains open.
- [~] IN PROGRESS — RDPEI and guarded RDPSND now compose in either binding order through a fixed eight-record owner/context scope stack. Cached public entries and delayed confirmation ownership pass actual linked addin/simulated transport tests; outer close fails before retiring resources beneath an attached child. Worker audio activation and real transport/audio acceptance remain open. [Evidence](ITERATION_048.md).
- [~] IN PROGRESS — Fixed 20 ms PCM packetization now uses the common worker-clock input, counts underflow silence, skips expired FIFO intervals without catch-up bursts, and preserves monotonic PTS across source resets. Pure and actual linked RDPSND/fake-SVC fixtures pass; worker scheduling, transport, AudioWorklet and actual audible/latency acceptance remain open. [Evidence](ITERATION_049.md). Provider composition: `7842b32`.
- [~] IN PROGRESS — Fixed versioned PCM config/packet codecs now agree in native/TypeScript, with envelope limits before allocation, epoch/silence/PTS validation and raw-sample RWB1 stream 3 encoding. This is codec preparation, with no new advertised audio capability or worker/browser activation. [Evidence](ITERATION_050.md). PCM packetization: `ff49604`.
- [~] IN PROGRESS — Isolated browser S16LE stereo queue and AudioWorklet now use fixed 120 ms capacity, 40 ms prebuffer, counted silence and newest-data overflow policy. Pure fixtures and actual Edge offline sample rendering/live port acknowledgments pass. Production port ownership/parser, worker/Node delivery and audible RDP/microphone/latency acceptance remain open. [Evidence](ITERATION_051.md). PCM codecs: `655ef81`.
- [~] IN PROGRESS — Browser PCM RWB1 parser and exclusive AudioContext/MessagePort owner now bound one posted command and one latest pending packet, force discontinuity on drops and retire on ACK/deadline/context loss. Pure fault/burst tests and actual Edge credit/epoch/cleanup fixtures pass; reference-viewer activation, worker/Node streaming, audible remote audio/microphone and latency gates remain open. [Evidence](ITERATION_052.md). AudioWorklet foundation: `4563327`.
- [~] IN PROGRESS — Native PCM publisher now offers one fixed latest IPC packet/config through nonblocking credit, with epoch/config ordering and sink revision checks that discard prepared PCM on Close/reset before fresh samples. Pure owner/fault tests and actual linked RDPSND/fake-SVC Close/restart pass. Prioritized native writer, worker/Node activation and real audio gates remain open. [Evidence](ITERATION_053.md). Browser port ownership: `7f44b97`.
- [~] IN PROGRESS — Native output queue foundation now bounds 64 control FIFO slots, one audio config/latest PCM, cursor shape/latest metadata and one correlated video response. Typed admission, epoch discard, discontinuity, exact maxima and ownership fixtures pass; writer thread, source invalidation, pipe shutdown/fairness and worker/Node activation remain open. [Evidence](ITERATION_054.md). PCM publisher: `a30e9a9`.
- [~] IN PROGRESS — Shared native producer/writer dispatcher now offers try-lock credit, one owned in-flight record and separate fixed-header/body writing outside the queue mutex. Stalled-writer, reentry, drain, abort and callback-fault fixtures pass; OS writer thread/cancellation/wakeups, worker/Node activation and actual audio remain open. [Evidence](ITERATION_055.md). Bounded lanes: `76c66fd`.
- [~] IN PROGRESS — Windows pipe driver now owns writer/watchdog threads, private event wakeups, whole-record deadlines and synchronous cancellation with retained in-flight spans. Actual anonymous-pipe stall/drain/broken-reader and twenty-driver handle-count fixtures pass. Worker selection/regression, Linux, unsupported OS cancellation/reclamation, source-reset barriers and actual audio remain open. [Evidence](ITERATION_057.md). Dispatcher: `46245b2`; registry force completion: `120c5b1`.
- [~] IN PROGRESS — Windows foundation/bundled workers now select bounded priority output, join connection producers before writer drain and refuse full/failed admission without blocking on pipe writes. Actual lifecycle/parent flood and XRDP H.264 reset/JPEG resize/restoration/replay pass. Audio source barriers/config/provider and Node/browser delivery remain open; audio stays disabled, Linux priority and resource/soak gates remain pending. [Evidence](ITERATION_058.md). Windows driver: `6636e32`.
- [~] IN PROGRESS — Native PCM publisher now requires consumer-discard credit on initial ownership/source revision/reset before fresh sample reads or sends. Pure credit/reentry/fault and actual linked RDPSND/fake-SVC Close tests clear accepted unsent PCM and resume with a new epoch. In-flight/browser reset/status, worker config/provider and Node/browser activation remain open; audio is still disabled. [Evidence](ITERATION_059.md). Worker output: `604bd10`.
- [~] IN PROGRESS — Versioned fixed PCM source-status IPC codec now represents opt-in/availability/revision/epoch/worker time without samples. Native/TypeScript vectors, invalid fields/ranges, fragmented framing and typed control-queue priority pass. Status owner/reservation, worker selection, Node/browser reset and actual audio remain open; workers emit no status/audio yet. [Evidence](ITERATION_060.md). Source discard barrier: `844ee44`.
- [~] IN PROGRESS — Native RDPSND source snapshots distinguish samples from open-device ownership and track Close, raw suspend/resume, invalid ingress, overflow and unavailable offers. Pure/public-ABI and actual linked channel/fake-SVC cases pass; status/epoch ownership, worker/browser delivery and actual audio remain open. [Evidence](ITERATION_061.md). Status codec: `e77a0e0`.
- [~] IN PROGRESS — Native PCM publisher now reserves epochs and offers independent latest source status before config/samples, including Close without fresh PCM. Source reset and packetizer skips clear older unsent consumer audio before status. Owner/queue and actual linked RDPSND/fake-SVC cases pass; worker selection, public framing, Node/browser reset and actual audio remain open. [Evidence](ITERATION_062.md). Source snapshots: `d577699`.
- [~] IN PROGRESS — Preparatory public PCM source state is fixed RWB1 type 0x09/stream 3 with matched worker clocks and bounded audio sequence. Independent Node/browser vectors and malformed-record regression pass. Status-aware playback, Node listeners/replay, negotiated worker selection and actual audio remain open; no worker/API emits this extension. [Evidence](ITERATION_063.md). Native status owner: `7b921d5`.
- [~] IN PROGRESS — Opt-in isolated browser source-status ownership now clears pending PCM/config and orders coalesced Worklet reset before fresh ready/config/samples. Pure bounds/progress/bypass and actual Edge no-sample Close/recovery/replay cleanup pass with synthetic PCM. Worker/provider selection, Node listeners/media negotiation and audible remote audio remain open. [Evidence](ITERATION_064.md). Public state codec: `91578d0`.
- [~] IN PROGRESS — Serialized native audio session pairs guarded provider and source publisher with bounded retirement policy; cancelled confirmations, close/output/deadline faults and continued native cleanup after publication failure pass linked RDPSND/fake-SVC fixtures. Actual public core registration/disconnect/later-thread context teardown passes without a socket. Worker selection, real transport/resource faults, Node/browser delivery and audible audio remain open. [Evidence](ITERATION_065.md), [pinned core audit](RDPSND_UPSTREAM_AUDIT.md). Browser source mode: `1e28cd8`.

**Gate:** remote audio audible and microphone usable with bounded <150 ms queue target in LAN test.


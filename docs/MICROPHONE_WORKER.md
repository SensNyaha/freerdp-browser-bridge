# Experimental private microphone worker dispatch

Current update — iteration 128: public NativeSessionWorker selection now
requires pcmInput and microphoneReset before configuring PCM input. Opus input
stays unsupported. The reference viewer has an explicit gesture path; actual
XRDP metadata replay succeeds in waiting epoch 0 without capture. Historical
gating statements below retain their original scope. [Evidence](ITERATION_128.md).

Current update — iteration 109: guarded Windows/AUDIN HELLO/CLI advertises
`pcmInput`; private WorkerProcess can select PCM input and send bounded packets.
Public creation, permission and capture remain pending. Historical activation
statements below describe iteration 108. [Node contract](MICROPHONE_NODE.md).

Iteration 108 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7. Raw private CONFIGURE schema **7** can opt into the guarded
Windows/AUDIN virtual source with flag **16**. The bounded body keeps schema 6's
fields/length; flags 0..31 retain display, touch and exclusive PCM/Opus output.
Input is independent of output. Older schemas refuse bit 16; unknown flags,
mixed output, extra bytes and truncation are rejected. TypeScript chooses schema
7 only for `pcmInput: true`; omitted/false preserves legacy schema selection.

This is an internal raw-IPC integration path. HELLO/CLI do not advertise a
microphone capability yet and WorkerProcess/public creation still refuse non-off
microphone selection. Existing helpers do not opt in. Foundation/non-Windows /
missing-AUDIN workers cannot activate the profile. Public Node routing, control
lease, permission and browser capture remain pending.

Connection constructs MicrophoneSession on the synchronous RDP thread above
output audio and touch provider scopes. FreeRDP AudioCapture selects guarded
dynamic AUDIN; the provider supplies fixed browser-backend arguments. No physical
host backend, arbitrary channel arguments, thread or sound server is introduced.
The [worker callback profile](AUDIO_AUDIN_PROFILE.md) is used.

The IPC thread validates exact kind-39 PCM before copying one 3,840-byte handoff
slot under the microphone mutex. Admission uses only a last-admitted status
snapshot plus connected/stopping atomics, never a live FreeRDP/source query.
Publishing kind-41 metadata holds the same mutex through output admission and
snapshot update, so delivered fresh metadata cannot race old producer authority.
Lock order is microphone then output; sample submission under the microphone
mutex performs bounded source admission without transport writes.

The RDP owner rechecks actual source readiness/epoch and the 20 ms slot deadline,
then services at most one completion with the original request ID. It wakes via
the existing auto-reset event and honors the authority-checked capture deadline
in the event wait. One scheduled Incoming/Data pair is attempted per poll; no
catch-up FIFO, sample retry or dedicated capture thread is added. Accepted means
source-queue admission, not remote application consumption. Stale/busy results
do not authorize automatic resending of captured samples.

Ending drains pending input as unavailable and retires the handoff. After native
disconnect, microphone provider/listener resources retire before output audio /
touch in reverse binding order. Closed metadata precedes terminal session state.
Each retry is an owner call, with the session's finite 1 s cleanup window. Live
ownership at expiry is a worker process fault; freed handles with undelivered
metadata produce a failed terminal outcome. Wrappers remain alive through context
destruction and delayed host callbacks after owner resources retire.

Portable schema masks/truncation and independent Node golden vectors pass.
Three actual native process tests select microphone with output off/PCM/Opus,
exercise early/late unavailable input and strict TLS rejection, observe closed
input metadata before terminal failure, and verify heartbeat/shutdown/cleanup.
The TLS fixture receives no RDP application bytes. These tests establish process
lifetime/refusal and provider composition, not negotiated remote microphone.
Linked AUDIN/fake-DVC fixtures separately establish synthetic PCM/channel behavior.

Connected-worker wakeup/latency and transport-loss acceptance, finite live-handle
fault recovery, earlier drdynvc core limits, private Node capability/selection /
reset, public lease/permission/capture/resampling/Opus input and actual remote /
physical microphone/LAN/platform gates remain open.

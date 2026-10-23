# Bounded AUDIN callback profile

Iteration 107 implements SPECIFICATION §2.6 / ARCHITECTURE §5 /
MEDIA_PIPELINE §7. MicrophoneSession selects the worker capture profile before
delegating server Open to the pinned AUDIN plugin. Only consistent PCM16 mono /
stereo 48 kHz remains offered; accepted server packet sizes are 480..4,800 frames,
or 10..100 ms. The compatibility profile used by native ABI foundations retains
1..4,800 frames. This limit is internal typed policy, not arbitrary FreeRDP args.

Ingress validates the complete Open, negotiated index, capture preference and
record bounds before applying the minimum callback interval. A valid 1..479-frame
Open bypasses upstream/device Open and gets one checked five-byte Open Reply:
`04 32 00 07 80`, HRESULT_FROM_WIN32(ERROR_NOT_SUPPORTED). Capture remains closed,
epoch stays unchanged and status is unavailable. The negotiated table is retained
in the Open phase so a later admissible Open can start a fresh source epoch.
Malformed or oversized requests fail validation rather than producing a policy
refusal. No-common-format remains a separate unsupported negotiation result.

The protocol specifies an HRESULT in [Open Reply](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpeai/9de0de00-5de2-469e-a7c9-4865299c8d91)
and permits the server to [retry Open after an error](https://learn.microsoft.com/en-us/openspecs/windows_protocols/ms-rdpeai/5b8e7a06-5c9d-48c0-8c89-006019007258).
Failed/throwing refusal writes stop the guarded channel without claiming a
successful negotiation or retrying the write. The refusal sends no Format Change
or PCM and does not allocate upstream capture/DSP resources.

Scheduled capture retains its rational clock and one opportunity per poll. In
one stable source epoch the shortest steady interval is 10 ms, removing the
foundation's potential 48,000 callbacks/s. A fresh epoch can emit immediately;
this is not a global CPU bound for hostile repeated format changes or earlier
core transport work. MicrophoneSession exposes a read-only owner deadline only
when admitted ready metadata matches the actual source/cadence epoch. Reset,
unavailable/backpressured authority, retirement and foreign/reentrant calls
expose no usable deadline.

Portable fixtures cover policy boundaries, retry, retained/reset policy, full
validation before refusal and unchanged compatibility support. Actual linked
AUDIN/fake-DVC fixtures cover exact refusal bytes, retry to 480-frame capture,
mono format change, 480/481/4,096/4,800 rational intervals and failed/throwing
refusal writes. Samples are synthetic silence. Worker wakeup/poll integration,
global CPU/deadline/resource acceptance, earlier core limits, browser permission /
capture/resampling/Opus input and actual microphone/LAN/platform gates remain open.

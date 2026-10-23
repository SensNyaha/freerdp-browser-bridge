# Media pipeline

## 1. Goals

- interactive latency rather than recording quality;
- bounded memory;
- static desktop consumes almost no network;
- cursor does not force video frames;
- codec provider is replaceable;
- browser receives timestamped complete decode units;
- media failure does not corrupt RDP session state.

## 2. Framebuffer

The worker owns one current framebuffer sized to negotiated desktop dimensions. Normalize to BGRA8 internally. FreeRDP/GDI updates mutate this buffer. Dirty-region tracking records changed rectangles, but there is no queue of raw frames.

On `EndPaint`/GFX frame end:

- merge dirty rects;
- update a monotonically increasing desktop revision;
- signal `FrameScheduler`;
- clear dirty set only after scheduler snapshots the revision.

Use double-buffering only if the selected encoder cannot safely read while FreeRDP writes. Prefer a lock-free or short critical section around snapshot/encode scheduling rather than duplicating 4K framebuffers blindly.

## 3. Frame scheduler

State:

- `lastEncodedRevision`;
- `nextDeadline` from max FPS;
- congestion level;
- force-keyframe flag;
- browser attached flag.

Rules:

- if no changed revision, do not encode;
- coalesce multiple RDP updates arriving within one frame interval;
- if encoder is busy, replace pending work with newest revision instead of queueing another raw frame;
- under congestion lower FPS and/or target bitrate;
- if browser queue is critical, discard non-key access units and issue a new keyframe request after recovery.

## 4. Video encoding

Primary codec: H.264 AVC, low-latency profile compatible with WebCodecs.

Encoder requirements:

- no B-frames;
- short GOP, default keyframe interval 1–2 seconds;
- explicit force-IDR support;
- low-latency rate control;
- configurable bitrate cap;
- 4:2:0 browser-compatible pixel format;
- deterministic SPS/PPS/config extraction;
- hardware provider selection `auto/prefer/off`.

Provider order example on Linux:

1. verified hardware encoder (VAAPI/QSV/NVENC/V4L2 depending host);
2. OpenH264 software;
3. policy-approved libx264 build;
4. JPEG/WebP fallback mode.

Do not make a specific hardware API mandatory.

## 5. Browser decode

The reference harness shall:

- check `VideoDecoder.isConfigSupported`;
- configure using `VIDEO_CONFIG`;
- feed complete `EncodedVideoChunk`s with timestamps;
- render decoded `VideoFrame` to canvas/WebGPU/bitmap renderer;
- close frames immediately after render;
- detect decoder errors and request a config/keyframe reset;
- cap local queued decode frames to avoid latency growth.

Fallback mode receives individual JPEG/WebP changed/full frames with explicit dimensions. It is for compatibility/diagnostics, not performance parity.

## 6. Audio output

RDP audio sink yields decoded PCM. Normalize to 48 kHz when beneficial. Packetization target 10–20 ms.

Modes:

- `opus`: encode with libopus, low-delay settings, browser decodes and schedules through AudioWorklet;
- `pcm`: interleaved S16LE fallback, AudioWorklet converts/schedules.

Audio queue target: 40–100 ms. If behind, drop/skip old audio with discontinuity notification rather than building seconds of latency.

## 7. Microphone

Browser obtains microphone with explicit user permission. Reference harness resamples/encodes according to negotiated `AUDIN` format and sends timestamped packets. Worker jitter buffer is bounded. If packets stop, provide silence/underflow behavior expected by the FreeRDP audin backend; never block the whole RDP event loop waiting for browser audio.

## 8. A/V synchronization

Use one monotonic worker clock converted to microseconds for all encoded output. Node does not rewrite timestamps. Browser maintains a small audio master clock and renders video as close as possible, but remote desktop interaction has higher priority than perfect media-player sync.

## 9. Cursor

Cursor shape records carry:

- width/height;
- hotspot x/y;
- pixel format or PNG payload;
- stable shape id/hash.

Position events stay on control WS because they are tiny and latency-sensitive. The browser applies position against current display scale/transformation.

## 10. Resize

Dynamic resolution sequence:

1. browser sends requested logical width/height/device scale;
2. worker asks FreeRDP display control channel if negotiated;
3. remote confirms resize;
4. worker reallocates framebuffer/encoder;
5. emit `display.resize` + new `VIDEO_CONFIG` with discontinuity;
6. force IDR.

Never assume the browser request was accepted until remote desktop size changes.

## 11. Performance instrumentation

Track per session:

- RDP update rate;
- dirty area ratio;
- encode duration p50/p95;
- encoded FPS;
- bitrate;
- keyframe count;
- IPC queue depth/bytes;
- WS `bufferedAmount` high-water mark;
- video drops;
- audio underruns/drops;
- browser-reported decode/render latency when client stats are enabled.

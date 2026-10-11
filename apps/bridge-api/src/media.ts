import { WebSocket } from 'ws';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  encodeJpegRecords,
  encodeAvcRecords,
  MAX_JPEG_BYTES,
  type MediaCodec,
  encodeCursorShape,
  type CursorState,
  MAX_CURSOR_BYTES,
  type DisplayState,
  MICROPHONE_RECORD_BYTES,
} from '@freerdp-bridge/protocol';
import { publicSessionError, type SessionManager } from '@freerdp-bridge/node';
import type { MediaMetrics } from './metrics.js';
import { displayData } from './display.js';
import { installPcmMedia, installOpusMedia } from './audio.js';
import { installMicrophoneMedia } from './microphone.js';

const hello = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.Literal('media.hello'),
      data: Type.Object(
        {
          codecs: Type.Array(
            Type.Union([Type.Literal('jpeg'), Type.Literal('h264')]),
            {
              minItems: 1,
              maxItems: 2,
              uniqueItems: true,
            },
          ),
          cursor: Type.Optional(Type.Boolean()),
          display: Type.Optional(Type.Boolean()),
          microphone: Type.Optional(
            Type.Object(
              { codec: Type.Literal('pcm'), sourceStatus: Type.Literal(true) },
              { additionalProperties: false },
            ),
          ),
          audio: Type.Optional(
            Type.Object(
              {
                codec: Type.Union([Type.Literal('pcm'), Type.Literal('opus')]),
                sourceStatus: Type.Literal(true),
              },
              { additionalProperties: false },
            ),
          ),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);
const ack = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.Literal('media.ack'),
      data: Type.Object(
        { sequence: Type.Integer({ minimum: 0, maximum: 0xffffffff }) },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);
const reset = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.Literal('media.reset'),
      data: Type.Object(
        { sequence: Type.Integer({ minimum: 0, maximum: 0xffffffff }) },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);
const audioAck = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.Literal('audio.ack'),
      data: Type.Object(
        { sequence: Type.Integer({ minimum: 0, maximum: 0xffffffff }) },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);

/** Browser render acknowledgements grant one frame of credit. No timer queues raw/encoded frames. */
export function installMedia(
  ws: WebSocket,
  lease: ReturnType<SessionManager['attach']>,
  send: (type: string, data: unknown) => void,
  metrics: MediaMetrics,
): {
  cursor: (state: CursorState) => void;
  display: (state: DisplayState, resizing: boolean) => void;
} {
  let negotiated = false,
    busy = false,
    revision = 0n;
  let window = Date.now(),
    received = 0;
  let sequence = 0,
    expectedAck: number | undefined;
  let width = 0,
    height = 0;
  let codec: MediaCodec | undefined,
    offered: MediaCodec[] = [];
  let forceKeyframe = true,
    resets = 0,
    avcConfig: Buffer | undefined;
  let timer: NodeJS.Timeout | undefined;
  let lastPull = performance.now();
  let maxFps = 0;
  let deadline: NodeJS.Timeout | undefined;
  let creditStarted: number | undefined;
  let cursorOffered = false,
    cursorSequence = 0,
    sentShapeId = 0n;
  let displayOffered = false;
  let audioOffered: 'pcm' | 'opus' | undefined;
  let audio: ReturnType<typeof installPcmMedia> | undefined;
  let microphoneOffered = false;
  let microphone: ReturnType<typeof installMicrophoneMedia> | undefined;
  let microphoneCommands = 0;
  let latestCursor = lease.cursor;
  let latestDisplay = lease.display;
  let cursorBusy = false;
  const cursor = (state: CursorState) => {
    latestCursor = state;
    if (
      !cursorOffered ||
      cursorBusy ||
      !codec ||
      state.default ||
      state.shapeId === sentShapeId ||
      !state.rgba ||
      ws.readyState !== WebSocket.OPEN
    )
      return;
    if (cursorSequence > 0xffffffff) {
      ws.close(1000, 'cursor sequence exhausted');
      return;
    }
    const record = encodeCursorShape(state, cursorSequence++);
    if (ws.bufferedAmount + record.length > limit) {
      ws.close(1008, 'cursor backlog limit');
      return;
    }
    sentShapeId = state.shapeId;
    cursorBusy = true;
    ws.send(record, { binary: true }, (error) => {
      cursorBusy = false;
      if (error) ws.terminate();
      else if (latestCursor) cursor(latestCursor);
    });
  };
  const releaseCredit = (acknowledged: boolean) => {
    if (creditStarted === undefined || !codec) return;
    if (acknowledged)
      metrics.observe(
        codec,
        'render_credit',
        performance.now() - creditStarted,
      );
    metrics.credit(codec, -1);
    creditStarted = undefined;
  };
  const fail = (code: string) => {
    audio?.close();
    microphone?.close();
    send('media.error', { code });
    ws.close(1008, 'media unavailable');
  };
  const limit = MAX_JPEG_BYTES + 2059 + 128 + MAX_CURSOR_BYTES + 48;
  const schedule = () => {
    clearTimeout(timer);
    if (ws.readyState === WebSocket.OPEN)
      timer = setTimeout(
        () => {
          void pull();
        },
        codec === 'h264'
          ? Math.max(0, lastPull + Math.ceil(1000 / maxFps) - performance.now())
          : Math.ceil(1000 / maxFps),
      );
  };
  const pull = async () => {
    if (
      !codec ||
      busy ||
      expectedAck !== undefined ||
      ws.readyState !== WebSocket.OPEN
    )
      return;
    busy = true;
    lastPull = performance.now();
    const generation = latestDisplay?.generation;
    try {
      const frame = await lease.captureFrame(revision, {
        codec,
        forceKeyframe,
      });
      const changed = Boolean(
        frame && (codec === 'h264' ? frame.avc : frame.jpeg),
      );
      metrics.observe(
        codec,
        changed ? 'capture_changed' : 'capture_unchanged',
        performance.now() - lastPull,
      );
      if (ws.readyState !== WebSocket.OPEN) return;
      if (!frame || !changed || generation !== latestDisplay?.generation) {
        schedule();
        return;
      }
      if (sequence > 0xfffffffc) {
        ws.close(1000, 'media sequence exhausted');
        return;
      }
      const reconfigure =
        frame.width !== width ||
        frame.height !== height ||
        (codec === 'h264' &&
          (!avcConfig || !frame.avc!.config.equals(avcConfig)));
      if (codec === 'h264' && forceKeyframe && !frame.avc!.keyframe)
        throw new Error('Media keyframe missing');
      const records =
        codec === 'h264'
          ? encodeAvcRecords(frame, sequence, reconfigure)
          : encodeJpegRecords(frame, sequence, reconfigure);
      const bytes = records.reduce((sum, record) => sum + record.length, 0);
      if (audio && !audio.canSendVideo()) {
        // The encoder already advanced: recover a discarded AVC unit with IDR.
        forceKeyframe = true;
        schedule();
        return;
      }
      if (ws.bufferedAmount + bytes > limit) {
        ws.close(1008, 'media backlog limit');
        return;
      }
      width = frame.width;
      height = frame.height;
      if (codec === 'h264') avcConfig = Buffer.from(frame.avc!.config);
      forceKeyframe = false;
      revision = frame.revision;
      sequence += records.length;
      expectedAck = sequence - 1;
      creditStarted = performance.now();
      metrics.credit(codec, 1);
      metrics.queued(codec, bytes);
      deadline = setTimeout(() => {
        ws.close(1008, 'media acknowledgement deadline');
      }, 5000);
      const writeStarted = performance.now();
      for (const [index, record] of records.entries())
        ws.send(record, { binary: true }, (error) => {
          if (error) ws.terminate();
          else if (index === records.length - 1)
            metrics.observe(
              codec!,
              'forward',
              performance.now() - writeStarted,
            );
        });
    } catch (error) {
      fail(publicSessionError(error).code);
    } finally {
      busy = false;
    }
  };
  const negotiate = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      const choices = (['h264', 'jpeg'] as const).filter((candidate) =>
        offered.includes(candidate),
      );
      const supported = choices.map((candidate) =>
        lease.supportsCodec(candidate),
      );
      const selected = supported.findIndex((value) => value === true);
      if (supported.some((value) => value === undefined)) {
        timer = setTimeout(negotiate, 50);
        return;
      }
      if (selected === -1) {
        fail('MEDIA_NOT_IMPLEMENTED');
        return;
      }
      codec = choices[selected]!;
      maxFps = lease.maxFps(codec);
      if (audioOffered) {
        const audioMetrics =
          metrics.audio.forCodec?.(audioOffered) ?? metrics.audio;
        audio =
          audioOffered === 'pcm'
            ? installPcmMedia(ws, lease, fail, audioMetrics)
            : installOpusMedia(ws, lease, fail, audioMetrics);
      }
      if (microphoneOffered)
        microphone = installMicrophoneMedia(ws, lease, send, fail);
      clearTimeout(deadline);
      send('media.ready', {
        codec,
        maxFps,
        maxInFlight: 1,
        maxPayloadBytes: MAX_JPEG_BYTES,
        cursor: cursorOffered,
        display: displayOffered,
        ...(microphone
          ? {
              microphone: {
                codec: 'pcm',
                sourceStatus: true,
                streamId: 4,
                sampleRate: 48000,
                channels: 2,
                frames: 960,
                maxPayloadBytes: MICROPHONE_RECORD_BYTES,
                maxInFlight: 1,
                packetTimeoutMs: 2000,
                stopTimeoutMs: 4000,
              },
            }
          : {}),
        ...(audio
          ? {
              audio: {
                codec: audioOffered,
                sourceStatus: true,
                streamId: 3,
                maxInFlight: 1,
                ackTimeoutMs: 2000,
              },
            }
          : {}),
      });
      if (displayOffered && latestDisplay)
        send('display.info', displayData(latestDisplay, lease.resizing));
      if (latestCursor) cursor(latestCursor);
      audio?.start();
      microphone?.start();
      void pull();
    } catch (error) {
      fail(publicSessionError(error).code);
    }
  };
  const display = (state: DisplayState, resizing: boolean) => {
    const changed =
      latestDisplay && state.generation !== latestDisplay.generation;
    const initial = !latestDisplay;
    latestDisplay = { ...state };
    // Ordered metadata precedes the next config. Existing transmitted credit remains owned by its ACK.
    if (displayOffered && codec)
      send(
        changed ? 'display.resize' : 'display.info',
        displayData(state, resizing),
      );
    if (changed || initial) {
      forceKeyframe = true;
      avcConfig = undefined;
      width = height = 0;
      if (codec && !busy && expectedAck === undefined) schedule();
    }
  };
  deadline = setTimeout(
    () => ws.close(1008, 'media negotiation deadline'),
    5000,
  );
  ws.once('close', () => {
    audio?.close();
    microphone?.close();
    latestCursor = undefined;
    delete lease.cursor;
    releaseCredit(false);
    clearTimeout(timer);
    clearTimeout(deadline);
  });
  ws.on('message', (bytes, binary) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (Date.now() - window >= 1000) {
      window = Date.now();
      received = 0;
      microphoneCommands = 0;
    }
    if (++received > (microphone ? 160 : audio ? 128 : 32)) {
      fail('MEDIA_RATE_LIMIT');
      return;
    }
    if (binary) {
      if (microphone && Buffer.isBuffer(bytes)) microphone.receive(bytes);
      else fail('MEDIA_PROTOCOL_ERROR');
      return;
    }
    if (!Buffer.isBuffer(bytes)) {
      fail('MEDIA_PROTOCOL_ERROR');
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('MEDIA_PROTOCOL_ERROR');
      return;
    }
    if (!negotiated && hello.Check(value)) {
      negotiated = true;
      offered = value.data.codecs;
      cursorOffered = value.data.cursor ?? false;
      displayOffered = value.data.display ?? false;
      audioOffered = value.data.audio?.codec;
      microphoneOffered = Boolean(value.data.microphone);
      negotiate();
    } else if (
      microphone &&
      value &&
      typeof value === 'object' &&
      'type' in value &&
      typeof value.type === 'string' &&
      value.type.startsWith('microphone.')
    ) {
      if (++microphoneCommands > 16) fail('MICROPHONE_RATE_LIMIT');
      else if (!microphone.command(value)) fail('MEDIA_PROTOCOL_ERROR');
    } else if (audio && audioAck.Check(value)) {
      audio.acknowledge(value.data.sequence);
    } else if (
      codec === 'h264' &&
      reset.Check(value) &&
      expectedAck !== undefined &&
      value.data.sequence === expectedAck &&
      resets < 3
    ) {
      resets++;
      releaseCredit(false);
      clearTimeout(deadline);
      expectedAck = undefined;
      forceKeyframe = true;
      avcConfig = undefined;
      width = height = 0;
      schedule();
    } else if (
      negotiated &&
      ack.Check(value) &&
      expectedAck !== undefined &&
      value.data.sequence === expectedAck
    ) {
      releaseCredit(true);
      clearTimeout(deadline);
      expectedAck = undefined;
      schedule();
    } else fail('MEDIA_PROTOCOL_ERROR');
  });
  return { cursor, display };
}

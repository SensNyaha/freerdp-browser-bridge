import { WebSocket } from 'ws';
import { Type } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import {
  decodeMicrophoneRecord,
  encodeMicrophoneResult,
  encodeMicrophoneState,
  validateMicrophoneStateProgress,
  type MicrophoneState,
} from '@freerdp-bridge/protocol';
import {
  SessionError,
  type SessionManager,
  type SessionMicrophoneSnapshot,
} from '@freerdp-bridge/node';

const command = TypeCompiler.Compile(
  Type.Object(
    {
      v: Type.Literal(1),
      type: Type.Union([
        Type.Literal('microphone.start'),
        Type.Literal('microphone.stop'),
      ]),
      data: Type.Object(
        { requestSeq: Type.Integer({ minimum: 1, maximum: 0xffffffff }) },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  ),
);

/** Prepared PCM media receiver. Not yet selected by media.hello or the reference viewer. */
export function installMicrophoneMedia(
  ws: WebSocket,
  lease: ReturnType<SessionManager['attach']>,
  send: (type: string, data: unknown) => void,
  fail: (code: string) => void,
  deadlines = { packetMs: 2000, stopMs: 4000 },
) {
  if (
    ws.readyState !== WebSocket.OPEN ||
    !Number.isInteger(deadlines.packetMs) ||
    deadlines.packetMs < 20 ||
    deadlines.packetMs > 2000 ||
    !Number.isInteger(deadlines.stopMs) ||
    deadlines.stopMs < 20 ||
    deadlines.stopMs > 4000
  )
    throw new SessionError('MEDIA_FAILED');
  const packetMs = deadlines.packetMs,
    stopMs = deadlines.stopMs;
  let started = false,
    closed = false,
    grantRequested = false;
  let latest: SessionMicrophoneSnapshot | undefined;
  let previous: MicrophoneState | undefined;
  let lastPacket = 0,
    lastCommand = 0;
  let packetPending = false,
    stopPending = false;
  let packetTimer: NodeJS.Timeout | undefined,
    stopTimer: NodeJS.Timeout | undefined;
  let off: (() => void) | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    ws.off('close', close);
    grantRequested = false;
    clearTimeout(packetTimer);
    clearTimeout(stopTimer);
    try {
      off?.();
    } catch {
      /* Still revoke via the explicit stop below. */
    }
    off = undefined;
    latest = undefined;
    try {
      void lease.stopMicrophone().catch(() => {});
    } catch {
      /* Detach also revokes the grant. */
    }
  };
  const fault = (code: string) => {
    if (closed) return;
    close();
    try {
      fail(code);
    } catch {
      ws.terminate();
    }
  };
  const output = (type: string, data: unknown) => {
    if (closed || ws.readyState !== WebSocket.OPEN) return;
    // Every wrapped scalar reply is below 1 KiB; reserve space in the shared 64 KiB backlog.
    if (ws.bufferedAmount + 1024 > 65536) {
      fault('MICROPHONE_BACKLOG_LIMIT');
      return;
    }
    try {
      send(type, data);
    } catch {
      fault('MICROPHONE_TRANSPORT_ERROR');
    }
  };
  const status = () => {
    if (!latest) return;
    const state = latest.state;
    output('microphone.state', {
      granted: latest.granted,
      retiring: latest.retiring,
      source: state
        ? {
            enabled: state.enabled,
            availability: state.availability,
            revision: state.revision.toString(),
            epoch: state.epoch.toString(),
            timestampUs: state.timestampUs.toString(),
          }
        : null,
    });
  };
  const observe = (snapshot: SessionMicrophoneSnapshot) => {
    if (closed) return;
    try {
      if (
        !snapshot ||
        typeof snapshot.granted !== 'boolean' ||
        typeof snapshot.retiring !== 'boolean' ||
        (snapshot.granted && snapshot.retiring)
      )
        throw new Error();
      let state: MicrophoneState | undefined;
      if (snapshot.state) {
        const { enabled, availability, revision, epoch, timestampUs } =
          snapshot.state;
        state = { enabled, availability, revision, epoch, timestampUs };
        encodeMicrophoneState(state);
        if (!enabled) throw new Error();
        if (previous?.revision === revision) {
          if (
            previous.enabled !== enabled ||
            previous.availability !== availability ||
            previous.epoch !== epoch ||
            previous.timestampUs !== timestampUs
          )
            throw new Error();
        } else validateMicrophoneStateProgress(previous, state);
        previous = state;
      } else if (previous) throw new Error();
      if (snapshot.granted && !grantRequested) throw new Error();
      if (!snapshot.granted) grantRequested = false;
      latest = {
        ...(state ? { state } : {}),
        granted: snapshot.granted,
        retiring: snapshot.retiring,
      };
      if (started) status();
    } catch {
      fault('MICROPHONE_PROTOCOL_ERROR');
    }
  };
  // Getter establishes selected profile; registration provides future metadata without sample history.
  const initial = lease.microphoneSnapshot;
  if (!initial || initial.granted) throw new SessionError('MEDIA_FAILED');
  observe(initial);
  if (closed) throw new SessionError('MEDIA_FAILED');
  off = lease.onMicrophone(observe);
  if (closed || typeof off !== 'function' || ws.readyState !== WebSocket.OPEN) {
    try {
      off?.();
    } catch {
      /* Explicit stop remains the retirement fallback. */
    }
    off = undefined;
    close();
    throw new SessionError('MEDIA_FAILED');
  }
  ws.once('close', close);
  const reply = (requestSeq: number, value: string) =>
    output('microphone.result', { requestSeq, status: value });
  const acknowledge = (sequence: number, epoch: bigint, result: string) =>
    output('microphone.ack', {
      sequence,
      epoch: epoch.toString(),
      status: result,
    });
  return {
    start() {
      if (started || closed) return;
      started = true;
      status();
    },
    command(value: unknown): boolean {
      if (
        !value ||
        typeof value !== 'object' ||
        !('type' in value) ||
        typeof value.type !== 'string' ||
        !['microphone.start', 'microphone.stop'].includes(value.type)
      )
        return false;
      if (closed) return true;
      if (
        !started ||
        !command.Check(value) ||
        value.data.requestSeq <= lastCommand
      ) {
        fault('MICROPHONE_PROTOCOL_ERROR');
        return true;
      }
      lastCommand = value.data.requestSeq;
      const requestSeq = lastCommand;
      if (stopPending) {
        reply(requestSeq, 'busy');
        return true;
      }
      if (value.type === 'microphone.start') {
        if (grantRequested || packetPending) {
          reply(requestSeq, 'busy');
          return true;
        }
        try {
          grantRequested = true;
          const admitted = lease.startMicrophone();
          if (typeof admitted !== 'boolean') throw new Error();
          if (!admitted) grantRequested = false;
          if (admitted !== latest?.granted) throw new Error();
          reply(requestSeq, admitted ? 'started' : 'busy');
        } catch {
          fault('MICROPHONE_ADMISSION_ERROR');
        }
      } else {
        grantRequested = false;
        stopPending = true;
        stopTimer = setTimeout(() => fault('MICROPHONE_STOP_DEADLINE'), stopMs);
        try {
          void lease.stopMicrophone().then(
            (safe) => {
              if (closed) return;
              clearTimeout(stopTimer);
              stopPending = false;
              if (safe !== true) {
                fault('MICROPHONE_RETIREMENT_ERROR');
                return;
              }
              reply(requestSeq, 'stopped');
            },
            () => fault('MICROPHONE_RETIREMENT_ERROR'),
          );
        } catch {
          fault('MICROPHONE_RETIREMENT_ERROR');
        }
      }
      return true;
    },
    receive(bytes: Buffer) {
      if (closed) return;
      let sequence: number, epoch: bigint;
      try {
        ({ sequence, epoch } = decodeMicrophoneRecord(bytes));
        if (!started || sequence <= lastPacket) throw new Error();
        lastPacket = sequence;
      } catch {
        fault('MICROPHONE_PROTOCOL_ERROR');
        return;
      }
      if (!grantRequested || !latest?.granted) {
        acknowledge(sequence, epoch, 'unavailable');
        return;
      }
      if (latest.state?.availability !== 'ready') {
        acknowledge(sequence, epoch, 'unavailable');
        return;
      }
      if (latest.state.epoch !== epoch) {
        acknowledge(sequence, epoch, 'stale');
        return;
      }
      if (packetPending) {
        acknowledge(sequence, epoch, 'busy');
        return;
      }
      packetPending = true;
      packetTimer = setTimeout(
        () => fault('MICROPHONE_PACKET_DEADLINE'),
        packetMs,
      );
      try {
        void lease.sendMicrophone(bytes).then(
          (admission) => {
            if (closed) return;
            clearTimeout(packetTimer);
            packetPending = false;
            try {
              if (admission.sequence !== sequence) throw new Error();
              encodeMicrophoneResult(admission.result);
              const current = grantRequested && latest?.granted;
              acknowledge(
                sequence,
                epoch,
                !current || latest?.state?.availability !== 'ready'
                  ? 'unavailable'
                  : latest.state.epoch !== epoch
                    ? 'stale'
                    : admission.result,
              );
            } catch {
              fault('MICROPHONE_PROTOCOL_ERROR');
            }
          },
          () => fault('MICROPHONE_ADMISSION_ERROR'),
        );
      } catch {
        fault('MICROPHONE_ADMISSION_ERROR');
      }
    },
    close,
  };
}

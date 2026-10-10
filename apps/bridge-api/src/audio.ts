import { WebSocket } from 'ws';
import {
  PcmMediaSender,
  SessionError,
  type SessionManager,
} from '@freerdp-bridge/node';

/** One ordered socket record and one latest pending sample, with finite progress. */
export function installPcmMedia(
  ws: WebSocket,
  lease: ReturnType<SessionManager['attach']>,
  fail: (code: string) => void,
) {
  const initial = lease.audio;
  if (!initial) throw new SessionError('MEDIA_NOT_IMPLEMENTED');
  const owner = new PcmMediaSender({
    ...(initial.state ? { state: initial.state } : {}),
    ...(initial.config ? { config: initial.config } : {}),
  });
  let started = false,
    closed = false;
  let timer: NodeJS.Timeout | undefined;
  let admissionStarted: number | undefined;
  let off: (() => void) | undefined;
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    off?.();
    off = undefined;
    owner.close();
  };
  const retire = (code = 'MEDIA_FAILED') => {
    if (closed) return;
    close();
    fail(code);
  };
  const flush = () => {
    if (!started || closed) return;
    if (ws.readyState !== WebSocket.OPEN) {
      close();
      return;
    }
    try {
      if (lease.audioFailed) {
        retire();
        return;
      }
      const now = Math.floor(performance.now());
      const result = owner.pump(now, (record) => {
        // Do not queue audio behind an existing local video/cursor/socket write.
        if (ws.bufferedAmount !== 0) return false;
        ws.send(record, { binary: true }, (error) => {
          if (error) retire();
        });
        return true;
      });
      if (result === 'failed' || result === 'invalid') {
        retire();
        return;
      }
      const state = owner.snapshot();
      if (
        result === 'blocked' &&
        !state.inFlight &&
        (state.pendingState || state.pendingPacketBytes)
      ) {
        admissionStarted ??= now;
        if (now - admissionStarted >= 2000) retire();
      } else admissionStarted = undefined;
    } catch {
      retire();
    }
  };
  off = lease.onAudio((event) => {
    if (closed) return;
    if (!owner.offer(event)) retire();
    else flush();
  });
  ws.once('close', close);
  return {
    start() {
      if (closed || started) return;
      started = true;
      timer = setInterval(flush, 20);
      flush();
    },
    acknowledge(sequence: number) {
      if (
        !started ||
        closed ||
        !owner.acknowledge(sequence, Math.floor(performance.now()))
      ) {
        retire('MEDIA_PROTOCOL_ERROR');
        return;
      }
      flush();
    },
    canSendVideo() {
      flush();
      const state = owner.snapshot();
      return (
        !closed &&
        ws.bufferedAmount === 0 &&
        (state.inFlight || (!state.pendingState && !state.pendingPacketBytes))
      );
    },
    close,
  };
}

import { WebSocket } from 'ws';
import {
  PcmMediaSender,
  isPcmSourceEvent,
  OpusMediaSender,
  isOpusSourceEvent,
  SessionError,
  type SessionAudioEvent,
  type SessionManager,
} from '@freerdp-bridge/node';
import type { AudioMetrics, AudioFailure } from './metrics.js';

/** Existing PCM route: one credit and one latest pending sample. */
export function installPcmMedia(
  ws: WebSocket,
  lease: ReturnType<SessionManager['attach']>,
  fail: (code: string) => void,
  metrics?: AudioMetrics,
) {
  return installAudioMedia(ws, lease, fail, 'pcm', metrics);
}

/** Opus route with native expected-epoch recovery and one receiver credit. */
export function installOpusMedia(
  ws: WebSocket,
  lease: ReturnType<SessionManager['attach']>,
  fail: (code: string) => void,
  metrics?: AudioMetrics,
) {
  return installAudioMedia(ws, lease, fail, 'opus', metrics);
}

function installAudioMedia(
  ws: WebSocket,
  lease: ReturnType<SessionManager['attach']>,
  fail: (code: string) => void,
  codec: 'pcm' | 'opus',
  metrics?: AudioMetrics,
) {
  const initial = lease.audio;
  if (!initial || initial.codec !== codec)
    throw new SessionError('MEDIA_NOT_IMPLEMENTED');
  const owner =
    initial.codec === 'pcm'
      ? new PcmMediaSender({
          ...(initial.state ? { state: initial.state } : {}),
          ...(initial.config ? { config: initial.config } : {}),
        })
      : new OpusMediaSender({
          ...(initial.state ? { state: initial.state } : {}),
          ...(initial.config ? { config: initial.config } : {}),
        });
  const offer = (event: SessionAudioEvent) =>
    owner instanceof PcmMediaSender
      ? isPcmSourceEvent(event) && owner.offer(event)
      : isOpusSourceEvent(event) && owner.offer(event);
  const snapshot = () => {
    const next = owner.snapshot();
    return {
      ...next,
      replacedPackets: 'replacedPackets' in next ? next.replacedPackets : 0,
    };
  };
  let started = false,
    closed = false;
  let timer: NodeJS.Timeout | undefined;
  let admissionStarted: number | undefined;
  let off: (() => void) | undefined;
  let accounted = {
    inFlight: 0,
    pendingPacketBytes: 0,
    inFlightBytes: 0,
    replacedPackets: 0,
    discardedPackets: 0,
    retiredPackets: 0,
  };
  let creditStarted: number | undefined;
  let resetPending = false;
  let scheduledEpoch: bigint | undefined;
  let resetRetryAt = 0;
  const account = () => {
    const next = snapshot();
    if (
      next.inFlight !== accounted.inFlight ||
      next.pendingPacketBytes !== accounted.pendingPacketBytes ||
      next.inFlightBytes !== accounted.inFlightBytes
    )
      metrics?.storage(
        next.inFlight - accounted.inFlight,
        next.pendingPacketBytes - accounted.pendingPacketBytes,
        next.inFlightBytes - accounted.inFlightBytes,
      );
    if (next.replacedPackets > accounted.replacedPackets)
      metrics?.discarded(
        'replacement',
        next.replacedPackets - accounted.replacedPackets,
      );
    if (next.discardedPackets > accounted.discardedPackets)
      metrics?.discarded(
        'source_reset',
        next.discardedPackets - accounted.discardedPackets,
      );
    if (next.retiredPackets > accounted.retiredPackets)
      metrics?.discarded(
        'retirement',
        next.retiredPackets - accounted.retiredPackets,
      );
    accounted = next;
  };
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    off?.();
    off = undefined;
    owner.close();
    creditStarted = undefined;
    account();
  };
  const retire = (code = 'MEDIA_FAILED', reason: AudioFailure = 'consumer') => {
    if (closed) return;
    metrics?.failure(reason);
    close();
    fail(code);
  };
  const recover = (now: number) => {
    if (!(owner instanceof OpusMediaSender)) return;
    const epoch = owner.resetEpoch;
    if (
      epoch === undefined ||
      resetPending ||
      epoch === scheduledEpoch ||
      now < resetRetryAt
    )
      return;
    resetPending = true;
    resetRetryAt = now + 100;
    // One promise only. Detach may retire this route before its first microtask.
    void Promise.resolve()
      .then(() => {
        if (closed || owner.resetEpoch !== epoch) return undefined;
        return lease.resetAudio(epoch);
      })
      .then((result) => {
        if (closed || result === undefined) return;
        if (result === 'scheduled') scheduledEpoch = epoch;
        else if (!['stale', 'busy', 'unavailable'].includes(result))
          retire('MEDIA_FAILED', 'protocol');
        // Refusals retry at most every 100 ms within the sender's 2 s deadline.
        // Fresh source state/config, never this completion, grants new-epoch media.
      })
      .catch(() => {
        if (!closed) retire();
      })
      .finally(() => {
        resetPending = false;
      });
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
      const hadCredit = Boolean(owner.snapshot().inFlight);
      const result = owner.pump(now, (record) => {
        // Do not queue audio behind an existing local video/cursor/socket write.
        if (ws.bufferedAmount !== 0) return false;
        const writeStarted = performance.now();
        ws.send(record, { binary: true }, (error) => {
          if (error) retire();
          else if (!closed)
            metrics?.observe('forward', performance.now() - writeStarted);
        });
        metrics?.queued(
          record[5] === 9 ? 'state' : record[5] === 3 ? 'config' : 'packet',
          record.length,
        );
        return true;
      });
      account();
      if (result === 'sent') creditStarted = performance.now();
      if (result === 'failed' || result === 'invalid') {
        retire('MEDIA_FAILED', hadCredit ? 'receiver_deadline' : 'consumer');
        return;
      }
      recover(now);
      const state = owner.snapshot();
      if (
        result === 'blocked' &&
        !state.inFlight &&
        (state.pendingState || state.pendingPacketBytes)
      ) {
        admissionStarted ??= now;
        if (now - admissionStarted >= 2000)
          retire('MEDIA_FAILED', 'admission_deadline');
      } else admissionStarted = undefined;
    } catch {
      retire();
    }
  };
  off = lease.onAudio((event) => {
    if (closed) return;
    if (!offer(event)) retire('MEDIA_FAILED', 'protocol');
    else {
      account();
      flush();
    }
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
        retire('MEDIA_PROTOCOL_ERROR', 'ack');
        return;
      }
      if (creditStarted !== undefined)
        metrics?.observe('receiver_credit', performance.now() - creditStarted);
      creditStarted = undefined;
      account();
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

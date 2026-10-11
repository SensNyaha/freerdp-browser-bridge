import {
  ProtocolError,
  type PcmAudioState,
  type PcmAudioConfig,
  type OpusAudioConfig,
} from '@freerdp-bridge/protocol';
import { PcmSource, type PcmSourceEvent } from './pcm-source.js';
import { OpusSource, type OpusSourceEvent } from './opus-source.js';

export type SessionAudioEvent = PcmSourceEvent | OpusSourceEvent;
export type SessionAudioSnapshot =
  | {
      codec: 'pcm';
      state: PcmAudioState | undefined;
      config: PcmAudioConfig | undefined;
    }
  | {
      codec: 'opus';
      state: PcmAudioState | undefined;
      config: OpusAudioConfig | undefined;
    };

/** Profile narrowing only; the selected source/sender still validates every field. */
export function isPcmSourceEvent(
  event: SessionAudioEvent,
): event is PcmSourceEvent {
  if (!event) return false;
  if (event.type === 'state') return true;
  if (event.type === 'config') return event.config?.codec === 'pcm';
  return (
    event.type === 'packet' &&
    !!event.packet &&
    typeof event.packet === 'object' &&
    'pcm' in event.packet &&
    !('encoded' in event.packet)
  );
}
export function isOpusSourceEvent(
  event: SessionAudioEvent,
): event is OpusSourceEvent {
  if (!event) return false;
  if (event.type === 'state') return true;
  if (event.type === 'config') return event.config?.codec === 'opus';
  return (
    event.type === 'packet' &&
    !!event.packet &&
    typeof event.packet === 'object' &&
    'encoded' in event.packet &&
    !('pcm' in event.packet)
  );
}

/** One fixed source profile per managed session; retains metadata, never packets. */
export class SessionAudioSource {
  private readonly selected:
    | { codec: 'pcm'; source: PcmSource }
    | { codec: 'opus'; source: OpusSource };
  constructor(codec: 'pcm' | 'opus') {
    if (codec === 'pcm') this.selected = { codec, source: new PcmSource() };
    else if (codec === 'opus')
      this.selected = { codec, source: new OpusSource() };
    else throw new ProtocolError();
  }
  get current(): PcmAudioState | undefined {
    return this.selected.source.current;
  }
  snapshot(): SessionAudioSnapshot {
    const selected = this.selected;
    if (selected.codec === 'pcm')
      return {
        codec: 'pcm',
        state: selected.source.current,
        config: selected.source.configuration,
      };
    return {
      codec: 'opus',
      state: selected.source.current,
      config: selected.source.configuration,
    };
  }
  acceptEvent(event: SessionAudioEvent): SessionAudioEvent {
    const selected = this.selected;
    if (selected.codec === 'pcm' && isPcmSourceEvent(event))
      return selected.source.acceptEvent(event);
    if (selected.codec === 'opus' && isOpusSourceEvent(event))
      return selected.source.acceptEvent(event);
    throw new ProtocolError();
  }
}

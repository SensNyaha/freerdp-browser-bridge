import { Gauge, Counter, Histogram, Registry } from 'prom-client';
import { type SessionManager } from '@freerdp-bridge/node';
import type { MediaCodec } from '@freerdp-bridge/protocol';
import type { MicrophoneResult } from '@freerdp-bridge/protocol';

export type MicrophoneMetricFailure =
  | 'protocol'
  | 'backlog'
  | 'transport'
  | 'admission'
  | 'retirement'
  | 'packet_deadline'
  | 'stop_deadline';
export interface MicrophoneMetrics {
  forCodec?(codec: 'pcm' | 'opus'): MicrophoneMetrics;
  received(bytes: number): void;
  decision(
    operation: 'start' | 'stop' | 'packet',
    result: MicrophoneResult | 'started' | 'stopped',
  ): void;
  observe(
    operation: 'packet_admission' | 'retirement',
    milliseconds: number,
  ): void;
  packetStorage(change: 1 | -1, bytes: number): void;
  retirement(change: 1 | -1): void;
  failure(reason: MicrophoneMetricFailure): void;
}

export type AudioFailure =
  | 'ack'
  | 'protocol'
  | 'receiver_deadline'
  | 'admission_deadline'
  | 'consumer';
export interface AudioMetrics {
  forCodec?(codec: 'pcm' | 'opus'): AudioMetrics;
  observe(stage: 'forward' | 'receiver_credit', milliseconds: number): void;
  queued(record: 'state' | 'config' | 'packet', bytes: number): void;
  storage(credit: number, pendingBytes: number, inFlightBytes: number): void;
  discarded(
    reason: 'replacement' | 'source_reset' | 'retirement',
    packets: number,
  ): void;
  failure(reason: AudioFailure): void;
}

export interface MediaMetrics {
  audio: AudioMetrics;
  microphone?: MicrophoneMetrics;
  observe(
    codec: MediaCodec,
    stage:
      | 'capture_changed'
      | 'capture_unchanged'
      | 'forward'
      | 'render_credit',
    milliseconds: number,
  ): void;
  queued(codec: MediaCodec, bytes: number): void;
  credit(codec: MediaCodec, change: 1 | -1): void;
}

export function createSessionMetrics(manager: SessionManager) {
  const registry = new Registry();
  new Gauge({
    name: 'bridge_sessions_active',
    help: 'Session worker admission slots still owned',
    registers: [registry],
    collect() {
      this.set(manager.statistics().active);
    },
  });
  new Gauge({
    name: 'bridge_session_records',
    help: 'Bounded current and retained session records',
    labelNames: ['state'] as const,
    registers: [registry],
    collect() {
      this.reset();
      for (const [state, count] of Object.entries(manager.statistics().states))
        this.set({ state }, count);
    },
  });
  new Gauge({
    name: 'bridge_attachments',
    help: 'Current channel attachments',
    registers: [registry],
    collect() {
      this.set(manager.statistics().attachments);
    },
  });
  new Gauge({
    name: 'bridge_attach_tokens',
    help: 'Unexpired unconsumed attach credentials',
    registers: [registry],
    collect() {
      this.set(manager.statistics().tokens);
    },
  });
  const created = new Counter({
    name: 'bridge_sessions_created_total',
    help: 'Admitted sessions',
    registers: [registry],
  });
  const failed = new Counter({
    name: 'bridge_sessions_failed_total',
    help: 'Failed session workers',
    registers: [registry],
  });
  const rejected = new Counter({
    name: 'bridge_session_creates_rejected_total',
    help: 'Rejected session create requests',
    registers: [registry],
  });
  const previous = { created: 0, failed: 0, rejected: 0 };
  const duration = new Histogram({
    name: 'bridge_media_stage_duration_seconds',
    help: 'Successful capture requests, local WebSocket writes and valid render-credit round trips',
    labelNames: ['codec', 'stage'] as const,
    buckets: [0.001, 0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6, 1.5, 5],
    registers: [registry],
  });
  const frames = new Counter({
    name: 'bridge_media_frames_queued_total',
    help: 'Changed encoded frames queued for media attachments',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const bytes = new Counter({
    name: 'bridge_media_bytes_queued_total',
    help: 'RWB1 bytes queued, including configuration and encoded frames',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const inFlight = new Gauge({
    name: 'bridge_media_frames_in_flight',
    help: 'Frames currently holding browser render credit',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  for (const codec of ['h264', 'jpeg'] as const) {
    frames.inc({ codec }, 0);
    bytes.inc({ codec }, 0);
    inFlight.set({ codec }, 0);
  }
  const media: MediaMetrics = {
    audio: createAudioMetrics(registry),
    microphone: createMicrophoneMetrics(registry),
    observe(codec, stage, milliseconds) {
      duration.observe({ codec, stage }, milliseconds / 1000);
    },
    queued(codec, length) {
      frames.inc({ codec });
      bytes.inc({ codec }, length);
    },
    credit(codec, change) {
      inFlight.inc({ codec }, change);
    },
  };
  return {
    contentType: registry.contentType,
    media,
    async render() {
      for (const [key, counter] of [
        ['created', created],
        ['failed', failed],
        ['rejected', rejected],
      ] as const) {
        counter.inc(manager.totals[key] - previous[key]);
        previous[key] = manager.totals[key];
      }
      return registry.metrics();
    },
  };
}

function createMicrophoneMetrics(registry: Registry): MicrophoneMetrics {
  const received = new Counter({
    name: 'bridge_microphone_packets_received_total',
    help: 'Valid sequenced microphone RWB1 packets before grant/admission checks',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const bytes = new Counter({
    name: 'bridge_microphone_bytes_received_total',
    help: 'Valid sequenced microphone RWB1 bytes including metadata',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const decisions = new Counter({
    name: 'bridge_microphone_decisions_total',
    help: 'Validated local microphone command and packet decisions before reply writes',
    labelNames: ['codec', 'operation', 'result'] as const,
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'bridge_microphone_stage_duration_seconds',
    help: 'Active valid microphone backend admission and explicit stop-barrier round trips',
    labelNames: ['codec', 'operation'] as const,
    buckets: [0.001, 0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6, 1, 2, 4],
    registers: [registry],
  });
  const packets = new Gauge({
    name: 'bridge_microphone_packet_operations_in_flight',
    help: 'Microphone backend packet promises awaiting settlement including detached leases',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const flightBytes = new Gauge({
    name: 'bridge_microphone_packet_bytes_in_flight',
    help: 'Logical RWB1 bytes awaiting microphone backend settlement, not heap allocation',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const retirements = new Gauge({
    name: 'bridge_microphone_retirements_in_flight',
    help: 'Explicit microphone stop promises awaiting settlement including detached leases',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const failures = new Counter({
    name: 'bridge_microphone_consumers_failed_total',
    help: 'Microphone media consumers retired by bounded protocol/progress checks',
    labelNames: ['codec', 'reason'] as const,
    registers: [registry],
  });
  const bind = (codec: 'pcm' | 'opus'): MicrophoneMetrics => {
    received.inc({ codec }, 0);
    bytes.inc({ codec }, 0);
    packets.set({ codec }, 0);
    flightBytes.set({ codec }, 0);
    retirements.set({ codec }, 0);
    for (const [operation, results] of [
      ['start', ['started', 'busy']],
      ['stop', ['stopped', 'busy']],
      ['packet', ['accepted', 'stale', 'unavailable', 'busy', 'invalid']],
    ] as const)
      for (const result of results)
        decisions.inc({ codec, operation, result }, 0);
    for (const reason of [
      'protocol',
      'backlog',
      'transport',
      'admission',
      'retirement',
      'packet_deadline',
      'stop_deadline',
    ] as const)
      failures.inc({ codec, reason }, 0);
    return {
      received(length) {
        received.inc({ codec });
        bytes.inc({ codec }, length);
      },
      decision(operation, result) {
        decisions.inc({ codec, operation, result });
      },
      observe(operation, milliseconds) {
        duration.observe({ codec, operation }, milliseconds / 1000);
      },
      packetStorage(change, length) {
        packets.inc({ codec }, change);
        flightBytes.inc({ codec }, length);
      },
      retirement(change) {
        retirements.inc({ codec }, change);
      },
      failure(reason) {
        failures.inc({ codec, reason });
      },
    };
  };
  const pcm = bind('pcm'),
    opus = bind('opus');
  return { ...pcm, forCodec: (codec) => (codec === 'opus' ? opus : pcm) };
}

function createAudioMetrics(registry: Registry): AudioMetrics {
  const duration = new Histogram({
    name: 'bridge_audio_stage_duration_seconds',
    help: 'Successful active local audio writes and exact receiver admission-credit ACK round trips',
    labelNames: ['codec', 'stage'] as const,
    buckets: [0.001, 0.005, 0.01, 0.02, 0.04, 0.08, 0.15, 0.3, 0.6, 1, 2],
    registers: [registry],
  });
  const records = new Counter({
    name: 'bridge_audio_records_queued_total',
    help: 'Audio RWB1 records admitted to local socket writes',
    labelNames: ['codec', 'record'] as const,
    registers: [registry],
  });
  const bytes = new Counter({
    name: 'bridge_audio_bytes_queued_total',
    help: 'Audio RWB1 bytes admitted, including state and config',
    labelNames: ['codec', 'record'] as const,
    registers: [registry],
  });
  const credit = new Gauge({
    name: 'bridge_audio_records_in_flight',
    help: 'Audio records holding receiver admission credit',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const pending = new Gauge({
    name: 'bridge_audio_pending_sample_bytes',
    help: 'Copied bounded unsent audio sample storage',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const flight = new Gauge({
    name: 'bridge_audio_record_bytes_in_flight',
    help: 'RWB1 bytes holding audio receiver credit',
    labelNames: ['codec'] as const,
    registers: [registry],
  });
  const discarded = new Counter({
    name: 'bridge_audio_packets_discarded_total',
    help: 'Unsent audio packets replaced or discarded at reset/retirement',
    labelNames: ['codec', 'reason'] as const,
    registers: [registry],
  });
  const failures = new Counter({
    name: 'bridge_audio_consumers_failed_total',
    help: 'Audio media consumers retired by bounded protocol/progress checks',
    labelNames: ['codec', 'reason'] as const,
    registers: [registry],
  });
  const bind = (codec: 'pcm' | 'opus'): AudioMetrics => {
    for (const record of ['state', 'config', 'packet'] as const) {
      records.inc({ codec, record }, 0);
      bytes.inc({ codec, record }, 0);
    }
    for (const reason of ['replacement', 'source_reset', 'retirement'] as const)
      discarded.inc({ codec, reason }, 0);
    for (const reason of [
      'ack',
      'protocol',
      'receiver_deadline',
      'admission_deadline',
      'consumer',
    ] as const)
      failures.inc({ codec, reason }, 0);
    credit.set({ codec }, 0);
    pending.set({ codec }, 0);
    flight.set({ codec }, 0);
    return {
      observe(stage, milliseconds) {
        duration.observe({ codec, stage }, milliseconds / 1000);
      },
      queued(record, length) {
        records.inc({ codec, record });
        bytes.inc({ codec, record }, length);
      },
      storage(change, pendingBytes, inFlightBytes) {
        credit.inc({ codec }, change);
        pending.inc({ codec }, pendingBytes);
        flight.inc({ codec }, inFlightBytes);
      },
      discarded(reason, packets) {
        discarded.inc({ codec, reason }, packets);
      },
      failure(reason) {
        failures.inc({ codec, reason });
      },
    };
  };
  const pcm = bind('pcm'),
    opus = bind('opus');
  return { ...pcm, forCodec: (codec) => (codec === 'opus' ? opus : pcm) };
}

import { EventEmitter } from 'node:events';
import type { CursorState } from '@freerdp-bridge/protocol';
import {
  WorkerProcess,
  WorkerError,
  type WorkerOptions,
  type ClipboardReadResult,
} from './index.js';
import {
  SessionError,
  type SessionErrorCode,
  type SessionWorker,
  type SessionWorkerLimits,
} from './session-manager.js';
import type { SessionCreate } from '@freerdp-bridge/config';
import type { SessionAudioEvent } from './session-audio.js';
import {
  CLIPBOARD_MAX_TEXT_BYTES,
  CLIPBOARD_METADATA_BYTES,
  HEADER_BYTES,
} from '@freerdp-bridge/protocol';
import type {
  CertificatePrompt,
  NativeConnectionState,
  SessionState,
  CapturedFrame,
  CaptureOptions,
  MediaCodec,
  InputEvent,
  PipelineStats,
  DisplayState,
  DisplayResizeResult,
  TouchState,
  AudioResetResult,
  MicrophoneState,
  MicrophonePcmPacket,
  MicrophoneOpusPacket,
  MicrophoneResult,
  MicrophoneResetResult,
  ClipboardState,
  ClipboardStatus,
} from '@freerdp-bridge/protocol';

/** Map the small, documented FreeRDP ERRINFO subset to stable public failures. */
export function classifyNativeConnectionFailure(
  event: NativeConnectionState,
): SessionErrorCode | undefined {
  if (event.error === 'NONE') return undefined;
  if (event.error === 'RDP_CONNECT_FAILED') {
    switch (event.nativeError) {
      // MAKE_FREERDP_ERROR(CONNECT, code): CONNECT class is 2 in pinned 3.32.1.
      case 0x0002000a: // ERRCONNECT_INSUFFICIENT_PRIVILEGES
      case 0x0002000e: // ERRCONNECT_PASSWORD_EXPIRED
      case 0x0002000f: // ERRCONNECT_PASSWORD_CERTAINLY_EXPIRED
      case 0x00020010: // ERRCONNECT_CLIENT_REVOKED
      case 0x00020012: // ERRCONNECT_ACCOUNT_DISABLED
      case 0x00020013: // ERRCONNECT_PASSWORD_MUST_CHANGE
      case 0x00020014: // ERRCONNECT_LOGON_FAILURE
      case 0x00020015: // ERRCONNECT_WRONG_PASSWORD
      case 0x00020016: // ERRCONNECT_ACCESS_DENIED
      case 0x00020017: // ERRCONNECT_ACCOUNT_RESTRICTION
      case 0x00020018: // ERRCONNECT_ACCOUNT_LOCKED_OUT
      case 0x00020019: // ERRCONNECT_ACCOUNT_EXPIRED
      case 0x0002001a: // ERRCONNECT_LOGON_TYPE_NOT_GRANTED
      case 0x0002001b: // ERRCONNECT_NO_OR_MISSING_CREDENTIALS
        return 'RDP_AUTHENTICATION_FAILED';
      default:
        return event.error;
    }
  }
  if (event.error !== 'RDP_DISCONNECTED') return event.error;
  switch (event.nativeError) {
    // MAKE_FREERDP_ERROR(ERRINFO, code): ERRINFO class is 1 in pinned 3.32.1.
    case 0x00010007: // ERRINFO_SERVER_DENIED_CONNECTION
    case 0x00010009: // ERRINFO_SERVER_INSUFFICIENT_PRIVILEGES
      return 'RDP_SERVER_REJECTED';
    case 0x0001000a: // ERRINFO_SERVER_FRESH_CREDENTIALS_REQUIRED
      return 'RDP_AUTHENTICATION_FAILED';
    case 0x00010005: // ERRINFO_DISCONNECTED_BY_OTHER_CONNECTION
      return 'RDP_SESSION_REPLACED';
    case 0x00010006: // ERRINFO_OUT_OF_MEMORY
    case 0x0001000f: // ERRINFO_CLOSE_STACK_ON_DRIVER_NOT_READY
    case 0x00010010: // ERRINFO_SERVER_DWM_CRASH
    case 0x00010011: // ERRINFO_CLOSE_STACK_ON_DRIVER_FAILURE
    case 0x00010012: // ERRINFO_CLOSE_STACK_ON_DRIVER_IFACE_FAILURE
    case 0x00010017: // ERRINFO_SERVER_WINLOGON_CRASH
    case 0x00010018: // ERRINFO_SERVER_CSRSS_CRASH
      return 'RDP_SERVER_FAILURE';
    case 0x00010003: // ERRINFO_IDLE_TIMEOUT
    case 0x00010004: // ERRINFO_LOGON_TIMEOUT
      return 'RDP_SERVER_TIMEOUT';
    case 0x00010002: // ERRINFO_RPC_INITIATED_LOGOFF
    case 0x0001000c: // ERRINFO_LOGOFF_BY_USER
      return 'RDP_SERVER_LOGOFF';
    default:
      return event.error;
  }
}

/** Explicit experimental native backend; full usable-desktop capability remains separately gated. */
export class NativeSessionWorker implements SessionWorker {
  private readonly worker: WorkerProcess;
  private readonly clipboardMaximum: number | undefined;
  private readonly events = new EventEmitter();
  private startup: Promise<void> | undefined;
  private closing = false;
  /** Host-side child identity for lifecycle/resource probes; not a liveness guarantee. */
  get pid(): number | undefined {
    return this.worker.pid;
  }
  constructor(
    options: WorkerOptions,
    limits: Readonly<SessionWorkerLimits> = {},
  ) {
    const maximum = limits.clipboardItemBytes;
    if (
      maximum !== undefined &&
      (!Number.isInteger(maximum) ||
        maximum < 1 ||
        maximum > CLIPBOARD_MAX_TEXT_BYTES)
    )
      throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
    const required =
      maximum === undefined
        ? undefined
        : 65536 + HEADER_BYTES + CLIPBOARD_METADATA_BYTES + maximum;
    if (
      required !== undefined &&
      options.maxWriteBytes !== undefined &&
      options.maxWriteBytes < required
    )
      throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
    this.clipboardMaximum = maximum;
    this.worker = this.createWorkerProcess({
      ...options,
      ...(required === undefined
        ? {}
        : { maxWriteBytes: options.maxWriteBytes ?? required }),
    });
    this.worker.on('rdp-state', (event: NativeConnectionState) => {
      if (this.closing) return;
      const failure = classifyNativeConnectionFailure(event);
      if (failure) this.events.emit('failure', failure);
      else this.events.emit('state', event.state);
    });
    this.worker.on('certificate', (prompt: CertificatePrompt) => {
      if (!this.closing) this.events.emit('certificate', prompt);
    });
    this.worker.on('cursor', (cursor: CursorState) => {
      if (!this.closing) this.events.emit('cursor', cursor);
    });
    this.worker.on('display', (display: DisplayState) => {
      if (!this.closing) this.events.emit('display', display);
    });
    this.worker.on('touch', (touch: TouchState) => {
      if (!this.closing) this.events.emit('touch', touch);
    });
    this.worker.on('audio', (event: SessionAudioEvent) => {
      if (!this.closing) this.events.emit('audio', event);
    });
    this.worker.on('microphone', (state: MicrophoneState) => {
      if (!this.closing) this.events.emit('microphone', state);
    });
    this.worker.on('clipboard', (state: ClipboardState) => {
      if (!this.closing) this.events.emit('clipboard', state);
    });
    this.worker.on('failure', (error: unknown) => {
      const code =
        error instanceof WorkerError &&
        (error.code === 'WORKER_MEMORY_LIMIT' ||
          error.code === 'WORKER_CPU_LIMIT' ||
          error.code === 'WORKER_RESOURCE_UNAVAILABLE')
          ? error.code
          : 'WORKER_FAILED';
      if (!this.closing) this.events.emit('failure', code);
    });
  }
  /** Trusted host process seam; the default keeps the existing private lifecycle. */
  protected createWorkerProcess(options: WorkerOptions): WorkerProcess {
    return new WorkerProcess(options);
  }
  start(config: SessionCreate, signal: AbortSignal): Promise<void> {
    if (this.startup || this.closing)
      return Promise.reject(new SessionError('WORKER_START_FAILED'));
    this.startup = this.startInternal(config, signal);
    return this.startup;
  }
  private async startInternal(
    config: SessionCreate,
    signal: AbortSignal,
  ): Promise<void> {
    const abort = () => this.worker.terminate();
    try {
      if (signal.aborted) throw new SessionError('WORKER_START_FAILED');
      const clipboard = config.clipboard;
      const selectedClipboard = clipboard && clipboard.mode !== 'off';
      if (
        selectedClipboard &&
        (!clipboard.mode ||
          clipboard.text === false ||
          clipboard.html ||
          clipboard.images ||
          clipboard.files ||
          this.clipboardMaximum !== (clipboard.maxItemBytes ?? 1048576))
      )
        throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
      if (
        config.media?.microphone &&
        !['off', 'pcm', 'opus'].includes(config.media.microphone)
      )
        throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
      signal.addEventListener('abort', abort, { once: true });
      const build = await this.worker.start();
      if (
        selectedClipboard &&
        (!build.capabilities.clipboardText ||
          !build.capabilities.clipboardRevoke)
      )
        throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
      if (
        (config.media?.microphone === 'pcm' ||
          config.media?.microphone === 'opus') &&
        (!(config.media.microphone === 'opus'
          ? build.capabilities.opusInput
          : build.capabilities.pcmInput) ||
          !build.capabilities.microphoneReset)
      )
        throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
      if (
        config.media?.audioOutput === 'opus' &&
        !build.capabilities.audioReset
      )
        throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
      if (signal.aborted || this.closing)
        throw new SessionError('WORKER_START_FAILED');
      await this.worker.connect(config);
    } catch (error) {
      if (error instanceof SessionError) throw error;
      if (
        error instanceof WorkerError &&
        [
          'RDP_NOT_IMPLEMENTED',
          'RDP_SETTING_NOT_IMPLEMENTED',
          'INVALID_SESSION_CONFIG',
          'WORKER_MEMORY_LIMIT',
          'WORKER_CPU_LIMIT',
          'WORKER_RESOURCE_UNAVAILABLE',
        ].includes(error.code)
      )
        throw new SessionError(error.code as SessionErrorCode);
      throw new SessionError('WORKER_START_FAILED');
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
  async close(): Promise<void> {
    this.closing = true;
    if (this.worker.state === 'starting') this.worker.terminate();
    await this.startup?.catch(() => {});
    if (
      this.worker.state === 'ready' &&
      this.worker.build?.capabilities.basicInput
    )
      await this.worker.sendInput({ type: 'reset' }).catch(() => {});
    await this.worker.close();
  }
  async terminate(): Promise<void> {
    this.closing = true;
    this.worker.terminate();
    await this.startup?.catch(() => {});
    await this.worker.close();
  }
  onState(listener: (state: SessionState) => void): () => void {
    this.events.on('state', listener);
    return () => {
      this.events.off('state', listener);
    };
  }
  onFailure(listener: (code?: SessionErrorCode) => void): () => void {
    this.events.on('failure', listener);
    return () => {
      this.events.off('failure', listener);
    };
  }
  onCertificate(listener: (prompt: CertificatePrompt) => void): () => void {
    this.events.on('certificate', listener);
    return () => {
      this.events.off('certificate', listener);
    };
  }
  onAudio(listener: (event: SessionAudioEvent) => void): () => void {
    this.events.on('audio', listener);
    return () => {
      this.events.off('audio', listener);
    };
  }
  onMicrophone(listener: (state: MicrophoneState) => void): () => void {
    this.events.on('microphone', listener);
    return () => {
      this.events.off('microphone', listener);
    };
  }
  async sendMicrophone(packet: MicrophonePcmPacket): Promise<MicrophoneResult> {
    try {
      if (this.closing) return 'unavailable';
      return await this.worker.sendMicrophone(packet);
    } catch {
      throw new SessionError('MEDIA_FAILED');
    }
  }
  async resetMicrophone(epoch: bigint): Promise<MicrophoneResetResult> {
    try {
      if (this.closing) return 'unavailable';
      return await this.worker.resetMicrophone(epoch);
    } catch {
      throw new SessionError('MEDIA_FAILED');
    }
  }
  async sendMicrophoneOpus(
    packet: MicrophoneOpusPacket,
  ): Promise<MicrophoneResult> {
    try {
      if (this.closing) return 'unavailable';
      return await this.worker.sendMicrophoneOpus(packet);
    } catch {
      throw new SessionError('MEDIA_FAILED');
    }
  }
  async resetAudio(expectedEpoch: bigint): Promise<AudioResetResult> {
    try {
      if (this.closing) return 'unavailable';
      return await this.worker.resetAudio(expectedEpoch);
    } catch (error) {
      throw new SessionError(
        error instanceof WorkerError &&
        error.code === 'AUDIO_RESET_NOT_IMPLEMENTED'
          ? 'MEDIA_NOT_IMPLEMENTED'
          : 'MEDIA_FAILED',
      );
    }
  }
  onClipboard(listener: (state: ClipboardState) => void): () => void {
    this.events.on('clipboard', listener);
    return () => {
      this.events.off('clipboard', listener);
    };
  }
  readClipboardText(revision: bigint): Promise<ClipboardReadResult> {
    if (this.closing)
      return Promise.resolve({ status: 'unavailable', text: Buffer.alloc(0) });
    return this.worker.readClipboardText(revision);
  }
  writeClipboardText(text: Buffer): Promise<ClipboardStatus> {
    return this.closing
      ? Promise.resolve('unavailable')
      : this.worker.writeClipboardText(text);
  }
  revokeClipboardText(): Promise<ClipboardStatus> {
    return this.closing
      ? Promise.resolve('unavailable')
      : this.worker.revokeClipboardText();
  }
  onCursor(listener: (cursor: CursorState) => void): () => void {
    this.events.on('cursor', listener);
    return () => {
      this.events.off('cursor', listener);
    };
  }
  decideCertificate(prompt: CertificatePrompt, accept: boolean): Promise<void> {
    return this.worker.decideCertificate(prompt, accept);
  }
  onDisplay(listener: (state: DisplayState) => void): () => void {
    this.events.on('display', listener);
    return () => {
      this.events.off('display', listener);
    };
  }
  onTouch(listener: (state: TouchState) => void): () => void {
    this.events.on('touch', listener);
    return () => {
      this.events.off('touch', listener);
    };
  }
  async resizeDisplay(
    width: number,
    height: number,
  ): Promise<DisplayResizeResult> {
    try {
      if (this.closing) return 'disconnected';
      return await this.worker.resizeDisplay(width, height);
    } catch (error) {
      if (
        error instanceof WorkerError &&
        error.code === 'DISPLAY_NOT_IMPLEMENTED'
      )
        throw new SessionError('DISPLAY_NOT_IMPLEMENTED');
      throw new SessionError('DISPLAY_FAILED');
    }
  }
  async captureFrame(
    sinceRevision: bigint,
    options?: CaptureOptions,
  ): Promise<CapturedFrame | undefined> {
    try {
      if (this.closing) return undefined;
      return await this.worker.captureFrame(sinceRevision, options);
    } catch (error) {
      if (
        error instanceof WorkerError &&
        ['MEDIA_NOT_CONNECTED', 'MEDIA_BUSY'].includes(error.code)
      )
        return undefined;
      throw new SessionError(
        error instanceof WorkerError && error.code === 'MEDIA_NOT_IMPLEMENTED'
          ? 'MEDIA_NOT_IMPLEMENTED'
          : 'MEDIA_FAILED',
      );
    }
  }
  supportsCodec(codec: MediaCodec): boolean | undefined {
    const build = this.worker.build;
    return build
      ? codec === 'h264'
        ? build.capabilities.h264Capture
        : build.capabilities.jpegCapture
      : undefined;
  }
  async sendInput(event: InputEvent): Promise<void> {
    try {
      if (this.closing) throw new SessionError('INPUT_NOT_CONNECTED');
      await this.worker.sendInput(event);
    } catch (error) {
      if (error instanceof SessionError) throw error;
      if (
        event.type === 'touch' &&
        error instanceof WorkerError &&
        error.code === 'INPUT_QUEUE_FULL'
      )
        throw new SessionError('INPUT_QUEUE_FULL');
      if (
        error instanceof WorkerError &&
        ['TOUCH_UNAVAILABLE', 'TOUCH_INVALID_TRANSITION'].includes(error.code)
      )
        throw new SessionError(
          error.code === 'TOUCH_UNAVAILABLE'
            ? 'INPUT_TOUCH_UNAVAILABLE'
            : 'INPUT_TOUCH_INVALID_TRANSITION',
        );
      throw new SessionError(
        error instanceof WorkerError &&
        error.code === 'INPUT_DISPLAY_TRANSITION'
          ? 'INPUT_DISPLAY_TRANSITION'
          : error instanceof WorkerError &&
              error.code === 'INPUT_NOT_IMPLEMENTED'
            ? 'INPUT_NOT_IMPLEMENTED'
            : 'INPUT_FAILED',
      );
    }
  }
  pipelineStats(): Promise<PipelineStats> {
    return this.worker.pipelineStats();
  }
}

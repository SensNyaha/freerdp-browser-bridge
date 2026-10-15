import { EventEmitter } from 'node:events';
import type { CursorState } from '@freerdp-bridge/protocol';
import { WorkerProcess, WorkerError, type WorkerOptions } from './index.js';
import {
  SessionError,
  type SessionErrorCode,
  type SessionWorker,
} from './session-manager.js';
import type { SessionCreate } from '@freerdp-bridge/config';
import type { SessionAudioEvent } from './session-audio.js';
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
} from '@freerdp-bridge/protocol';

/** Explicit experimental native backend; full usable-desktop capability remains separately gated. */
export class NativeSessionWorker implements SessionWorker {
  private readonly worker: WorkerProcess;
  private readonly events = new EventEmitter();
  private startup: Promise<void> | undefined;
  private closing = false;
  /** Host-side child identity for lifecycle/resource probes; not a liveness guarantee. */
  get pid(): number | undefined {
    return this.worker.pid;
  }
  constructor(options: WorkerOptions) {
    this.worker = this.createWorkerProcess(options);
    this.worker.on('rdp-state', (event: NativeConnectionState) => {
      if (this.closing) return;
      if (event.error !== 'NONE') this.events.emit('failure', event.error);
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
    this.worker.on('failure', () => {
      if (!this.closing) this.events.emit('failure', 'WORKER_FAILED');
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
      if (config.clipboard && config.clipboard.mode !== 'off')
        throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
      if (
        config.media?.microphone &&
        !['off', 'pcm', 'opus'].includes(config.media.microphone)
      )
        throw new SessionError('RDP_SETTING_NOT_IMPLEMENTED');
      signal.addEventListener('abort', abort, { once: true });
      const build = await this.worker.start();
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

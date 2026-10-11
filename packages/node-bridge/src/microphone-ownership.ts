import {
  encodeMicrophoneState,
  validateMicrophoneStateProgress,
  encodeMicrophoneResetResult,
  type MicrophoneState,
  type MicrophonePcmPacket,
  type MicrophoneResult,
  type MicrophoneResetResult,
} from '@freerdp-bridge/protocol';
import { MicrophoneIngress } from './microphone-ingress.js';

export interface MicrophoneOwnershipBackend {
  source(): MicrophoneState | undefined;
  onSource(listener: (state: MicrophoneState) => void): () => void;
  submit(packet: MicrophonePcmPacket): Promise<MicrophoneResult>;
  reset(epoch: bigint): Promise<MicrophoneResetResult>;
  /** Host owns process retirement; this owner stays failed even if termination throws/hangs. */
  terminate(): void | Promise<void>;
}
type Owner = { ingress: MicrophoneIngress; revoked: boolean };

/** Preparatory exclusive capture owner. No socket or browser permission activation. */
export class MicrophoneOwnership {
  private owner: Owner | undefined;
  private retiring: { owner: Owner; promise: Promise<boolean> } | undefined;
  private closed = false;
  private failed = false;
  private terminated = false;

  constructor(
    private readonly backend: MicrophoneOwnershipBackend,
    private readonly timeoutMs = 3000,
  ) {
    if (
      !backend ||
      ['source', 'onSource', 'submit', 'reset', 'terminate'].some(
        (key) =>
          typeof backend[key as keyof MicrophoneOwnershipBackend] !==
          'function',
      ) ||
      !Number.isInteger(timeoutMs) ||
      timeoutMs < 20 ||
      timeoutMs > 5000
    )
      throw new Error('Invalid microphone ownership backend');
  }
  get status(): 'idle' | 'active' | 'retiring' | 'closed' | 'failed' {
    if (this.failed) return 'failed';
    if (this.retiring) return 'retiring';
    if (this.closed) return 'closed';
    return this.owner ? 'active' : 'idle';
  }
  acquire(authorized: () => boolean): MicrophoneIngress | undefined {
    if (typeof authorized !== 'function')
      throw new Error('Invalid microphone grant');
    if (this.closed || this.failed || this.owner || this.retiring)
      return undefined;
    const owner: Owner = {
      revoked: false,
      ingress: new MicrophoneIngress({
        authorized: () =>
          this.owner === owner &&
          !owner.revoked &&
          !this.closed &&
          !this.failed &&
          authorized(),
        source: () => this.backend.source(),
        submit: (packet) => this.backend.submit(packet),
      }),
    };
    this.owner = owner;
    return owner.ingress;
  }
  /** Revoke synchronously; do not grant a replacement until true completion. */
  release(ingress: MicrophoneIngress): Promise<boolean> {
    if (this.retiring?.owner.ingress === ingress) return this.retiring.promise;
    const owner = this.owner;
    if (!owner || owner.ingress !== ingress) return Promise.resolve(false);
    owner.revoked = true;
    let finish!: (safe: boolean) => void;
    const promise = new Promise<boolean>((resolve) => {
      finish = resolve;
    });
    const reservation = { owner, promise };
    this.retiring = reservation;
    void this.retire(owner).then((safe) => {
      if (this.owner === owner) this.owner = undefined;
      if (this.retiring === reservation) this.retiring = undefined;
      finish(safe);
    });
    return promise;
  }
  close(): Promise<boolean> {
    this.closed = true;
    if (this.retiring) return this.retiring.promise;
    if (this.owner) return this.release(this.owner.ingress);
    return Promise.resolve(!this.failed);
  }
  private fault() {
    this.failed = true;
    if (this.terminated) return;
    this.terminated = true;
    try {
      void Promise.resolve(this.backend.terminate()).catch(() => {});
    } catch {
      /* Host diagnostics must not escape into capture replies. */
    }
  }
  private async retire(owner: Owner): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    let safe = false;
    const live = () => {
      if (cancelled || this.failed)
        throw new Error('Microphone retirement failed');
    };
    try {
      const expired = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Microphone retirement failed')),
          this.timeoutMs,
        );
      });
      await Promise.race([
        (async () => {
          await owner.ingress.close();
          live();
          const epoch = owner.ingress.drainEpoch;
          if (epoch === undefined) return;
          let previous: MicrophoneState | undefined;
          const snapshot = (value: MicrophoneState | undefined) => {
            if (!value) throw new Error('Microphone retirement failed');
            const { enabled, availability, revision, epoch, timestampUs } =
              value;
            const state = {
              enabled,
              availability,
              revision,
              epoch,
              timestampUs,
            };
            encodeMicrophoneState(state);
            if (previous?.revision === revision) {
              if (
                previous.enabled !== enabled ||
                previous.availability !== availability ||
                previous.epoch !== epoch ||
                previous.timestampUs !== timestampUs
              )
                throw new Error('Microphone retirement failed');
            } else validateMicrophoneStateProgress(previous, state);
            previous = state;
            return state;
          };
          const initial = snapshot(this.backend.source());
          if (
            initial.epoch > epoch &&
            initial.enabled &&
            initial.availability !== 'closed'
          )
            return; // Server reopen already cleared the old source.
          if (
            initial.epoch !== epoch ||
            !initial.enabled ||
            initial.availability !== 'ready'
          )
            throw new Error('Microphone retirement failed');
          let published!: () => void;
          let invalid!: (error: Error) => void;
          let invalidSource = false;
          const fresh = new Promise<void>((resolve, reject) => {
            published = resolve;
            invalid = reject;
          });
          void fresh.catch(() => {}); // A synchronous listener may refuse before reset settles.
          const observe = (value: MicrophoneState) => {
            if (cancelled) return;
            try {
              const state = snapshot(value);
              if (!state.enabled || state.availability === 'closed')
                throw new Error('Microphone retirement failed');
              if (state.epoch > epoch) published();
            } catch {
              invalidSource = true;
              invalid(new Error('Microphone retirement failed'));
            }
          };
          unsubscribe = this.backend.onSource(observe);
          if (typeof unsubscribe !== 'function')
            throw new Error('Microphone retirement failed');
          // Subscription precedes reset, and the snapshot covers an event already delivered.
          observe(this.backend.source()!);
          live();
          if (invalidSource) throw new Error('Microphone retirement failed');
          const result = await this.backend.reset(epoch);
          live();
          encodeMicrophoneResetResult(result);
          const actual = snapshot(this.backend.source());
          if (
            invalidSource ||
            !actual.enabled ||
            actual.availability === 'closed'
          )
            throw new Error('Microphone retirement failed');
          if (actual.epoch > epoch) return;
          if (result !== 'scheduled')
            throw new Error('Microphone retirement failed');
          await fresh;
          live();
          // No earlier event can override a subsequent invalid or regressed snapshot.
          if (invalidSource || snapshot(this.backend.source()).epoch <= epoch)
            throw new Error('Microphone retirement failed');
        })(),
        expired,
      ]);
      safe = true;
    } catch {
      this.fault();
    } finally {
      clearTimeout(timer);
      cancelled = true;
      try {
        unsubscribe?.();
      } catch {
        safe = false;
        this.fault();
      }
    }
    return safe;
  }
}

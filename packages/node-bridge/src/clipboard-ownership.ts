import {
  validateClipboardState,
  validateClipboardText,
  validateClipboardHtmlItem,
  validateClipboardHtmlWrite,
  clipboardStatuses,
  type ClipboardState,
  type ClipboardStatus,
  type ClipboardHtmlItem,
} from '@freerdp-bridge/protocol';
import type { ClipboardReadResult, ClipboardHtmlReadResult } from './index.js';

export interface ClipboardOwnershipBackend {
  source(): ClipboardState | undefined;
  /** Returns an owned buffer; this owner either transfers it or wipes it. */
  read(revision: bigint): Promise<ClipboardReadResult>;
  /** Must copy borrowed text before returning, as WorkerProcess does. */
  write(text: Buffer): Promise<ClipboardStatus>;
  readHtml?(revision: bigint): Promise<ClipboardHtmlReadResult>;
  writeHtml?(item: ClipboardHtmlItem): Promise<ClipboardStatus>;
  revoke(): Promise<ClipboardStatus>;
  /** Host joins process retirement. Every backend operation has a finite deadline. */
  terminate(): void | Promise<void>;
}
export interface ClipboardGrant {
  read(revision: bigint): Promise<ClipboardReadResult>;
  write(text: Buffer): Promise<ClipboardStatus>;
  readHtml(revision: bigint): Promise<ClipboardHtmlReadResult>;
  writeHtml(item: ClipboardHtmlItem): Promise<ClipboardStatus>;
}
type Owner = {
  grant: ClipboardGrant;
  authorized: () => boolean;
  source: ClipboardState;
  revoked: boolean;
  dirty: boolean;
  flight?: Promise<void>;
};
const negative = (status: ClipboardStatus): ClipboardReadResult => ({
  status,
  text: Buffer.alloc(0),
});
type ItemResult = ClipboardReadResult & { item?: ClipboardHtmlItem };
/** Clears owned content only; never metadata or diagnostics. Also used for late results. */
export function wipeClipboardHtml(item: ClipboardHtmlItem | undefined): void {
  try {
    if (Buffer.isBuffer(item?.body)) item.body.fill(0);
  } catch {
    /* Backend fault. */
  }
  try {
    if (Buffer.isBuffer(item?.text)) item.text.fill(0);
  } catch {
    /* Backend fault. */
  }
}
function itemView(item: ClipboardHtmlItem): ClipboardHtmlItem {
  return {
    body: item.body,
    fragmentOffset: item.fragmentOffset,
    fragmentBytes: item.fragmentBytes,
    selectionOffset: item.selectionOffset,
    selectionBytes: item.selectionBytes,
    context: item.context,
    selection: item.selection,
    ...(item.text !== undefined ? { text: item.text } : {}),
  };
}

/** Exclusive controller authority; no automatic OS clipboard access or content queue. */
export class ClipboardOwnership {
  private owner: Owner | undefined;
  private retiring: { owner: Owner; promise: Promise<boolean> } | undefined;
  private closed = false;
  private failed = false;
  private checking = false;
  constructor(
    private readonly backend: ClipboardOwnershipBackend,
    private readonly retirementMs?: number,
  ) {
    if (
      !backend ||
      ['source', 'read', 'write', 'revoke', 'terminate'].some(
        (key) =>
          typeof backend[key as keyof ClipboardOwnershipBackend] !== 'function',
      ) ||
      (retirementMs !== undefined &&
        (!Number.isInteger(retirementMs) ||
          retirementMs < 20 ||
          retirementMs > 15000))
    )
      throw new Error('Invalid clipboard ownership backend');
  }
  get status(): 'idle' | 'active' | 'retiring' | 'closed' | 'failed' {
    if (this.failed) return 'failed';
    if (this.retiring) return 'retiring';
    if (this.closed) return 'closed';
    return this.owner ? 'active' : 'idle';
  }
  acquire(authorized: () => boolean): ClipboardGrant | undefined {
    if (typeof authorized !== 'function')
      throw new Error('Invalid clipboard grant');
    if (
      this.checking ||
      this.closed ||
      this.failed ||
      this.owner ||
      this.retiring
    )
      return;
    const source = this.snapshot();
    if (!source?.ready || source.localAccepted || source.localPending) return;
    if (this.closed || this.failed || this.owner || this.retiring) return;
    const owner: Owner = {
      authorized,
      source,
      revoked: false,
      dirty: false,
      grant: Object.freeze({
        read: (revision: bigint) => this.transfer(owner, revision),
        write: async (text: Buffer) =>
          (await this.transfer(owner, 0n, text)).status,
        readHtml: async (revision: bigint) => {
          const result = await this.transfer(owner, revision, undefined, true);
          return {
            status: result.status,
            ...(result.item ? { item: result.item } : {}),
          };
        },
        writeHtml: async (item: ClipboardHtmlItem) =>
          (await this.transfer(owner, 0n, item, true)).status,
      }),
    };
    this.owner = owner;
    return owner.grant;
  }
  /** Revoke JS authority now; replacement waits for drain and native no-format ACK. */
  release(grant: ClipboardGrant): Promise<boolean> {
    if (this.retiring?.owner.grant === grant) return this.retiring.promise;
    const owner = this.owner;
    if (!owner || owner.grant !== grant) return Promise.resolve(false);
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
    return this.owner
      ? this.release(this.owner.grant)
      : Promise.resolve(!this.failed);
  }
  private fault(): void {
    if (this.failed) return;
    this.failed = true;
    if (this.owner) this.owner.revoked = true;
    try {
      void Promise.resolve(this.backend.terminate()).catch(() => {});
    } catch {
      /* Trusted host failures never escape into clipboard results. */
    }
  }
  private snapshot(owner?: Owner): ClipboardState | undefined {
    if (this.checking) return;
    this.checking = true;
    try {
      const value = this.backend.source();
      if (!value) {
        if (owner) this.fault();
        return;
      }
      validateClipboardState(value);
      const {
        generation,
        revision,
        maximum,
        ready,
        toServer,
        fromServer,
        remoteText,
        localAccepted,
        localPending,
        remotePending,
      } = value;
      const state = {
        generation,
        revision,
        maximum,
        ready,
        toServer,
        fromServer,
        remoteText,
        localAccepted,
        localPending,
        remotePending,
        ...(value.html
          ? {
              html: true as const,
              remoteHtml: value.remoteHtml!,
              localHtmlAccepted: value.localHtmlAccepted!,
            }
          : {}),
      };
      validateClipboardState(state);
      if (state.html && (!this.backend.readHtml || !this.backend.writeHtml))
        throw new Error();
      if (owner) {
        const old = owner.source;
        if (
          state.generation !== old.generation ||
          state.maximum !== old.maximum ||
          state.toServer !== old.toServer ||
          state.fromServer !== old.fromServer ||
          state.html !== old.html ||
          state.revision < old.revision ||
          !state.ready
        )
          throw new Error();
        owner.source = state;
      }
      return state;
    } catch {
      this.fault();
      return;
    } finally {
      this.checking = false;
    }
  }
  private live(owner: Owner): boolean {
    const current = () =>
      this.owner === owner && !owner.revoked && !this.closed && !this.failed;
    if (!current() || this.checking) return false;
    this.checking = true;
    try {
      return owner.authorized() === true && current();
    } catch {
      this.fault();
      return false;
    } finally {
      this.checking = false;
    }
  }
  private async transfer(
    owner: Owner,
    revision: bigint,
    input?: Buffer | ClipboardHtmlItem,
    html = false,
  ): Promise<ItemResult> {
    if (!this.live(owner)) return negative('unavailable');
    if (owner.flight) return negative('busy');
    const source = this.snapshot(owner);
    if (!source?.ready || !this.live(owner)) return negative('unavailable');
    if (html && !source.html) return negative('unavailable');
    const writing = input !== undefined;
    if (writing) {
      if (!source.toServer || source.localPending) return negative('refused');
      try {
        if (html)
          validateClipboardHtmlWrite(
            input as ClipboardHtmlItem,
            source.maximum,
          );
        else validateClipboardText(input as Buffer, source.maximum);
      } catch {
        return negative('invalid');
      }
    } else {
      if (
        typeof revision !== 'bigint' ||
        revision < 1n ||
        revision > 0xffffffffffffffffn
      )
        return negative('invalid');
      if (revision !== source.revision) return negative('stale');
      if (
        !source.fromServer ||
        (html ? !source.remoteHtml : !source.remoteText) ||
        source.remotePending
      )
        return negative('refused');
    }
    let drained!: () => void;
    const flight = new Promise<void>((resolve) => {
      drained = resolve;
    });
    owner.flight = flight;
    let result: ItemResult | undefined;
    let returnedHtml: ClipboardHtmlItem | undefined;
    let transferred = false;
    try {
      if (writing) {
        owner.dirty = true; // Includes uncertain or refused writes; no optimistic transfer.
        result = negative(
          await (html
            ? this.backend.writeHtml!(input as ClipboardHtmlItem)
            : this.backend.write(input as Buffer)),
        );
      } else if (html) {
        const reply = await this.backend.readHtml!(revision);
        returnedHtml = reply.item;
        result = {
          ...negative(reply.status),
          ...(returnedHtml !== undefined
            ? { item: itemView(returnedHtml) }
            : {}),
        };
      } else {
        const reply = await this.backend.read(revision);
        result = { status: reply.status, text: reply.text };
      }
      if (
        !result ||
        !clipboardStatuses.includes(result.status) ||
        !Buffer.isBuffer(result.text) ||
        ((writing || result.status !== 'accepted') && result.text.length) ||
        ((writing || result.status !== 'accepted') && result.item !== undefined)
      )
        throw new Error();
      if (!writing && result.status === 'accepted') {
        if (html) validateClipboardHtmlItem(result.item!, source.maximum);
        else validateClipboardText(result.text, source.maximum);
      }
      if (!this.live(owner)) return negative('disconnected');
      const current = this.snapshot(owner);
      if (!current?.ready || !this.live(owner)) return negative('disconnected');
      if (
        writing &&
        result.status === 'accepted' &&
        (!current.localAccepted ||
          current.localPending ||
          (html
            ? !current.localHtmlAccepted
            : current.localHtmlAccepted === true))
      )
        throw new Error();
      if (!writing && current.revision !== revision) return negative('stale');
      transferred = true;
      return result;
    } catch {
      this.fault();
      return negative('disconnected');
    } finally {
      if (!transferred && Buffer.isBuffer(result?.text)) result.text.fill(0);
      if (!transferred) wipeClipboardHtml(returnedHtml);
      if (owner.flight === flight) delete owner.flight;
      drained();
    }
  }
  private async retire(owner: Owner): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;
    let cancelled = false;
    try {
      const live = () => {
        if (cancelled || this.failed) throw new Error();
      };
      await Promise.race([
        (async () => {
          await owner.flight;
          live();
          const source = this.snapshot(owner);
          if (!source?.ready) throw new Error();
          if (owner.dirty) {
            if ((await this.backend.revoke()) !== 'accepted') throw new Error();
            live();
          }
          const current = this.snapshot(owner);
          if (!current?.ready || current.localAccepted || current.localPending)
            throw new Error();
          live();
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error()),
            this.retirementMs ?? (owner.source.html ? 20000 : 15000),
          );
        }),
      ]);
      return true;
    } catch {
      this.fault();
      return false;
    } finally {
      cancelled = true;
      if (timer) clearTimeout(timer);
    }
  }
}

import {
  encodeClipboardChunk,
  decodeClipboardChunk,
  validateClipboardText,
  validateClipboardHtmlItem,
  validateClipboardHtmlWrite,
  encodeClipboardHtmlItem,
  decodeClipboardHtmlItem,
  CLIPBOARD_HTML_ITEM_METADATA_BYTES,
  clipboardStatuses,
  CLIPBOARD_CHUNK_MAX_BYTES,
  CLIPBOARD_CHUNK_WINDOW,
  type ClipboardStatus,
  type ClipboardHtmlItem,
} from '@freerdp-bridge/protocol';
import type { ClipboardReadResult, ClipboardHtmlReadResult } from './index.js';
import { wipeClipboardHtml } from './clipboard-ownership.js';
import type { SessionClipboardSnapshot } from './session-manager.js';

export interface ClipboardTransferBackend {
  snapshot(): SessionClipboardSnapshot;
  start(): boolean;
  read(revision: bigint): Promise<ClipboardReadResult>;
  /** Copies borrowed text synchronously, before returning its promise. */
  write(text: Buffer): Promise<ClipboardStatus>;
  readHtml?(revision: bigint): Promise<ClipboardHtmlReadResult>;
  writeHtml?(item: ClipboardHtmlItem): Promise<ClipboardStatus>;
}
export interface ClipboardTransferTransport {
  control(type: string, data: Record<string, unknown>): void;
  /** Borrows one bounded record until settlement; no retry. */
  chunk(bytes: Buffer): Promise<void>;
  close(): void;
  /** Rearm one host timer at nextDeadline; may be called after async completion. */
  changed(): void;
}
type Transfer = {
  seq: number;
  operation: 'read' | 'set';
  format: 'text' | 'html';
  htmlSelected: boolean;
  generation: bigint;
  revision: bigint;
  maximum: number;
  total: number;
  offset: number;
  creditEnd: number;
  whole: number;
  progress: number;
  nextAt: number;
  stage: 'upload' | 'native' | 'download';
  buffer?: Buffer;
  awaitingAck: boolean;
  pumping: boolean;
  complete: boolean;
};
const wholeMs = 60000,
  progressMs = 2000,
  nativeMs = 8000,
  paceMs = 64;
const windowBytes = CLIPBOARD_CHUNK_MAX_BYTES * CLIPBOARD_CHUNK_WINDOW;
const u32 = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

/** One RWC1 item, fixed credit and nonrenewing deadlines. No OS clipboard access. */
export class ClipboardTransfer {
  private active: Transfer | undefined;
  private closed = false;
  private lastTime: number | undefined;
  constructor(
    private readonly backend: ClipboardTransferBackend,
    private readonly transport: ClipboardTransferTransport,
    private readonly clock: () => number = () => performance.now(),
  ) {}
  get busy(): boolean {
    return this.active !== undefined;
  }
  get nextDeadline(): number | undefined {
    const a = this.active;
    if (!a || this.closed) return;
    return Math.min(
      a.whole,
      a.progress,
      a.stage === 'download' && !a.awaitingAck && !a.pumping
        ? a.nextAt
        : Infinity,
    );
  }
  private fail(): void {
    if (this.closed) return;
    this.dispose();
    try {
      this.transport.close();
    } catch {
      /* Host cleanup cannot expose diagnostics. */
    }
  }
  dispose(): void {
    this.closed = true;
    this.active?.buffer?.fill(0);
    this.active = undefined;
  }
  private now(): number | undefined {
    if (this.closed) return;
    try {
      const t = this.clock(),
        a = this.active;
      if (
        !Number.isFinite(t) ||
        t < 0 ||
        t > Number.MAX_SAFE_INTEGER - wholeMs ||
        (this.lastTime !== undefined && t < this.lastTime) ||
        (a && (t >= a.whole || t >= a.progress))
      )
        throw new Error();
      this.lastTime = t;
      return t;
    } catch {
      this.fail();
      return;
    }
  }
  private changed(): void {
    try {
      this.transport.changed();
    } catch {
      this.fail();
    }
  }
  private control(type: string, data: Record<string, unknown>): void {
    if (this.closed) return;
    try {
      this.transport.control(type, data);
    } catch {
      this.fail();
    }
  }
  private authority(a: Transfer): boolean {
    const snapshot = this.backend.snapshot(),
      source = snapshot.state;
    return Boolean(
      snapshot.granted &&
        !snapshot.retiring &&
        source?.ready &&
        source.generation === a.generation &&
        source.maximum === a.maximum &&
        Boolean(source.html) === a.htmlSelected,
    );
  }
  private admit(
    seq: number,
    generation: bigint,
    operation: 'read' | 'set',
    revision: bigint,
    total: number,
    format: 'text' | 'html' = 'text',
  ): Transfer | undefined {
    const time = this.now();
    if (time === undefined) return;
    if (
      !u32(seq) ||
      typeof generation !== 'bigint' ||
      generation < 1n ||
      generation > 0xffffffffffffffffn ||
      typeof revision !== 'bigint' ||
      revision < (operation === 'read' ? 1n : 0n) ||
      revision > 0xffffffffffffffffn ||
      !Number.isInteger(total) ||
      total < 0 ||
      total > 16777216
    ) {
      this.fail();
      return;
    }
    const reject = (status: ClipboardStatus) =>
      this.control(
        (format === 'html' ? 'clipboard.html.' : 'clipboard.') +
          (operation === 'read' ? 'data' : 'set.result'),
        { requestSeq: seq, status, bytes: 0 },
      );
    if (this.active) {
      reject('busy');
      return;
    }
    try {
      let snapshot = this.backend.snapshot();
      if (
        format === 'html' &&
        (!snapshot.state?.html ||
          typeof this.backend.readHtml !== 'function' ||
          typeof this.backend.writeHtml !== 'function')
      ) {
        reject('unavailable');
        return;
      }
      if (!snapshot.granted && !snapshot.retiring) {
        this.backend.start();
        snapshot = this.backend.snapshot();
      }
      const source = snapshot.state;
      if (!snapshot.granted || snapshot.retiring || !source?.ready) {
        reject('unavailable');
        return;
      }
      if (
        format === 'html' &&
        (!source.html ||
          typeof this.backend.readHtml !== 'function' ||
          typeof this.backend.writeHtml !== 'function')
      ) {
        reject('unavailable');
        return;
      }
      if (
        format === 'html' &&
        operation === 'set' &&
        total < CLIPBOARD_HTML_ITEM_METADATA_BYTES
      ) {
        reject('invalid');
        return;
      }
      if (
        source.generation !== generation ||
        (operation === 'read' && source.revision !== revision)
      ) {
        reject('stale');
        return;
      }
      if (
        operation === 'read'
          ? !source.fromServer ||
            (format === 'html' ? !source.remoteHtml : !source.remoteText) ||
            source.remotePending
          : !source.toServer ||
            source.localPending ||
            total >
              Math.min(
                16777216,
                source.maximum +
                  (format === 'html' ? CLIPBOARD_HTML_ITEM_METADATA_BYTES : 0),
              )
      ) {
        reject('refused');
        return;
      }
      const a: Transfer = {
        seq,
        operation,
        format,
        htmlSelected: source.html === true,
        generation,
        revision,
        maximum: source.maximum,
        total,
        offset: 0,
        creditEnd: Math.min(total, windowBytes),
        whole: time + wholeMs,
        progress:
          time +
          (operation === 'read'
            ? format === 'html'
              ? 13000
              : nativeMs
            : progressMs),
        nextAt: time,
        stage: operation === 'read' ? 'native' : 'upload',
        awaitingAck: false,
        pumping: false,
        complete: false,
      };
      this.active = a;
      return a;
    } catch {
      this.fail();
      return;
    }
  }
  private event(a: Transfer, suffix: string): string {
    return (a.format === 'html' ? 'clipboard.html.' : 'clipboard.') + suffix;
  }
  set(
    seq: number,
    generation: bigint,
    total: number,
    format: 'text' | 'html' = 'text',
  ): void {
    const a = this.admit(seq, generation, 'set', 0n, total, format);
    if (!a) return;
    try {
      a.buffer = Buffer.alloc(total);
      this.control(this.event(a, 'set.ready'), {
        requestSeq: seq,
        bytes: total,
        creditEnd: a.creditEnd,
      });
      if (!total) this.write(a);
    } catch {
      this.fail();
    }
    this.changed();
  }
  read(
    seq: number,
    generation: bigint,
    revision: bigint,
    format: 'text' | 'html' = 'text',
  ): void {
    const a = this.admit(seq, generation, 'read', revision, 0, format);
    if (!a) return;
    void (async () => {
      let bytes: Buffer | undefined;
      let rich: ClipboardHtmlItem | undefined;
      try {
        let status: ClipboardStatus;
        if (format === 'html') {
          const result = await this.backend.readHtml!(revision);
          status = result.status;
          rich = result.item;
          bytes = Buffer.alloc(0);
        } else {
          const result = await this.backend.read(revision);
          status = result.status;
          bytes = result.text;
        }
        if (this.now() === undefined || this.active !== a) return;
        if (
          !this.authority(a) ||
          !clipboardStatuses.includes(status) ||
          !Buffer.isBuffer(bytes) ||
          (status !== 'accepted' && (bytes.length || rich !== undefined))
        )
          throw new Error();
        if (status !== 'accepted') {
          this.finish(a, status);
          return;
        }
        if (this.backend.snapshot().state?.revision !== a.revision) {
          this.finish(a, 'stale');
          return;
        }
        if (format === 'html') {
          validateClipboardHtmlItem(rich!, a.maximum);
          bytes = encodeClipboardHtmlItem(rich!, a.maximum);
          wipeClipboardHtml(rich);
          rich = undefined;
        } else validateClipboardText(bytes, a.maximum);
        a.buffer = bytes;
        bytes = undefined;
        a.total = a.buffer.length;
        a.creditEnd = Math.min(a.total, windowBytes);
        a.stage = 'download';
        a.awaitingAck = true;
        a.nextAt = this.lastTime!;
        a.progress = this.lastTime! + progressMs;
        this.control(this.event(a, 'data'), {
          requestSeq: a.seq,
          status: 'accepted',
          bytes: a.total,
          generation: a.generation.toString(),
          revision: a.revision.toString(),
          creditEnd: a.creditEnd,
        });
        this.pump(a);
      } catch {
        this.fail();
      } finally {
        if (Buffer.isBuffer(bytes)) bytes.fill(0);
        wipeClipboardHtml(rich);
        this.changed();
      }
    })();
    this.changed();
  }
  receive(record: Buffer): void {
    if (this.now() === undefined) return;
    const a = this.active;
    try {
      const chunk = decodeClipboardChunk(record);
      if (
        !a ||
        a.stage !== 'upload' ||
        !a.buffer ||
        !this.authority(a) ||
        chunk.requestSeq !== a.seq ||
        chunk.offset !== a.offset ||
        chunk.bytes.length !==
          Math.min(CLIPBOARD_CHUNK_MAX_BYTES, a.total - a.offset) ||
        a.offset + chunk.bytes.length > a.creditEnd
      )
        throw new Error();
      chunk.bytes.copy(a.buffer, a.offset);
      a.offset += chunk.bytes.length;
      if (a.offset === a.total) this.write(a);
      else if (a.offset === a.creditEnd) {
        a.creditEnd = Math.min(a.total, a.offset + windowBytes);
        a.progress = this.lastTime! + progressMs;
        this.control(this.event(a, 'set.ack'), {
          requestSeq: a.seq,
          offset: a.offset,
          creditEnd: a.creditEnd,
        });
      }
    } catch {
      this.fail();
    }
    this.changed();
  }
  private write(a: Transfer): void {
    if (this.active !== a || this.closed || !a.buffer) return;
    try {
      if (a.format === 'html')
        validateClipboardHtmlWrite(
          decodeClipboardHtmlItem(a.buffer, a.maximum),
          a.maximum,
        );
      else validateClipboardText(a.buffer, a.maximum);
      if (!this.authority(a)) throw new Error();
    } catch {
      this.finish(a, 'invalid');
      return;
    }
    a.stage = 'native';
    a.progress = this.lastTime! + nativeMs;
    let completion: Promise<ClipboardStatus>;
    try {
      completion =
        a.format === 'html'
          ? this.backend.writeHtml!(
              decodeClipboardHtmlItem(a.buffer, a.maximum),
            )
          : this.backend.write(a.buffer);
    } catch {
      this.fail();
      return;
    } finally {
      a.buffer?.fill(0);
      delete a.buffer;
    }
    void completion.then(
      (status) => {
        if (this.now() === undefined || this.active !== a) return;
        try {
          if (!this.authority(a) || !clipboardStatuses.includes(status))
            throw new Error();
          this.finish(a, status);
        } catch {
          this.fail();
        }
        this.changed();
      },
      () => this.fail(),
    );
  }
  acknowledge(seq: number, offset: number): void {
    const time = this.now();
    if (time === undefined) return;
    const a = this.active;
    try {
      if (
        !a ||
        a.stage !== 'download' ||
        !a.awaitingAck ||
        !u32(seq) ||
        !u32(offset) ||
        seq !== a.seq ||
        offset !== a.creditEnd ||
        a.offset !== a.creditEnd ||
        !this.authority(a)
      )
        throw new Error();
      a.awaitingAck = false;
      a.progress = time + progressMs;
      if (offset === a.total) {
        a.complete = true;
        if (!a.pumping) this.finish(a, 'accepted');
      } else a.nextAt = Math.max(time, a.nextAt + paceMs);
    } catch {
      this.fail();
    }
    this.changed();
  }
  service(): void {
    const time = this.now(),
      a = this.active;
    if (time === undefined || !a) return;
    try {
      if (!this.authority(a)) throw new Error();
      if (
        a.stage === 'download' &&
        !a.awaitingAck &&
        !a.pumping &&
        time >= a.nextAt
      ) {
        a.creditEnd = Math.min(a.total, a.offset + windowBytes);
        a.awaitingAck = true;
        a.progress = time + progressMs;
        a.nextAt = time;
        this.pump(a);
      }
    } catch {
      this.fail();
    }
    this.changed();
  }
  private pump(a: Transfer): void {
    if (a.pumping || this.closed || this.active !== a) return;
    a.pumping = true;
    const end = a.creditEnd;
    void (async () => {
      try {
        while (!this.closed && this.active === a && a.offset < end) {
          if (this.now() === undefined) return;
          if (!a.buffer || !this.authority(a)) throw new Error();
          const next = Math.min(end, a.offset + CLIPBOARD_CHUNK_MAX_BYTES);
          const bytes = encodeClipboardChunk({
            requestSeq: a.seq,
            offset: a.offset,
            bytes: a.buffer.subarray(a.offset, next),
          });
          a.offset = next;
          try {
            await this.transport.chunk(bytes);
          } finally {
            bytes.fill(0);
          }
        }
      } catch {
        this.fail();
      } finally {
        a.pumping = false;
        if (
          !this.closed &&
          this.active === a &&
          this.now() !== undefined &&
          a.complete
        )
          this.finish(a, 'accepted');
        this.changed();
      }
    })();
  }
  private finish(a: Transfer, status: ClipboardStatus): void {
    if (this.closed || this.active !== a) return;
    this.control(
      this.event(
        a,
        a.operation === 'read'
          ? a.stage === 'download'
            ? 'data.complete'
            : 'data'
          : 'set.result',
      ),
      { requestSeq: a.seq, status, bytes: 0 },
    );
    a.buffer?.fill(0);
    delete a.buffer;
    this.active = undefined;
  }
}

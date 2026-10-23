import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';
import { ProcessSampleError } from './process-resident.js';
import type { ProcessResources } from './process-resources.js';
import {
  withProcessQueryPermit,
  type ProcessQueryPermit,
} from './process-query-gate.js';
import {
  processResourceBatchBytes,
  processResourceBatchLimit,
  processResourceBatchReceipt,
  type ProcessResourceBatchItem,
} from './process-resource-batch-codec.js';

type Admission = <T>(
  signal: AbortSignal,
  task: (permit: ProcessQueryPermit) => Promise<T>,
) => Promise<T>;
type Executor = (
  helper: string,
  pids: readonly number[],
  signal: AbortSignal,
) => Promise<ProcessResourceBatchItem[]>;
type Entry = {
  pid: number;
  signal: AbortSignal;
  permit: ProcessQueryPermit;
  startedNs: bigint;
  abort: () => void;
  decision?: 'ready' | 'cancelled' | 'expired';
  resolve: (value: ProcessResources) => void;
  reject: (error: ProcessSampleError) => void;
};
type Group = {
  helper: string;
  entries: Entry[];
  dispatched: Entry[];
  abort: AbortController;
  phase: 'collecting' | 'staging' | 'running' | 'retired';
  timer?: NodeJS.Timeout;
};

function validate(pid: number, workerPath: string, signal: AbortSignal): void {
  if (
    !Number.isInteger(pid) ||
    pid < 1 ||
    pid > 0xffffffff ||
    !(signal instanceof AbortSignal)
  )
    throw new ProcessSampleError('PROCESS_SAMPLE_INVALID');
  if (signal.aborted) throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
  if (
    typeof workerPath !== 'string' ||
    !workerPath ||
    workerPath.length > 32767
  )
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
}

async function executeBatch(
  helper: string,
  pids: readonly number[],
  signal: AbortSignal,
): Promise<ProcessResourceBatchItem[]> {
  const root = process.env.SystemRoot;
  if (process.platform !== 'win32' || !root)
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  const execution = promisify(execFile)(
    helper,
    ['--process-resources-batch', pids.join(',')],
    {
      windowsHide: true,
      timeout: 2000,
      maxBuffer: processResourceBatchBytes,
      encoding: 'utf8',
      env: { SystemRoot: root, WINDIR: root, PATH: '' },
      signal,
    },
  );
  const closed = new Promise<void>((done) =>
    execution.child.once('close', () => done()),
  );
  let result: Awaited<typeof execution>;
  try {
    result = await execution;
  } finally {
    await closed;
  }
  if (signal.aborted) throw new ProcessSampleError('PROCESS_SAMPLE_CANCELLED');
  if (result.stderr !== '')
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  return processResourceBatchReceipt(result.stdout, pids.length);
}

function validItems(
  values: ProcessResourceBatchItem[],
  count: number,
): boolean {
  if (!Array.isArray(values) || values.length !== count) return false;
  for (const item of values)
    if (
      !item ||
      !Number.isSafeInteger(item.bytes) ||
      item.bytes < 0 ||
      Object.is(item.bytes, -0) ||
      !Number.isSafeInteger(item.micros) ||
      item.micros < 0 ||
      Object.is(item.micros, -0) ||
      !Number.isInteger(item.error) ||
      item.error < 0 ||
      item.error > 0xffffffff ||
      Object.is(item.error, -0) ||
      (item.error === 0
        ? item.bytes < 1
        : item.bytes !== 0 || item.micros !== 0)
    )
      return false;
  return true;
}

/** Internal owner shared by capability-gated Windows watchdog queries. */
export class ProcessResourceBatchOwner {
  private readonly collecting = new Map<string, Group>();
  private inFlight = 0;
  private items = 0;
  private attempts = 0;
  private dispatched = 0;
  private maxBatch = 0;

  constructor(
    private readonly execute: Executor = executeBatch,
    private readonly admit: Admission = withProcessQueryPermit,
  ) {}

  snapshot() {
    return {
      collectingGroups: this.collecting.size,
      inFlightGroups: this.inFlight,
      activeItems: this.items,
      launchAttempts: this.attempts,
      dispatchedItems: this.dispatched,
      maxBatchItems: this.maxBatch,
    };
  }

  async sample(
    pid: number,
    workerPath: string,
    signal: AbortSignal,
  ): Promise<ProcessResources> {
    validate(pid, workerPath, signal);
    const startedNs = process.hrtime.bigint();
    const helper = resolve(dirname(workerPath), 'rdp-runtime-directory.exe');
    try {
      return await this.admit(signal, (permit) =>
        this.enqueue(helper, pid, signal, startedNs, permit),
      );
    } catch {
      throw new ProcessSampleError(
        signal.aborted
          ? 'PROCESS_SAMPLE_CANCELLED'
          : 'PROCESS_SAMPLE_UNAVAILABLE',
      );
    }
  }

  private enqueue(
    helper: string,
    pid: number,
    signal: AbortSignal,
    startedNs: bigint,
    permit: ProcessQueryPermit,
  ): Promise<ProcessResources> {
    if (this.items >= processResourceBatchLimit)
      return Promise.reject(
        new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE'),
      );
    let group = this.collecting.get(helper);
    if (!group) {
      const created: Group = {
        helper,
        entries: [],
        dispatched: [],
        abort: new AbortController(),
        phase: 'collecting',
      };
      created.timer = setTimeout(() => {
        void this.flush(created);
      }, 5);
      this.collecting.set(helper, created);
      group = created;
    }
    const owned = group;
    return new Promise((resolve, reject) => {
      const entry: Entry = {
        pid,
        signal,
        permit,
        startedNs,
        resolve,
        reject,
        abort: () => this.memberAborted(owned),
      };
      owned.entries.push(entry);
      ++this.items;
      signal.addEventListener('abort', entry.abort);
      if (signal.aborted) this.memberAborted(owned);
    });
  }

  private memberAborted(group: Group): void {
    if (group.phase === 'retired') return;
    const members =
      group.phase === 'running' ? group.dispatched : group.entries;
    if (members.length && members.every((entry) => entry.signal.aborted)) {
      group.abort.abort();
      if (group.phase === 'collecting') void this.flush(group);
    }
  }

  private async flush(group: Group): Promise<void> {
    if (group.phase !== 'collecting') return;
    group.phase = 'staging';
    clearTimeout(group.timer);
    if (this.collecting.get(group.helper) === group)
      this.collecting.delete(group.helper);
    ++this.inFlight;
    let values: ProcessResourceBatchItem[] | undefined;
    try {
      values = await group.entries[0]!.permit.invoke(
        group.abort.signal,
        async () => {
          for (const entry of group.entries) {
            entry.decision = entry.permit.beforeDispatch();
            if (entry.decision === 'ready') group.dispatched.push(entry);
          }
          group.phase = 'running';
          if (!group.dispatched.length) return [];
          this.attempts = Math.min(Number.MAX_SAFE_INTEGER, this.attempts + 1);
          this.dispatched = Math.min(
            Number.MAX_SAFE_INTEGER,
            this.dispatched + group.dispatched.length,
          );
          this.maxBatch = Math.max(this.maxBatch, group.dispatched.length);
          return this.execute(
            group.helper,
            group.dispatched.map((entry) => entry.pid),
            group.abort.signal,
          );
        },
      );
      if (!validItems(values, group.dispatched.length)) values = undefined;
    } catch {
      // Only fixed per-member errors are published; executor details are discarded.
      values = undefined;
    } finally {
      const completedNs = process.hrtime.bigint();
      --this.inFlight;
      this.items -= group.entries.length;
      group.phase = 'retired';
      for (const entry of group.entries) {
        entry.signal.removeEventListener('abort', entry.abort);
        entry.decision ??= entry.permit.beforeDispatch();
        const index = group.dispatched.indexOf(entry);
        const value = index < 0 ? undefined : values?.[index];
        if (entry.signal.aborted)
          entry.reject(new ProcessSampleError('PROCESS_SAMPLE_CANCELLED'));
        else if (!value || value.error !== 0)
          entry.reject(new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE'));
        else
          entry.resolve({
            bytes: value.bytes,
            micros: value.micros,
            startedNs: entry.startedNs,
            completedNs,
          });
      }
      group.entries.length = 0;
      group.dispatched.length = 0;
    }
  }
}

const batchOwner = new ProcessResourceBatchOwner();
export function processResourceBatchSnapshot() {
  return batchOwner.snapshot();
}
export async function windowsProcessResourceBatch(
  pid: number,
  workerPath: string,
  signal: AbortSignal,
): Promise<ProcessResources> {
  validate(pid, workerPath, signal);
  if (process.platform !== 'win32' || !process.env.SystemRoot)
    throw new ProcessSampleError('PROCESS_SAMPLE_UNAVAILABLE');
  return batchOwner.sample(pid, workerPath, signal);
}

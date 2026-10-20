type Waiter = {
  signal: AbortSignal | undefined;
  abort: () => void;
  timer: NodeJS.Timeout | undefined;
  deadline: number;
  resolve: () => void;
  reject: (error: Error) => void;
};

/** Shared admission for host query children; a permit lasts through joined close. */
export class ProcessQueryGate {
  private active = 0;
  private readonly waiting: Waiter[] = [];
  private expired = 0;
  private taskFailures = 0;
  private maxTaskMs = 0;
  private maxAdmissionMs = 0;
  private maxInvokeMs = 0;
  // At most `maximum` permit owners can await this invocation chain.
  private invocationTail: Promise<void> = Promise.resolve();

  snapshot() {
    return {
      active: this.active,
      waiting: this.waiting.length,
      expired: this.expired,
      taskFailures: this.taskFailures,
      maxTaskMs: Math.ceil(this.maxTaskMs),
      maxAdmissionMs: Math.ceil(this.maxAdmissionMs),
      maxInvokeMs: Math.ceil(this.maxInvokeMs),
    };
  }

  constructor(
    private readonly maximum = 4,
    private readonly waitingLimit = 128,
    private readonly admissionMs = 2000,
  ) {
    if (
      !Number.isSafeInteger(maximum) ||
      maximum < 1 ||
      maximum > 64 ||
      !Number.isSafeInteger(waitingLimit) ||
      waitingLimit < 1 ||
      waitingLimit > 1024 ||
      !Number.isSafeInteger(admissionMs) ||
      admissionMs < 1 ||
      admissionMs > 60000
    )
      throw new Error('INVALID_PROCESS_QUERY_OPTIONS');
  }

  async run<T>(
    signal: AbortSignal | undefined,
    task: () => Promise<T>,
  ): Promise<T> {
    const requested = performance.now();
    try {
      await this.acquire(signal);
    } catch (error) {
      this.observeAdmission(requested);
      throw error;
    }
    let started: number | undefined;
    let releaseTurn: (() => void) | undefined;
    try {
      try {
        releaseTurn = await this.invocationTurn();
      } finally {
        this.observeAdmission(requested);
      }
      if (signal?.aborted) throw new Error('PROCESS_QUERY_CANCELLED');
      if (performance.now() >= requested + this.admissionMs) {
        this.expired = Math.min(Number.MAX_SAFE_INTEGER, this.expired + 1);
        throw new Error('PROCESS_QUERY_UNAVAILABLE');
      }
      started = performance.now();
      let completion: Promise<T>;
      try {
        completion = task();
      } finally {
        // Includes synchronous child launch/setup, not the asynchronous wait.
        this.maxInvokeMs = Math.max(
          this.maxInvokeMs,
          performance.now() - started,
        );
        releaseTurn();
        releaseTurn = undefined;
      }
      return await completion;
    } catch (error) {
      if (started !== undefined)
        this.taskFailures = Math.min(
          Number.MAX_SAFE_INTEGER,
          this.taskFailures + 1,
        );
      throw error;
    } finally {
      releaseTurn?.();
      if (started !== undefined)
        this.maxTaskMs = Math.max(this.maxTaskMs, performance.now() - started);
      --this.active;
      this.drain();
    }
  }

  private observeAdmission(requested: number): void {
    this.maxAdmissionMs = Math.max(
      this.maxAdmissionMs,
      performance.now() - requested,
    );
  }

  private async invocationTurn(): Promise<() => void> {
    const preceding = this.invocationTail;
    let release!: () => void;
    this.invocationTail = new Promise<void>((done) => {
      release = done;
    });
    try {
      await preceding;
      // Start at most one synchronous helper launch per event-loop turn.
      await new Promise<void>((done) => setImmediate(done));
      return release;
    } catch (error) {
      release();
      throw error;
    }
  }

  private acquire(signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted)
      return Promise.reject(new Error('PROCESS_QUERY_CANCELLED'));
    if (this.active < this.maximum) {
      ++this.active;
      return Promise.resolve();
    }
    if (this.waiting.length >= this.waitingLimit)
      return Promise.reject(new Error('PROCESS_QUERY_UNAVAILABLE'));
    return new Promise<void>((resolve, reject) => {
      const waiter: Waiter = {
        signal,
        resolve,
        reject,
        timer: undefined,
        deadline: performance.now() + this.admissionMs,
        abort: () => this.drop(waiter, 'PROCESS_QUERY_CANCELLED'),
      };
      this.waiting.push(waiter);
      signal?.addEventListener('abort', waiter.abort, { once: true });
      waiter.timer = setTimeout(
        () => this.drop(waiter, 'PROCESS_QUERY_UNAVAILABLE'),
        this.admissionMs,
      );
    });
  }

  private detach(waiter: Waiter): void {
    if (waiter.timer) clearTimeout(waiter.timer);
    waiter.signal?.removeEventListener('abort', waiter.abort);
  }

  private drop(waiter: Waiter, code: string): void {
    const index = this.waiting.indexOf(waiter);
    if (index < 0) return;
    this.waiting.splice(index, 1);
    this.detach(waiter);
    if (code === 'PROCESS_QUERY_UNAVAILABLE')
      this.expired = Math.min(Number.MAX_SAFE_INTEGER, this.expired + 1);
    waiter.reject(new Error(code));
  }

  private drain(): void {
    while (this.active < this.maximum && this.waiting.length) {
      const waiter = this.waiting.shift()!;
      this.detach(waiter);
      if (waiter.signal?.aborted)
        waiter.reject(new Error('PROCESS_QUERY_CANCELLED'));
      else if (performance.now() >= waiter.deadline) {
        this.expired = Math.min(Number.MAX_SAFE_INTEGER, this.expired + 1);
        waiter.reject(new Error('PROCESS_QUERY_UNAVAILABLE'));
      } else {
        ++this.active;
        waiter.resolve();
      }
    }
  }
}

// One module owner per Node execution context, shared by CPU and Windows RSS.
const processQueries = new ProcessQueryGate(16, 128, 3000);
export function processQuerySnapshot() {
  return processQueries.snapshot();
}
export function withProcessQuery<T>(
  signal: AbortSignal | undefined,
  task: () => Promise<T>,
): Promise<T> {
  return processQueries.run(signal, task);
}

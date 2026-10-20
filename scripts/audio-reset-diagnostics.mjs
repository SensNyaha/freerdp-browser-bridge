/** Lab-only scalar accounting around the existing reset API; never retains epochs or errors. */
export class AudioResetDiagnostics {
  #counts = {
    requests: 0,
    scheduled: 0,
    stale: 0,
    busy: 0,
    unavailable: 0,
    unexpected: 0,
    failures: 0,
  };
  #count(field) {
    if (this.#counts[field] < Number.MAX_SAFE_INTEGER) ++this.#counts[field];
  }
  wrap(reset) {
    return async (epoch) => {
      this.#count('requests');
      try {
        const result = await reset(epoch);
        switch (result) {
          case 'scheduled':
          case 'stale':
          case 'busy':
          case 'unavailable':
            this.#count(result);
            break;
          default:
            this.#count('unexpected');
        }
        return result;
      } catch (error) {
        this.#count('failures');
        throw error;
      }
    };
  }
  snapshot() {
    return { ...this.#counts };
  }
}

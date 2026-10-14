/** One manual creation; cancelled late replies are deleted before replacement. */
export class ConnectionOwner {
  constructor({ request, attach, detach, changed }) {
    this.request = request;
    this.attach = attach;
    this.detach = detach;
    this.changed = changed;
    this.generation = 0;
  }
  snapshot() {
    return {
      pending: Boolean(this.operation),
      connected: Boolean(this.sessionId),
      uncertain: Boolean(this.uncertain),
    };
  }
  notify() {
    this.changed?.(this.snapshot());
  }
  connect(config, options) {
    if (this.operation || this.sessionId || this.uncertain) {
      delete config.auth.password;
      return Promise.reject(new Error('Завершите текущее подключение'));
    }
    const generation = ++this.generation;
    this.operation = Promise.resolve().then(async () => {
      try {
        if (generation !== this.generation) return;
        // request must serialize synchronously before yielding (the form adapter does).
        const response = this.request('/v1/sessions', 'POST', config);
        delete config.auth.password;
        const created = await response;
        if (!/^[a-f0-9]{32}$/.test(created?.sessionId ?? '')) {
          this.uncertain = true;
          throw new Error('Не получен корректный результат создания сессии');
        }
        this.sessionId = created.sessionId;
        if (generation !== this.generation) await this.remove();
        else {
          try {
            this.attach(created, options);
          } catch {
            await this.remove();
            throw new Error('Не удалось открыть просмотр');
          }
        }
      } catch (error) {
        if (error?.uncertain) this.uncertain = true;
        throw error;
      } finally {
        delete config.auth.password;
        this.operation = undefined;
        this.notify();
      }
    });
    this.notify();
    return this.operation;
  }
  async remove() {
    if (!this.sessionId) return;
    const id = this.sessionId;
    try {
      await this.request('/v1/sessions/' + id, 'DELETE');
      if (this.sessionId === id) {
        this.sessionId = undefined;
        this.uncertain = false;
      }
    } catch {
      this.uncertain = true;
      throw new Error('Не подтверждено завершение сессии');
    }
  }
  stop() {
    ++this.generation;
    this.detach();
    if (this.operation) return this.operation;
    if (!this.sessionId) return Promise.resolve();
    this.operation = Promise.resolve()
      .then(() => this.remove())
      .finally(() => {
        this.operation = undefined;
        this.notify();
      });
    this.notify();
    return this.operation;
  }
}

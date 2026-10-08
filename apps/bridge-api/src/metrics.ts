import { Gauge, Counter, Registry } from 'prom-client';
import { type SessionManager } from '@freerdp-bridge/node';

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
  return {
    contentType: registry.contentType,
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

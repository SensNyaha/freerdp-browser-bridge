import type { SessionCreate } from '@freerdp-bridge/api/fastify';
import type { StandaloneConfig } from './config.js';

/** Exact administrator-approved destinations; network egress policy still applies. */
export function standaloneTargetAllowed(
  config: StandaloneConfig,
  session: SessionCreate,
) {
  return (
    config.targets.some(
      (target) =>
        target.host.toLowerCase() === session.target.host.toLowerCase() &&
        target.port === (session.target.port ?? 3389),
    ) &&
    !session.gateway?.enabled &&
    !session.proxy &&
    session.target.serverName === undefined
  );
}

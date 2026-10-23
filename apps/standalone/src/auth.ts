import type { IncomingMessage } from 'node:http';
import { createLocalJWKSet, jwtVerify } from 'jose';
import type { StandaloneConfig } from './config.js';

/** Only pinned public local keys; token headers cannot select a remote URL. */
export function createStandaloneAuthenticator(config: StandaloneConfig) {
  const auth = config.auth && structuredClone(config.auth);
  const keys = auth && createLocalJWKSet(auth.jwks);
  let active = 0;
  return async (request: IncomingMessage) => {
    const authorization = request.headers.authorization;
    if (
      !auth ||
      !keys ||
      request.headers.cookie !== undefined ||
      typeof authorization !== 'string' ||
      authorization.length > 8192 ||
      !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
        authorization,
      ) ||
      active >= 16
    )
      return undefined;
    active++;
    try {
      const { payload, protectedHeader } = await jwtVerify(
        authorization.slice(7),
        keys,
        {
          algorithms: ['RS256'],
          issuer: auth.issuer,
          audience: auth.audience,
          requiredClaims: ['sub', 'iat', 'exp'],
          maxTokenAge: '15m',
          clockTolerance: 5,
        },
      );
      if (
        !['JWT', 'at+jwt'].includes(protectedHeader.typ ?? '') ||
        typeof payload.sub !== 'string' ||
        payload.sub.length < 1 ||
        payload.sub.length > 256 ||
        typeof payload.scope !== 'string' ||
        payload.scope.length > 1024 ||
        !payload.scope.split(' ').includes('rdp:connect')
      )
        return undefined;
      return { id: payload.sub };
    } catch {
      return undefined;
    } finally {
      active--;
    }
  };
}

// Source CLI composition test only: substitute runtime resolution, retain the real SDK/worker.
import { registerHooks } from 'node:module';
const entry = new URL('../../apps/standalone/dist/main.js', import.meta.url)
  .href;
const api = new URL('./device-inventory-cli-api.mjs', import.meta.url).href;
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      specifier === '@freerdp-bridge/api/fastify' &&
      context.parentURL === entry
    )
      return { url: api, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

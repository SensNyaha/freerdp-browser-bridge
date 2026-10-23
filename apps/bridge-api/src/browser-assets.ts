import { fileURLToPath } from 'node:url';

/** Optional reference UI assets. Serve with the host's static-file integration. */
export const referenceBrowserDirectory = fileURLToPath(
  new URL('../browser/', import.meta.url),
);

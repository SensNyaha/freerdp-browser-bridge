# @freerdp-bridge/config

## Purpose

Session configuration schema, strict validation, performance/quality resolution
and secret redaction for FreeRDP Browser Bridge. The TypeBox schema is shared
by the server-side bridge packages.

## Installation

```sh
npm install @freerdp-bridge/config
```

## Requirements

Node.js 24 and ESM. TypeBox is installed as a regular dependency. Validation
alone requires no native worker, compiler or system FreeRDP. Use the same
product version as your other `@freerdp-bridge/*` packages.

## Usage

```js
import { validateSessionConfig, ConfigError } from '@freerdp-bridge/config';

try {
  const config = validateSessionConfig({
    target: { host: 'rdp.example.internal', port: 3389 },
    auth: { username: 'alice' },
    security: { certificatePolicy: 'strict' },
  });
  // Pass config to the authenticated session layer.
  // Obtain actual credentials privately; never log or persist config.
  void config;
} catch (error) {
  if (error instanceof ConfigError) console.error(error.code);
  else throw error;
}
```

`validateSessionConfig` rejects invalid or disallowed settings and returns a
structured clone on success. It does not coerce strings to numbers or remove
unknown fields. Limit transport bodies before parsing untrusted JSON.
`redactSecrets` is a helper, not permission to record session configuration.

## Limitations

0.4.0 accepts explicit clipboard `html: true` with a selected direction and
finite `maxItemBytes`. HTML is off by default and requires matching native
capabilities. The same item budget covers HTML and optional Unicode fallback;
schema acceptance alone cannot enable a missing channel or browser permission.

Schema acceptance is separate from authentication, destination authorization,
native capabilities and device policy. Privileged host-path/device/channel
settings remain refused by the current policy resolver. Validation does not
connect to RDP, verify certificates or start a worker.

## License

Project-owned code is MIT; see LICENSE. Dependencies retain their own licenses.

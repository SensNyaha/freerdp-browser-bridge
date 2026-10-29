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

## Image clipboard in 0.5.0

Image clipboard was introduced in the accepted 0.5.0 release. Keep JS and
native runtime versions matched when using it in later releases.

Version 0.5.0 adds explicit `clipboard.images: true`, disabled by default.
Combine it with `text: true`, an allowed direction and finite `maxItemBytes`.
The same 1-byte to 16-MiB item budget governs images and text/HTML; a native image write
must also fit its complete DIBV5 header and pixels. Validation cannot provide
native `clipboardImage`, clipboard readiness or browser OS permissions.
Published 0.4.0 does not contain this feature; use matching 0.5.0 packages.
See the
[application guide](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.5.0/docs/CLIPBOARD_SESSION.md#application-integration-for-the-developing-image-feature)
for session JSON and runtime capability requirements.

## Managed files in 0.6.0

Version 0.6.0 adds bounded session-sandbox drive descriptors and file-policy
types. Applications enable storage through their adapter or standalone
configuration; session JSON cannot choose an arbitrary host directory.

OS file-manager Ctrl+C/Ctrl+V remains deferred (`clipboardFiles: false`).
See the [file policy, routes, framework examples and tested scope](https://github.com/SensNyaha/freerdp-browser-bridge/blob/v0.6.0/docs/FILES.md).

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

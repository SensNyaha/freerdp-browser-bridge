# Security architecture

## 1. Threat model

Trust boundaries:

- browser/API caller may be authenticated but not trusted to choose host filesystem/device access;
- RDP server is remote/untrusted protocol input;
- FreeRDP/codecs are native parsers and therefore a high-impact attack surface;
- redirected devices may expose sensitive local resources;
- session credentials are secrets;
- future companion agent crosses another machine boundary.

Primary consequence: the Node API process must not share a memory address space with FreeRDP sessions.

## 2. Worker sandbox

Linux production recommendation:

- non-root UID/GID;
- one process per session;
- private runtime directory mode 0700;
- `PR_SET_PDEATHSIG` or equivalent parent-death behavior;
- `no_new_privs`;
- seccomp profile after initial feature matrix is known;
- AppArmor/SELinux profile where deployment supports it;
- no host network namespace requirement beyond outbound RDP/Gateway connectivity;
- device nodes mounted/allowed only for sessions/policies that need them;
- filesystem read-only except runtime/sandbox/spool paths.

Do not run the whole container `--privileged` merely to support USB.

## 3. Secrets

Secrets include passwords, gateway credentials, access tokens, pass-the-hash values, smartcard PINs and future companion credentials.

Rules:

- API only over TLS outside localhost/trusted reverse proxy;
- secrets passed to worker through inherited private IPC after spawn;
- never command-line args;
- never environment variables for per-session secrets;
- recursive log redaction;
- no Prometheus labels with usernames/hosts if deployment considers them sensitive;
- keep secret lifetime short;
- do not persist credentials in core bridge by default.

The API logger applies recursive key-based redaction to each completed JSON
record, including child bindings and later setBindings values. Error-only calls
use a fixed message instead of Pino's implicit error.message. The default
request serializer omits URLs/headers/bodies; public errors use stable codes.
Malformed or over-64-KiB serialized log records become a fixed rejection record.
This bounds destination output, not Pino's preceding formatting allocation.
Messages supplied explicitly by trusted application code must still be constant
and must never interpolate credentials; key-based redaction cannot identify
secrets embedded in arbitrary free text. [Regression evidence](docs/ITERATION_216.md).

## 4. Certificate validation

Strict is default. `ignore certificate` is not a normal product mode and must require privileged deployment policy. Prompt/TOFU stores only certificate identity/fingerprint metadata.

Certificate change after prior trust must require explicit confirmation. The API should distinguish unknown certificate from changed certificate.

## 5. API security

The bridge defines an authentication hook but does not prescribe the future web product identity system. Minimum deployment behavior:

- reverse-proxy or built-in bearer/session auth;
- attach token scoped to one session and role;
- short TTL and single-use or connection-bound semantics;
- CSRF protection where cookie auth is used;
- Origin validation on WebSocket upgrades;
- per-IP/principal rate limits on session creation and auth prompts;
- maximum sessions and uploads;
- authorization check on every session/file/print endpoint.

## 6. Filesystem safety

- all browser-facing file IDs are opaque, not paths;
- canonicalize under session sandbox;
- `openat2`/equivalent safe path resolution on Linux when practical;
- reject symlinks for redirected roots unless policy explicitly allows them;
- reject sockets/devices/FIFOs in browser upload/download paths;
- quota bytes and file count;
- sanitize RDP drive/share display names separately from local paths.

## 7. Device safety

USB/smartcard/serial/parallel access is deployment policy, never user-supplied raw device path unless caller is privileged. Enumerate a safe device inventory and select by opaque id.

Custom VC/DVC and external helper execution are disabled by default. Do not expose `/rdp2tcp` or arbitrary executable path to untrusted browser clients.

## 8. Native hardening

CI release builds should enable:

- stack protector;
- PIE/RELRO/NOW where platform supports it;
- FORTIFY where toolchain supports it;
- ASan/UBSan test builds;
- compiler warnings as errors for project-owned native code;
- checked return values, especially FreeRDP 3 APIs marked nodiscard;
- dependency scanning and prompt FreeRDP security patch upgrades.

## 9. Audit events

Record structured non-secret events:

- session create/connect/disconnect/failure;
- certificate trust decisions;
- enable/use of USB/smartcard/printer/serial/host-path drive;
- file upload/download metadata (size, opaque id; filename according to policy);
- worker crash/watchdog kill;
- admin policy rejection.

Do not record clipboard contents or media.

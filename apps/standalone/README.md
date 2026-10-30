# Standalone service

Private assembly entry point for the standalone distribution. This is not a
separately published npm package. Public stable 0.7.0 includes negotiated
text/HTML/image clipboard and opt-in managed files with redirected sandbox
drives in its accepted profiles. Final installers and upgrades from public
v0.6.0 pass hosted Windows/Ubuntu and named Astra/RED OS acceptance.
See [public delivery and limits](../../docs/RELEASE_0_7_0.md#public-delivery).

Node.js 24 runs the HTTP service; each session still has a separate native
C++ worker. Configuration contains only public deployment settings and public
JWT verification keys. Passwords, bearer tokens and private signing keys must
never be saved in the configuration, argv, environment or logs.

Enable an optional top-level `files` policy in trusted configuration, then
select session-sandbox drive descriptors for authorized RDP sessions. JWT
ownership scopes file routes and session access. Node adapters use the same
policy under `sessions.files`; this standalone entry point serves other
languages through HTTP instead of embedding Node.js in their backend.

Managed files are independent of clipboard. OS file-manager Ctrl+C/Ctrl+V
remains deferred (`clipboardFiles: false`). See [FILES](../../docs/FILES.md)
for deployment policy, routes, quotas, read-only shares and tested scope, and
[STANDALONE](../../docs/STANDALONE.md) for service installation/operation.
Full Stage 7 and arbitrary device/server support remain separate.

Published 0.7.0 adds an operator-only `--inventory` command using
the distribution's private Node. It starts one disposable worker, prints a
bounded bridge-host metadata report and exits without server configuration,
HTTP, RDP or credentials. It does not redirect devices or inspect the browser's
computer. Public 0.6.0 lacks this command. Exact public 0.7.0 portable/installed
inventory checks pass, including Linux service-account execution.
See [syntax, permissions and statuses](../../docs/STANDALONE.md#operator-only-host-inventory).

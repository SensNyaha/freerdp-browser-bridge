# Standalone service

Private assembly entry point for the standalone distribution. This is not a
separately published npm package. Public stable 0.5.0 includes negotiated
text/HTML/image clipboard in its accepted profiles. The release/0.6.0 branch
prepares opt-in managed files and redirected sandbox drives; versioned
installers and upgrades from public v0.5.0 still require their own acceptance.

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

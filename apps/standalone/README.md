# Standalone service

Private assembly entry point for the standalone distribution. This is not a
separately published npm package. Candidate 0.3.0 adds verified bounded runtime
recovery before HTTP readiness. Its new-version artifacts/upgrade/publication
acceptance remains pending; the public stable distribution is 0.2.5.

Node.js 24 runs the HTTP service; each session still has a separate native
C++ worker. Configuration contains only public deployment settings and public
JWT verification keys. Passwords, bearer tokens and private signing keys must
never be saved in the configuration, argv, environment or logs.

The existing 0.2.5 installers have named platform acceptance. Candidate 0.3.0
must pass its own upgrade and release checks; see the original project TODO,
security requirements and docs/RUNTIME_RECOVERY.md. A source entry point alone
does not accept an OS or distribution format.

# Standalone service

Private assembly entry point for the standalone distribution. This is not a
separately published npm package. Public stable 0.4.0 includes opt-in HTML
clipboard and matching reference browser actions, with accepted named installers
and upgrades. The source image feature targets 0.5.0; it is not published yet.

Node.js 24 runs the HTTP service; each session still has a separate native
C++ worker. Configuration contains only public deployment settings and public
JWT verification keys. Passwords, bearer tokens and private signing keys must
never be saved in the configuration, argv, environment or logs.

The developing image feature uses explicit session `clipboard.images: true`,
native image/text/revoke capabilities and separate browser PNG actions.
The same shared session manager, directions, item limits and cleanup apply as
in the framework adapters; see docs/CLIPBOARD_SESSION.md. File clipboard remains
separate. The planned 0.5.0 installers must pass upgrades from immutable public
0.4.0 and their own release checks. See TODO.md, security requirements and
docs/CLIPBOARD_BROWSER.md for named source/application/distribution evidence.
A source entry point alone does not accept an OS or distribution format.

# Standalone service

Private assembly entry point for the next standalone distribution. This is
not a separately published npm package. Development remains at product 0.2.4
until the aligned 0.2.5 release is accepted.

Node.js 24 runs the HTTP service; each session still has a separate native
C++ worker. Configuration contains only public deployment settings and public
JWT verification keys. Passwords, bearer tokens and private signing keys must
never be saved in the configuration, argv, environment or logs.

Installer and clean-machine acceptance are pending. See the original project
TODO and security requirements; adding an entry point does not accept a new OS
or distribution format.

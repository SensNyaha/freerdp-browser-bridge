# Iteration 344 — repeat Windows lab RDP access check

2026-10-20. At the user's request, TCP reachability to the authorized
`192.168.21.149:3389` endpoint was rechecked and succeeded. The pinned native
FreeRDP inspect helper reached the certificate prompt. The presented fingerprint
is `sha256:7a826b7c5f71b03b67866a63d03e15279aefb6638a36cfc9c7209e349d5e75ed`
and the helper reports a hostname mismatch. The strict certificate mode then
returned `RDP_CERTIFICATE_REJECTED`, after which joined worker close left the
lab runtime directory empty.

This confirms network/TLS reachability and correct strict refusal only. It does
not accept or persist the changed certificate and does not establish connected
desktop, graphics, application or device behavior for this endpoint identity.
One-session use of this exact fingerprint awaits explicit user approval.

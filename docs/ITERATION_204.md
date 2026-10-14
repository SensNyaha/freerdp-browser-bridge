# Iteration 204 — manual WEB connection/settings example

2026-10-14. Implements the explicit user WEB visualization requirement and
SPECIFICATION 2.1/2.2/2.3 in the reference harness: RDP host/port, username /
domain/password, supported security/display/quality/media/touch settings and
Connect/Disconnect/Cancel. The labeled certificate dialog uses the actual
fingerprint and session-only decision. Strict remains default. Other Remmina-like
categories show explicit unavailable status; original backend stages are retained.
[Contract and run commands](WEB_CONNECTION_EXAMPLE.md).

Actual capabilities gate choices and submission. Video stays in viewer negotiation,
not unsupported native config. The input and mutable config password clear after
serialization; credentials are not persisted. Hosting authorization is separate
and bounded. One operation/cancellation generation deletes a late create before
replacement. Uncertain ownership blocks creation. Programmatic viewer attach
remains available.

Four pure cases pass: 18 video/output/input combinations agree with strict
TypeBox schema; malformed/unsupported bounds refuse without secret disclosure;
duplicate/late creation cannot attach after cancellation; pre-request cancel,
failed deletion and uncertain creation preserve ownership. Actual Edge with a
synthetic HTTP backend verifies 401 refusal, disabled capabilities, accepted
config, empty password, disconnect and delayed create/Cancel/DELETE without late
attach. No local/session storage is used. These are fixtures, not RDP acceptance.
The first fixture's generic Playwright isDisabled assertion for an option failed;
the corrected assertion checks the option's actual disabled property. Failed
evidence is retained. Visual inspection confirms readable Russian fields/settings
and no displayed password in the actual Edge screenshot.

Two actual Linux/XRDP/Windows Edge runs create through the form and accept only
the already approved fingerprint by clicking the dialog. Nonblank 1920×1080
H.264/JPEG, confirmed 1280×720/restoration and fresh-token reattachment pass.
Both report `manualForm:true` and empty-runtime joined cleanup. Windows empty
launcher smoke exits 0 with `referenceForm:true`, `rdpSessionCreated:false`,
`cleanup:true`. No physical microphone, operational remote input, sound generation
or saved real desktop images are included. Logs/synthetic UI screenshot:
`build/iteration-204-*`.

The supported-settings/manual-connection example is separate from remaining
Gateway/device/file/reconnect backends, a production identity/profile application
and full stage acceptance.

Final verification: lint/format, diff check and focused tests **5/5** pass.
Full bundled `pnpm check`: Windows **544 passed / 25 platform skips**, Linux
**493 passed / 76 platform skips**, 569 cases and zero failures. Native code is
unchanged; preceding CTest baselines remain Linux 24/24 and Windows foundation /
linked 11/11 / 23/23. The two owned online lab containers are stopped after
joined test cleanup; the separate offline SDK verifier remains available.

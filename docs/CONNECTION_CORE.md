# Experimental native connection core

Bundled builds expose connectCore=true and usable browser rdp=false. Foundation
builds expose both as false. Compiled channels are not device capability claims.

Supported fields: target host/port and capability-gated
[IP-family preference/force](IP_SETTINGS.md); password username/domain; security auto/NLA/TLS;
strict/prompt certificate policy; minimum TLS 1.2/1.3; initial width/height/depth;
connect/TCP acknowledgement deadlines; [native video quality/FPS profiles](VIDEO_QUALITY.md)
and capability-gated [appearance/performance settings](RDP_PERFORMANCE_SETTINGS.md);
explicit dynamic-resolution opt-in for experimental Display Control IPC.
Recognized fields outside this slice fail
with RDP_SETTING_NOT_IMPLEMENTED, rather than being ignored. Legacy RDP security,
certificate ignore, TOFU, Gateway/proxy, reconnect, interactive auth replacement,
complete media/input acceptance, audio and files/devices remain pending.
The experimental JPEG and H.264 browser paths are documented in
[MEDIA_JPEG.md](MEDIA_JPEG.md) and [MEDIA_H264.md](MEDIA_H264.md).

The worker uses custom public client entry points with rdpClientContext at the
start of its bridge context. Windows networking initializes WinSock 2.2.
The RDP thread owns settings/connect/GDI work while IPC remains responsive to
heartbeat, shutdown and certificate decisions. A deadline aborts connection/
activation, including certificate waiting. Node bounds shutdown and force-kills
when cleanup exceeds its deadline.

Initial headless GDI/resize check dimensions before framebuffer allocation:
maximum 7680x4320. Classic paint revisions and bounded native JPEG capture are
implemented; a real XRDP image has rendered in the reference canvas at 1080p.
Independent cursor extraction/overlay and XRDP replay are implemented.
The modern GFX binding feeds these same GDI callbacks in synchronous DVC mode;
[GFX.md](GFX.md) records native fixture coverage, allocation guards and retained
decoder/scaling gaps. Actual negotiated GFX, browser resize and the complete
media gate remain pending.
The [native Display Control foundation](DISPLAY_CONTROL.md) now binds public
server caps and distinguishes sent layouts from actual desktop observations.
Bounded private IPC requests/results and Node WorkerProcess metadata are implemented;
actual XRDP negotiated and accepted a resized desktop and restoration with fresh IDRs.
Public control requests, attachment replay and browser resize acceptance remain
pending. Successful DesktopResize resets lazy encoders, including same-size
GFX resets, so the next AVC capture starts a fresh IDR chain.
AutoLogon is enabled for supplied credentials.

## Secrets and trust

Configuration follows HELLO over inherited private pipes. Passwords use a separate
4096-byte UTF-8 class. Transport copies are overwritten in Node/native code.
The current FreeRDP password setting is overwritten/cleared after connect settles.
Upstream settings snapshots and immutable JS strings may retain copies until
freed; this is not a complete zeroization guarantee.

External certificate management prevents implicit trust from user known-host/
certificate override files. OpenSSL checks chain, validity, server purpose and
hostname/IP against its default trust store. Windows root-store integration and
deployment-managed CA provisioning require separate implementation/acceptance.

Strict mode rejects failed validation. Prompt sends a challenge, SHA-256 fingerprint
and bounded validation flags. A current control lease can answer certificate.response
with challenge/fingerprint/accept. Decisions are single-use and match the pending
certificate. Detach revokes old-lease authority; reattachment receives the prompt.
Acceptance is session-only, without persistent certificate storage. The wait is
bounded by 30 seconds and by connectMs. TOFU/changed-certificate history is pending.

```json
{"v":1,"type":"certificate.response","seq":1,"ts":1791400000123,"data":{"challenge":"1","fingerprint":"sha256:<64 lowercase hex digits>","accept":false}}
```

Public failures use fixed messages. Numeric FreeRDP errors remain internal event
metadata; they are not copied to public session snapshots. Raw FreeRDP logging is
OFF.

For a terminal native `RDP_DISCONNECTED`, the Node adapter recognizes only the
pinned FreeRDP 3.32.1 ERRINFO values: idle/logon timeout, server/user logoff,
server denied connection, insufficient privileges, fresh credentials required,
server out-of-memory and selected Windows session-component failures. They
publish fixed `RDP_SERVER_TIMEOUT`, `RDP_SERVER_LOGOFF`,
`RDP_SERVER_REJECTED`, `RDP_SERVER_FAILURE` or `RDP_AUTHENTICATION_FAILED`
failures. Other numeric values retain `RDP_DISCONNECTED`; non-disconnect native
failure classes are never reclassified. The private state record and its numeric
diagnostic are unchanged. This is a selected-code mapping, not complete remote
disconnect reason coverage; other ERRINFO values and actual server-profile
acceptance remain open.

For a failed connection still classified `RDP_CONNECT_FAILED`, the adapter also
recognizes the pinned FreeRDP 3.32.1 CONNECT codes for insufficient privileges,
expired/required-change passwords, revoked accounts, disabled/expired/locked
accounts, logon failure, wrong password, access denied, account restriction,
logon-type refusal and missing credentials. Those become the existing fixed
`RDP_AUTHENTICATION_FAILED` public failure. Transport/TLS failures and unknown
CONNECT codes retain `RDP_CONNECT_FAILED`; no native error number is exposed.
This is a reviewed subset, not exhaustive authentication policy coverage.

## Hosting and tests

Opt in from a host with an identity hook and explicit browser Origins:

```ts
const worker = { workerPath, runtimeRoot };
await createSessionServer({
  worker, authenticate, allowedOrigins: ["https://your-ui.example"],
  sessions: { workerFactory: () => new NativeSessionWorker(worker) },
});
```

The CLI still denies protected routes without hosting authentication and does not
automatically enable this backend.

The lab runner reads authorized ignored files in .local-tests. Plaintext lab
credentials are an explicit AGENTS.md development exception with current-user
Windows ACL, not credential persistence in the service. Credentials never enter
worker argv/env/logs.

```sh
node scripts/test-xrdp-lab.mjs strict
node scripts/test-xrdp-lab.mjs inspect
node scripts/test-xrdp-lab.mjs connect sha256:<verified-fingerprint>
```

inspect obtains certificate metadata and closes. connect accepts only the supplied
fingerprint, checks activation/heartbeat after three seconds, and closes.
tests/integration/connection.test.mjs uses actual workers with a synthetic
RDP-negotiation/TLS endpoint, not a fake desktop. Actual XRDP evidence is separate
in ITERATION_004.md.

Connection publishes one terminal outcome after display callback unbind and owned
input/addin retirement. Cleanup failure promotes the selected outcome to protocol
failure before publication; it cannot produce closed followed by failed.
Ownership still retires on the RDP thread before context destruction. See
[Iteration 33](ITERATION_033.md) for lifecycle regression evidence and fault-injection
limits. This changes ordering/cleanup reporting, not the RWI1 wire layout.

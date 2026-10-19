# Manual reference WEB connection example

Explicit user requirement, 2026-10-14. The reference harness demonstrates manual
RDP connection entry and currently supported Remmina-like settings through the
existing API. This is an example client; the original production application /
profile-store exclusions do not remove this example.

## Run locally on Windows

After ordinary pnpm and bundled native builds:

```powershell
node scripts/start-reference-harness.mjs
```

Or use the project-local Node 24:

```powershell
.\.tools\node-v24.21.0-win-x64\node.exe scripts/start-reference-harness.mjs
```

The helper opens visible Edge with an empty form and a loopback API at
`127.0.0.1:47997`. Enter RDP host/IP, port, username/password and optional domain;
choose settings and click Connect. Window close/Ctrl+C joins server and worker
cleanup. Port conflict fails without taking over another listener. `--smoke`
checks bounded empty headless startup/cleanup with no RDP creation.

## Settings

Controls cover auto/NLA/TLS, minimum TLS 1.2/1.3, strict/session-only certificate
prompt, connection deadline, one primary display at 100% scale, initial size /
dynamic resolution, video codec, quality/FPS, touch, PCM/Opus output, 120/200 ms
handoff buffer, PCM/Opus microphone and opt-in text clipboard directions/item
quota. [Explicit clipboard controls and scope](CLIPBOARD_BROWSER.md).
The clipboard quota field is disabled while off; turning text selection on
enables the bounded quota input. Current Windows/XRDP JPEG/H.264 default-off
viewer regression is recorded in [Iteration 239](ITERATION_239.md).
Actual capabilities disable unavailable
choices; submission checks them again. Browser codec presence is checked;
existing viewer negotiation performs detailed decoder/provider checks. Microphone
permission and audio gesture ownership retain separate controls.

The six appearance controls (wallpaper, font smoothing, desktop composition,
full-window dragging, menu animations and themes) each offer profile inheritance,
enabled or disabled. Inheritance omits the optional boolean; explicit disabled
sends false and overrides a selected preset. Controls start disabled until actual
`performanceSettings` capability is received, and remain disabled on old workers.
The unavailable message explains that their quality profiles retain video-only
behavior. Submission checks the capability again before any request. Values are
not persisted. [Profile and native projection](RDP_PERFORMANCE_SETTINGS.md).
The existing `custom` profile is available as “Свои параметры”: with all six
controls inherited, it selects no appearance preset; individual enabled/disabled
choices remain explicit overrides. Encoder defaults/FPS limits still apply.
[Form verification](ITERATION_322.md) uses Edge and a synthetic HTTP endpoint.
The named [Windows JPEG/form smoke](ITERATION_323.md) additionally passes actual
creation, prompted certificate, explicit appearance projection, nonblank 1080p,
heartbeat and disconnect. Server visual effects, other profiles and broader
appearance acceptance remain open.

Strict certificate validation is default. Prompt is explicit; the current
fingerprint dialog offers accept-for-this-session or reject, without enabling
TOFU/persistent trust/ignore. Video choice belongs to viewer negotiation and
is not passed as unsupported native `media.videoCodec`.

Gateway/proxy, reconnect, HTML/image/file clipboard, files/drives, printers, smartcard,
serial/parallel, USB and RemoteApp are listed as unavailable in the current
backend. Their original implementation stages/gates remain required. This does
not claim a complete Remmina clone or turn a compiled addin into device support.

## Hosting and ownership

Hosting authentication is separate from RDP credentials. The local helper creates
one ephemeral host bearer and injects its callback through the private browser
driver, without printing/persisting it. Other hosts configure the initialized page:

```js
window.bridgeConnection.configure({
  authorize: async () => ({ authorization: 'Bearer ' + await hostAccessToken() }),
});
```

The form posts to same-origin `/v1/sessions`, attaches returned short-lived
credentials and deletes its owned session on Disconnect/Cancel. Credentials,
profiles and tokens are not written to local/session storage. The password DOM
field and mutable config clear after serialization; immutable browser/JSON /
request strings retain the documented zeroization limit. Authorization/network
waits are bounded; raw provider/server errors are not displayed. Missing host
identity receives normal API refusal.

One create/cleanup is allowed at a time. Cancellation immediately revokes attach;
a late create is deleted before replacement. Uncertain creation/deletion blocks
new creation, without replaying an unknown credential-bearing operation. Known
session deletion can be explicitly retried. Local window close joins server
shutdown; generic hosts still supervise abrupt browser/API lifecycle loss.
Programmatic `window.bridgeViewer.attach` remains available; this owner tracks
only sessions created by its manual form.

[Verification](ITERATION_204.md) distinguishes pure schema/ownership, actual
Edge/synthetic HTTP, actual Linux/XRDP and empty Windows launcher smoke.

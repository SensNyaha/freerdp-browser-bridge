# Owned local XRDP lab

This device-free stand implements the user's explicit request for a Linux RDP
container. It changes no external server or personal VMware machine. The real
XRDP/Xorg server and prepared Tk application run in Docker; Bridge still uses
one linked native worker and the ordinary public Node API/browser viewer.

From the project root, with Docker Desktop running:

```powershell
node scripts/start-owned-xrdp-lab.mjs
```

The helper builds `tests/fixtures/xrdp-lab`, publishes only
`127.0.0.1:3391`, uses two CPUs / 2 GiB / 256 PIDs, init and
no-new-privileges, and mounts no host directory. XRDP/PAM setup uses an ordinary
writable container and its normal service privileges. This is a lab fixture,
separate from the production read-only/non-root service deployment.

A random fixture account password reaches `chpasswd` on private stdin, never
argv or environment. The helper creates only the three Git-ignored local files
`xrdp-container-lab.json`, `xrdp-container-lab.secrets.json` and
`owned-xrdp-lab.receipt.json` inside `.local-tests`. They follow the authorized
local-development plaintext exception; keep that directory private. Existing
files/container names are refused rather than replaced. Failures remove only
the just-created container and files written by that invocation.

The two-day self-signed server certificate is generated inside the container;
its exact public SHA-256 fingerprint, image ID and installed server versions
appear in the nonsecret receipt. No certificate trust is persisted. Bridge's
strict default remains; a prepared viewer invocation accepts only that known
owned certificate for its current session:

```powershell
$lab = Get-Content .local-tests/owned-xrdp-lab.receipt.json -Raw | ConvertFrom-Json
$env:BRIDGE_LAB_PROFILE = 'owned-container'
node scripts/test-xrdp-viewer.mjs $lab.fingerprint jpeg --resize-test build/native-clean-n4yhyC/receipt.json
node scripts/test-xrdp-viewer.mjs $lab.fingerprint h264 --resize-test build/native-clean-n4yhyC/receipt.json
Remove-Item Env:BRIDGE_LAB_PROFILE
```

Use an existing verified linked receipt appropriate to the checkout. The fixed
profile selects only this loopback endpoint and its separate credentials; the
default profile retains the Windows lab files. Unknown profiles/foreign targets
are refused. The image base digest is pinned; installed Debian package versions
are recorded at setup time and are separate from project dependency pins.

The prepared desktop contains a coloured scrollable canvas, fixed scalar pointer
counters and a one-Hz visible marker for an active soak. F2 selects bounded JSON
in its result field; ordinary Ctrl+C can copy that result. It launches no other
application and contains no user data, network client or clipboard-data reader.
Wheel counters advance only when the canvas view actually moves. The movable
tile records displacement only after its drop. The owned `--owned-pointer-test`
viewer mode verifies these actions through bounded X11 PRIMARY scalar readback,
separate from CLIPRDR. Exact passing scope is in [398](history/iterations/351-400.md#iteration-398).
The optional `--owned-held-loss-test` observes fixed Ctrl/button state around
controlled RDP loss. A lost TCP cannot deliver release; fresh-connection clearing
requires its own passing check. Both modes refuse the external default lab.

The setup also prepares `bridge-lab-2`, using the same synthetic random password
via private stdin, for `node scripts/test-owned-xrdp-pair.mjs <native-receipt>`.
Separate accounts avoid the server's ordinary same-account connection replacement.
This bounded control checks actual native coexistence, heartbeat/captures and
survival of the first owner after the second retires. It is not browser/audio load.

The bounded server-to-browser CLIPRDR source/read path now passes
[400](history/iterations/351-400.md#iteration-400). To repeat only its fixed prepared Tk receipt read
with a linked receipt containing that correction:

```powershell
$env:BRIDGE_LAB_PROFILE = 'owned-container'
node scripts/test-windows-browser-clipboard.mjs $lab.fingerprint $receipt --focus-editor --owned-clipboard-read
Remove-Item Env:BRIDGE_LAB_PROFILE
```

This mode uses F2/Ctrl+C and the public Get action, performs no OS Clipboard API
operation or native offer, and refuses the external/default lab. It does not
accept arbitrary application clipboard contents or both transfer directions.

## Unicode-capable peer and complete Clipboard check

The legacy XRDP 0.9.21.1 peer has an upstream surrogate-pair defect. Its
successful scalar/BMP observations do not accept full Unicode with emoji.
An independent Debian 13/XRDP 0.10.1 fixture supplies that acceptance alongside
the existing server. Bridge dependency pins and Release artifacts are retained;
the prepared application Copy hook is described below:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/start-owned-xrdp-lab.mjs --unicode-server
$unicode = Get-Content .local-tests/owned-xrdp-unicode-lab.receipt.json -Raw | ConvertFrom-Json
$env:BRIDGE_LAB_PROFILE = 'owned-unicode-container'
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/test-windows-browser-clipboard.mjs $unicode.fingerprint build/native-clean-RKqCuA/receipt.json --focus-editor --owned-clipboard-roundtrip
Remove-Item Env:BRIDGE_LAB_PROFILE
```

This uses container `freerdp-bridge-owned-xrdp-unicode`, only
`127.0.0.1:3392`, and separate ignored `xrdp-unicode-lab.json`,
`xrdp-unicode-lab.secrets.json`, `owned-xrdp-unicode-lab.receipt.json`.
Resource/no-host-mount constraints and private-stdin account provisioning match
the legacy stand. The fixed selector rejects crossed ports/credential aliases;
the old X11 pointer/recovery observers explicitly refuse this new profile.

F3 opens the prepared application's own empty Text document. Browser local
Paste / Send and application Ctrl+V / Ctrl+A / Ctrl+C verify actual consumption
and exact CLIPRDR Get. F4 prepares a different fixed Unicode application
document for its ordinary Copy / Get / local OS Copy/readback. It does not
inject a clipboard or establish RDP Unicode keyboard input support. Both paths
retain Cyrillic/Japanese/emoji/multiline comparisons and the finite item cap.
Actual browser permission refusal, revoke, viewer clearing and PID/runtime
cleanup follow. Failure screenshots and arbitrary remote text logging are off.

Tk keeps clipboard ownership across copies. The fixture releases CLIPBOARD
immediately before its ordinary Copy binding when fixture text is selected,
so XFixes bridges receive a fresh owner notification. No polling/readback loop
is added to Bridge. F2 hides the Text document and retains its fixed pointer
receipt behavior. The read-only `--owned-clipboard-read` mode now checks two
successive Copy/Get operations. [Measured controls/results](history/iterations/401-450.md#iteration-404).

The two real Unicode roundtrips and a fresh read-only connection pass on the
new peer; full feature-branch `pnpm check` passes 900 / 61 skips / 961 total
before merge. Native code and production TypeScript remain unchanged.
The named Windows scenario is unchanged. These observations do not repair
old XRDP 0.9.x or accept every Linux producer/server/format/quota profile.

## Stopping a stand

Stop the owned stand when finished:

```powershell
docker stop freerdp-bridge-owned-xrdp
docker stop freerdp-bridge-owned-xrdp-unicode
```

The container and local account files remain available for an ordinary Docker
restart. For a fresh build/certificate, first remove this owned container and
only its three named local files. Do not reuse its credentials outside this lab.

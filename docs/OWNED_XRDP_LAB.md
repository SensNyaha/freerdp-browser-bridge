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
separate from CLIPRDR. Exact passing scope is in [398](ITERATION_398.md).
The optional `--owned-held-loss-test` observes fixed Ctrl/button state around
controlled RDP loss. A lost TCP cannot deliver release; fresh-connection clearing
requires its own passing check. Both modes refuse the external default lab.

The setup also prepares `bridge-lab-2`, using the same synthetic random password
via private stdin, for `node scripts/test-owned-xrdp-pair.mjs <native-receipt>`.
Separate accounts avoid the server's ordinary same-account connection replacement.
This bounded control checks actual native coexistence, heartbeat/captures and
survival of the first owner after the second retires. It is not browser/audio load.

Stop the owned stand when finished:

```powershell
docker stop freerdp-bridge-owned-xrdp
```

The container and local account files remain available for an ordinary Docker
restart. For a fresh build/certificate, first remove this owned container and
only its three named local files. Do not reuse its credentials outside this lab.

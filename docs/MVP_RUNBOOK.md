# Running the tested MVP

Acceptance and remaining limitations: [MVP acceptance](MVP_ACCEPTANCE.md).
The named joint Windows gate passes [403](history/iterations/401-450.md#iteration-403); this does not accept
the broader V1 platform/device matrix.

## Existing Windows checkout

Use the current receipt-bound Release consumer, which includes input recovery
`1ffbfeb` and CLIPRDR normalization `d34cb74`. This preserves the original
Release outputs and settings:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/start-reference-harness.mjs --native-receipt build/native-clean-RKqCuA/receipt.json
```

Adding `--smoke` verifies empty form startup and cleanup without an RDP session;
that exact receipt selection passes [403](history/iterations/401-450.md#iteration-403).

The helper verifies the receipt and worker/helper hashes, opens Edge and hosts
the local API on `127.0.0.1:47997`. It does not read lab credentials. Enter the
target, username/password and optional domain in the form; no profile or
credential persistence is provided. For a different checkout, build the pinned
native dependencies and worker using [the development guide](DEVELOPMENT.md),
then select its verified linked receipt as described in the
[connection example](WEB_CONNECTION_EXAMPLE.md).

Use one primary display at 100% scale. H.264 requires the browser decoder;
JPEG is the fallback. Enable dynamic resolution to resize the session. Audio
and text Clipboard are explicit opt-ins: the accepted listening profile is
Opus / 200 ms, and playback requires the audio-start gesture. Clipboard mode
and a finite item quota must be selected before connecting.

Certificate verification is strict by default. For an authorized self-signed
lab, explicitly choose session-only prompting and compare the displayed
fingerprint with the approved value before accepting. No persistent trust or
ignore-certificate mode is required.

## Clipboard and shutdown

Local paste fills the viewer draft; Send offers it to the remote clipboard.
Paste in the remote application separately. Remote Copy followed by Get fills
the viewer's received field; Copy to the local OS clipboard is another explicit
action. Permission refusal leaves the remote transfer separate. See
[Clipboard controls](CLIPBOARD_BROWSER.md).

Disconnect or close the helper window to retire its owned session, viewer and
worker. An independent viewer may detach and later reattach to an active
session using fresh public attach tokens. Hard TCP loss cannot deliver remote
key/button release; the accepted recovery clears inherited standard buttons
when the next controller has rendered the current desktop.

The tested small Unicode Clipboard chains include Windows Notepad and the
named owned XRDP 0.10.1 / prepared Tk profile, including repeated Copy/Get
and browser OS Clipboard API [404](history/iterations/401-450.md#iteration-404). Wider XRDP versions,
producers and applications retain separate acceptance; older 0.9.x surrogate
conversion is not repaired by the fixture. The GCC 8.3 Linux producer also
passes its bounded prepared-Tk CLIPRDR profile [412](history/iterations/401-450.md#iteration-412).
Numeric audio discontinuities remain measured even in the accepted audible
profile. Drives, USB, printing, smartcard, serial/parallel and other Clipboard
formats are explicit unavailable choices;
the full requirements remain in [TODO](../TODO.md).

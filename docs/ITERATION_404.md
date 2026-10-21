# Iteration 404 — XRDP Clipboard feature branch

2026-10-21. Implements the next SPECIFICATION §2.7 / Stage 7 acceptance slice
on `feature/xrdp-clipboard-roundtrip`, based on shared `master` `806147b`.
The tested stable `v0.1.0` baseline is subsequently merged into this branch;
the feature's acceptance and full regression below pass before its merge.

Acceptance requires both real headed Edge Clipboard API ↔ CLIPRDR ↔ prepared
Linux application Unicode directions, including emoji/multiline text, repeated
Copy and fresh RDP/viewer connections, permission refusal, revoke and joined
PID/runtime cleanup. No format/quota/deadline reduction, automatic retry, raw
clipboard logging, production dependency or Release configuration change.

## Repeated Copy diagnosis

The unchanged Release worker from [403](ITERATION_403.md) reaches CLIPRDR ready
but receives no fresh text offer after F2/Ctrl+C on the long-lived Tk app.
Baseline logs: `iteration-404-owned-clipboard-baseline1.log`, `baseline2.log`.
The fixed X11 PRIMARY receipt confirms application input; Ctrl/buttons are up.
A content-free XFixes observer measures zero SetSelectionOwner events, with
the same owner before/after (`iteration-404-xfixes-before.log`).

On a fresh **original** application, the first Get succeeds and the second
Copy fails to announce: one XFixes event / one native read / twelve key events.
Logs: `iteration-404-xfixes-original-fresh.log`,
`iteration-404-owned-original-fresh.log`. This excludes an application restart
alone as the correction. The fixture uses `libtk8.6` 8.6.13-2.

Tk's [upstream issue](https://core.tcl-lang.org/tk/tktview/e94c8bc845b4d5a658cd5421ef23ef2484560fa8)
describes retaining Clipboard ownership across copies without the XFixes signal
used by selection bridges. The prepared app now clears CLIPBOARD ownership
immediately before its ordinary class Copy binding, only with selected fixture
text. PRIMARY stays separate. No bridge-side polling or automatic text read is
added; this is an explicit application Copy compatibility adjustment.

The corrected app produces four XFixes events and two successful ordinary
Copy/Get operations, zero native writes and empty runtime
(`iteration-404-xfixes-corrected.log`, `iteration-404-owned-corrected.log`).
A new RDP/Edge connection to the same app, without restarting it, again passes
two Copy/Get operations and cleanup (`iteration-404-owned-fresh-reoffer.log`).

Original app SHA-256:
`d764ceb40978af23ab0efeb6d2fefe38e26f877d7bad5cd694ebd71525d6aa1e`;
copy-only variant:
`8815d25a9d8abf4fcba228e59e425956b2c0a396f31ce8029c57a28f81a7e2a4`.
The ID/label-guarded own-container refresh retains the original and restarts
only the fixed application under its synthetic UID. No external host changes.

## Full Unicode peer limitation

The new prepared Text document uses F3 for an empty editor and F4 for a fixed
Unicode application document. F4 does not write a clipboard or rely on RDP
Unicode key injection; the ordinary application Copy still supplies CLIPRDR.
The helper refuses external profiles/conflicting scenarios and labels the
application `owned-tk`. Its new mode uses the actual local OS Clipboard API.

The first attempt stops at local Paste before any native write/read. The helper
now seeds its fixed local OS test value immediately before Paste, retaining
exact comparison (`iteration-404-owned-roundtrip1.log`). The next full-emoji
attempt receives the native offer ACK but no application Copy offer
(`iteration-404-owned-roundtrip2.log`).

A separate diagnostic removes emoji from the **incoming** vector only. Browser
→ Tk paste/Copy/Get then matches; reverse application emoji data is accepted
by the native read but fails exact comparison
(`iteration-404-owned-bmp-diagnostic.log`). This diagnostic does not accept the
full Unicode feature. It agrees with the old peer's documented
[surrogate-pair defect](https://github.com/neutrinolabs/xrdp/issues/2603) and
[upstream conversion correction](https://github.com/neutrinolabs/xrdp/pull/2794).

An additional owned Unicode peer is prepared at `127.0.0.1:3392`, with
separate name/config/credential/receipt files and the same resource/no-mount
limits. Its Debian 13 base is pinned to
`sha256:4c25275446ca371766b8b093c696782eabce06263fccacb8d5d813b3dc44b308`.
The Debian 12 server binary/image, Bridge dependency pins and worker stay
unchanged; only its prepared application was refreshed as described above.
Installed versions: XRDP `0.10.1-3.1+deb13u2`, xorgxrdp `1:0.10.2-1`,
Openbox `3.6.1-12+b2`, python3-tk `3.13.5-1`. Image SHA-256:
`7d0407c2277d75d4eb58fefbd8af73ad12e4eb4c3b8cd3a43ecc4f81902e7089`.
Setup log: `iteration-404-unicode-setup.log`; legacy server/container identity
and account files are preserved separately.

## Real Unicode result

Two separate actual public Edge/RDP invocations pass the unchanged full
Unicode/emoji/multiline vectors in both directions, real local Clipboard API,
exact application paste/Copy/Get and OS readback. Each observes one native
write, two reads, 30 key events, actual browser permission refusal, no-format
revoke, cleared viewer fields, retired PID and empty runtime, exit 0. The same
prepared Tk process is reused across the new RDP/viewer connection.
Logs: `iteration-404-unicode-roundtrip1.log`,
`iteration-404-unicode-roundtrip2.log`.

A subsequent fresh connection also passes two server-origin Copy/Get receipts
before any native client write, twelve key events and joined empty-runtime
cleanup (`iteration-404-unicode-fresh-reoffer.log`). No host Clipboard API is
used by that read-only control. This separately checks fresh ownership offers.

These results accept the named compliant XRDP 0.10.1 peer; they do not claim
old XRDP 0.9.21.1 surrogate conversion was repaired. No client text is replaced
or truncated to accommodate it. Application clearing keystrokes follow exact
readback; empty content is not independently read back. The historical Windows
scenario and legacy helper names retain their separate scope.

Narrow CLI/profile checks pass 9/9, including setup argument refusal before
filesystem/Docker access and refusal of the legacy X11 observers by the Unicode
profile (`iteration-404-cli-focus-final.log`). Full feature-branch `pnpm check`
passes **900 / 61 skips / 961 total**, zero failures/cancellations,
500.81 s for Node tests, including build, lint, formatting and version consistency.
Evidence: `build/iteration-404-feature-check.log`. The stable MVP release was
prepared separately on `release/0.1.0` and tagged before this feature is merged.

All 353 native source files still match the tested Release receipt, source hash
`4ed895de6cb0e2e2efd45b9b277be6e5e90e7acf4b847a537043cc220b367ad1`;
the worker remains `8bebcb649d41244976417f953e353aaa3d027b42c0d62505f0d82553abb3a171`.
Native CTest 34/34 from [401](ITERATION_401.md) retains its exact scope;
it is not rerun or represented as new Linux-producer acceptance. Native code,
production TypeScript, dependency pins, wire contracts and Release flags are
unchanged. This completes the named XRDP Clipboard slice, while full Stage 7
direction/quota/isolation/resource/formats and managed drives remain open.

Accepted feature commit: `6d3467e27055f45129bc4a7d7702df1426ea2227`.
Stable MVP baseline: `v0.1.0` / `9d88694984d03af63456997810cbb16e730dff6a`;
the XRDP acceptance is subsequent unreleased work, not part of that tag.

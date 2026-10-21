# Changelog

Product release versions follow [the version policy](docs/VERSIONING.md).

## Unreleased

- Named owned XRDP 0.10.1 / prepared Tk / headed Edge Unicode Clipboard API
  roundtrip acceptance, including emoji/multiline text, repeated Copy and new
  RDP connections, permission refusal, revoke and joined cleanup. Adds an
  independent fixed Unicode-capable lab profile and a fixture Copy ownership
  notification; production code, native artifacts and dependency pins are
  unchanged. Full check: 900 passed / 61 skipped. [Evidence](docs/ITERATION_404.md).
  Old XRDP 0.9.x surrogate conversion and wider Stage 7 gates remain open.

## 0.1.0 — 2026-10-21

Stable practical MVP for the [named accepted profiles](docs/MVP_ACCEPTANCE.md).
All product manifests already declare 0.1.0; this release formalizes the stable
MVP boundary and adds a version consistency gate.

- Public Node API with one native FreeRDP worker per session; Windows and XRDP
  desktop, H.264/JPEG, cursor, resize and viewer reattachment.
- Actual Windows Unicode Clipboard API ↔ CLIPRDR ↔ Notepad in both directions,
  explicit permission/refusal/revoke and cleanup; keyboard/mouse acceptance.
- User-accepted Windows Opus/200 ms listening, including the joint 30-minute
  H.264/input/Clipboard observation. Measured discontinuities remain visible.
- Fresh-controller inherited-button recovery and bounded XRDP zero-trailer
  CLIPRDR normalization, with strict certificate verification and pinned inputs.
- Active owned-XRDP 30-minute observation, named CPU/RSS failure/cleanup cases
  and short two-account coexistence. Windows/Linux linked regression passes.

Evidence: [joint Windows](docs/ITERATION_403.md),
[active XRDP/current Release](docs/ITERATION_401.md),
[Windows/Linux regression](docs/ITERATION_402.md).
Run: [MVP runbook](docs/MVP_RUNBOOK.md).

Known limits include nonzero audio epoch/underflow counters, an earlier
unclassified Get failure, unaccepted repeatable XRDP Clipboard ownership and
the deferred full V1 device/drive/advanced-connection/platform matrix. These
remain recorded; stable MVP does not mean all V1 requirements are complete.

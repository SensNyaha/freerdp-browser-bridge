# Iteration 448 — repeatable standalone desktop acceptance

Work remains on `feature/standalone-installers-0.2.5`; all tested product and
runtime manifests in this block are **0.2.4 prototypes**. This evidence does
not accept the final 0.2.5 release, a newer-version upgrade or auto-publication.

The preceding committed block `992997c23d2aad47263d8b7e5774c92312451b27`
passes all three hosted workflows:

| Workflow | Run | Result |
| --- | --- | --- |
| GCC 8.3 | 39961988517 | success |
| Installed service and portable Windows/Ubuntu | 39961988580 | success |
| Foundation | 39961988591 | success |

Full local counts remain Windows **988 pass / 63 skips**, Linux **963 / 90**,
zero failures, as recorded in [iteration 447](ITERATION_447.md). Those counts
precede this block; packaging and actual-lab results below are separate checks.

## Actual installed Astra and RED OS desktops

`tests/packaging/standalone-rdp.mjs` now drives the real browser reference page
with an in-memory owner JWT and separately entered RDP credentials. It supports
a relocated private-Node Windows portable service or the actual installed Linux
service through `scripts/standalone/rdp-lab-server.py`. The latter uses pinned
SSH, private-stdin sudo and a bounded loopback SSH relay. Only public deployment
settings cross the fixture's JSON control pipe; credentials never enter argv,
environment, new files or diagnostic output.

The eight final profiles pass:

| Service host | RDP lab | Codecs | Result |
| --- | --- | --- | --- |
| Windows portable | Astra 1.7.5 | H.264, JPEG | both pass |
| Windows portable | RED OS 7.3 | H.264, JPEG | both pass |
| Installed Astra 1.7.5 DEB | Astra 1.7.5 | H.264, JPEG | both pass |
| Installed RED OS 7.3 RPM | RED OS 7.3 | H.264, JPEG | both pass |

Each checks a nonuniform rendered desktop at 1280×720 and 1920×1080, display
generation agreement, media reconfiguration, fresh H.264 keyframes where
applicable, fresh channel grants for browser reattachment, owner deletion,
zero remaining sessions/connections, empty native runtime and joined shutdown.
All eight report zero browser errors. Linux additionally checks non-root service
identity, uninstalls its package and restores the previous public default-deny
configuration. The RED OS retained file follows RPM `.rpmsave` semantics.
Receipts: `build/standalone-rdp-{win32,linux}-{astra,redos}-{h264,jpeg}.json`.
These tests do not newly accept audible output, clipboard, keyboard/mouse or
devices; their existing common-core acceptance remains separately scoped.

The Linux packages are the exact accepted prototypes from iteration 447:

```text
Astra DEB SHA-256
d08affb5cf938a317932f22d043a0325ad6026bcaa27e56db97c69bcfaf1fb9a
RED OS RPM SHA-256
6b6f0d1805b7f1202c0984a1e42f505c2e1ce756543a86a8aa3f2dc8aaaf6620
```

The initial sudo fixture writes a password before knowing whether sudo needs
one; cached/NOPASSWD authorization therefore leaves that line in the root
program's JSON input and safely fails parsing. The corrected handshake waits
for a fixed sudo prompt before one private write, or accepts the fixed ready
record without sending a password. Six pure standard-library protocol tests
pass, including fragmented/repeated prompts, cached authorization, deadline,
record and diagnostic bounds. Hosted acceptance now runs those tests without
SSH or credentials. All four Linux desktop profiles repeat successfully with
the final public-config guards. No raw browser/SSH exception containing form
values is printed; failures emit only fixed stage codes.

## Windows portable path boundary

PowerShell now requires fully qualified drive paths for custom configuration
and runtime and normalizes them before checking permissions or launching the
child. Relative, drive-relative and root-relative paths are refused, avoiding
different PowerShell/.NET interpretations. The independent portable check
passes **1/1**, including those refusals, complete archive/file hashes, native
TLS, joined shutdown, private runtime and preservation of permissive caller data.

The rebuilt ZIP has **4094 regular files**:

```text
build/standalone-portable-ty8gqm/freerdp-bridge-0.2.4-win32-x64.zip
SHA-256 42821b27f1b2e843e36e1b23e6b9652ae8ddc19c4b6cbdae0d7267f34f89ea18
```

All four Windows real-desktop profiles above use this rebuilt archive. Changed
JavaScript passes ESLint and Prettier; the Python protocol suite passes 6/6.
The block is committed as `de46cea5776be19971716117b1c37dbf46012464` and
passes all three hosted workflows: GCC 8.3 **40005046461**, installed-service
Windows/Ubuntu **40005046268**, and foundation **40005046289**. The pure Python
protocol step passes there without lab access or credentials. Receipt:
`build/iteration-448-hosted-runs.json`.

Remaining delivery gates are aligned 0.2.5 native/JS and installer artifacts,
newer-version upgrade, required final regression and actual main/master release
automation. Project-owned cleanup and documentation consolidation follow those
gates. The separate prepublication candidate-cache work is not accepted by
this desktop/launcher block.

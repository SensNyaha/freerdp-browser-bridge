# Iteration 451 — automatic standalone release pipeline preparation

Work stays on `feature/standalone-installers-0.2.5`, manifests **0.2.4**. No new
stable tag, npm package or installer release is published by this block.

The preceding commits finish all three hosted checks:

| Commit | GCC 8.3 | Installed service | Foundation |
| --- | --- | --- | --- |
| a09bd08 | 40007229639 | 40007229743 | 40007229957 |
| e845d3e | 40008231190 | 40008231141 | 40008231081 |

All six runs succeed. The second row includes the changed installed-version
fixture on Windows/Ubuntu; the actual two-version branch still needs 0.2.5.

## Prepared workflow

`standalone-release.yml` runs on main/master and validates this feature branch
without publication. Manual dispatch defaults to no publication. Publishing is
additionally refused by code outside the exact core repository's main/master.
Version 0.2.4 can exercise the build/verification path but cannot publish the
new distribution; the first standalone release remains planned as 0.2.5.

The workflow builds production-namespace MSI, DEB, RPM and both portable formats
from the exact registry locks. It verifies relocated native lifecycle, Windows
private process trees, independent DEB/RPM extraction and actual Windows/Ubuntu
service identity/JWT/TLS/crash/reinstall/uninstall. For 0.2.5 it prepares a 0.2.4
seed from immutable prototype source `de46cea5776be19971716117b1c37dbf46012464`;
later versions use the preceding accepted tag. It does not claim that this seed
was a public standalone 0.2.4 release.

Collection requires the installed fixture's matching version and two-version
upgrade receipt. Each platform also supplies its native corresponding-source
companion. Cross-job verification requires exactly seven files from both
platforms and one source commit. Hosted receipts explicitly say that these
jobs do not prove real RDP or named Astra/RED OS OS/device acceptance.

Publication appends seven program/source files, checksums and a manifest to an
existing core Release. It requires an annotated tag pointing to the checked
source, verifies all existing conflicts before writing, preserves old core
assets/tags, uploads the manifest last and verifies server digests afterwards.
It never clobbers or retries an uncertain upload. A failed publish job may be
rerun using its original retained artifacts; a new build refuses partial upload
state. Complete releases are read back and skipped before rebuilding. Missing
or different public npm dependencies refuse a new build.

The core bootstrap now tolerates only the known standalone filenames alongside
its independently exact core asset set. This does not accept their content;
the standalone manifest/publisher owns that verification. Unknown assets and
changed core archives remain refused.

The official [download-artifact inputs](https://github.com/actions/download-artifact)
are used with explicit digest mismatch refusal. v8 resolves to commit
`9000827ccba6bdab643e8b6fd33ac0654aef8333`; other action pins reuse the already
executed installed-service workflow inputs.

## Current verification boundary

Twelve focused bootstrap/release tests pass: exact platform sets/source/upgrade,
real-RDP overclaim refusal, manifest-last ordering, preservation and idempotence,
conflicting/uncertain upload, partial-state/public-dependency refusal and
API endpoint/status/body bounds. Changed JS passes lint/format. The separate
history block `9efbef4` passes real local Git ancestry/deletion/tag-refusal tests.
The previous full counts 990/63 Windows and 965/90 Linux are not counts for these
new tests. Full regression and this workflow's first actual build remain open.

First actual run **40012365268** creates a successful plan, then Linux fails
before its RPM build: Docker implicitly looks for `Dockerfile` while the owned
recipe is named `RpmBuilder.Dockerfile`. Debug artifact **12526878130** confirms
the missing Dockerfile, not a package/OS failure. The command now supplies the
explicit recipe path. The old Windows job remains running independently; no
publication occurs from this feature branch. The corrected Linux path still
requires an actual follow-up run.

In that first run, Windows completes successfully: production MSI, private
supervisor/process-tree checks, portable verification, installed lifecycle and
collection. Publication remains skipped. The follow-up **40012757751** builds
the RPM image and copies inputs, then Linux fails with EACCES creating its build
directory: copied source belongs to the runner UID, while the capability-dropped
root process has no DAC override. Debug artifact **12526534226** proves the
ownership mismatch. The build container now runs as the actual runner UID/GID;
capability drop, no-new-privileges and disabled runtime network stay in place.
This corrected identity requires the following actual hosted verification.
Superseded feature-only release validations may now be cancelled by a newer
push, avoiding a wait behind an already failed Linux matrix while an unchanged
Windows case repeats. Main/master publication retains non-cancelling serialization;
its uploads must never be interrupted automatically. The first Windows baseline
success remains independently recorded above.

Full local Linux check for `1a4fe88` passes **972 / 90 skips / zero failures**,
child exit zero, in 257 seconds. Receipt/log:
`build/iteration-451-check-linux-final.{json,log}`. Windows full check remains
live at this checkpoint. These Node results do not accept the pending RPM step.

The pipeline currently requires public version-matching npm inputs. Prepublication
Windows upgrade verification still needs candidate-archive transport into CI;
the local offline candidate assembler alone does not accept that missing gate.
Then prepare aligned 0.2.5, run native/full/external/installer/real-lab acceptance,
publish exact libraries and verify actual main/master installer delivery. Only
after those gates clean project-owned artifacts, consolidate docs and stop.

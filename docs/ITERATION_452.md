# Iteration 452 — prepublication CI candidate transport

Work remains on the standalone feature; product manifests are still **0.2.4**.
The baseline production-namespace pipeline from iteration 451 has passed on
Windows/Ubuntu. No 0.2.5 package/tag or candidate draft is created by this block.

Optional `packaging/standalone/candidate-release.json` is public build metadata:
schema 1, product version, source commit and a derived tag
`standalone-candidate-<version>-<first-12-source-hex>`. Unknown fields, mismatched
versions/tags and oversized/nonregular inputs are refused. The file is absent
from normal publication checkouts. A publish plan refuses its presence.

The CI-only helper reads one exact annotated tag and matching private draft
prerelease in the existing core repository. It selects only the five required
core/platform archives, bounds each to 128 MiB, checks server SHA-256 plus the
committed lock SHA-512, and runs the existing actual package-metadata verifier.
The source checkout must match the draft's application/native/build-tool inputs;
Git fetch/diff receives a sanitized environment without the GitHub token.

Binary asset redirects are manual: Authorization is used only at api.github.com,
never forwarded to the explicitly allowed GitHub asset-storage hosts. Streaming
limits precede writes, incomplete files are removed individually, and invalid
or missing candidate inputs cannot fall back to a registry build. The contents
token is provided only to the download step, not the payload/npm/MSI/RPM steps.
The official [release asset API](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)
documents direct 200 or redirected 302 binary responses; both are handled.

Candidate mode propagates through the private payload, both platform receipts
and combined manifest as `candidateOnly: true`. It can run the full installed
upgrade tests but cannot publish: both source planning and final publisher
refuse it. Final release requires removing the pointer, verifying public npm
integrities and a fresh registry-only build. The release/0.2.5 branch also gets
the validation workflow while its publication remains disabled.

Nine focused candidate/cache/release tests pass. They cover all five stream
hashes, source-tag/draft binding, storage requests without auth, excess data,
hash drift, partial-file removal, foreign redirects, pointer/schema refusal,
and rejection of candidate-only publication before writes. The transport tests
use synthetic archive bytes and an injected metadata verifier; they do not claim
to have run an actual candidate draft/0.2.5 installer. Separate real-archive
metadata/cache acceptance remains iteration 449. Changed JS passes lint/format.
The preceding full counts 997/63 and 972/90 are not new counts for these tests.

Next: aligned 0.2.5 native/JS archives and exact production locks, actual draft
transport plus Windows/Ubuntu two-version upgrade, named lab acceptance and
public delivery. No old tag/archive is moved or repacked. Cleanup/docs follow
only after the requested releases are actually delivered.

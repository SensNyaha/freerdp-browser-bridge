# Iteration 152 — bounded public DVC ID and callback registry

Date: 2026-10-12. Implements SPECIFICATION §3.3 / ARCHITECTURE §11 after public
completion observation `80cd152`. Fixed registry uses public manager IDs, reserves
only live owned DATA_FIRST, preserves rejected-target caller ownership and joins
all callback retirement. Actual worker/addin registration remains open.

Seven public-ABI cases and five actual pinned drdynvc/fake-SVC cases pass. Linked
suite **61 cases / 6,282 assertions**, bundled CTest **18/18**, foundation CTest
**7/7** pass with /analyze /W4 /WX. Actual-host cases include raw/compressed
completion, refusal before second allocation, ignored unknown channel and logical
deadline requiring real host shutdown. No private SDK casts, dependency source/pin/
ABI/wire/capability changes. Synthetic reduced policies are not actual remote
resource/device acceptance. [Contract and remaining gates](DVC_CHANNEL_REGISTRY.md).

Full bundled `pnpm check` passes **498/498**, zero failures/cancellations.

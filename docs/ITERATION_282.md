# Iteration 282 — local OpenSSL X.509 validation cases

2026-10-18. Continues Stage 0 / SPECIFICATION §2.2 and §3 after the verified
[static OpenSSL build](ITERATION_281.md), commit `931b183`. Reuses that exact
pinned 3.6.5 GCC 12.4 no-shared/no-module/no-asm ASan/UBSan profile without a
library rebuild. Release, dependency versions and the shared bridge runtime
remain unchanged. No RDP, existing network service, device or host trust store
is used.

## Additional upstream cases

The unchanged recipes are inspected before execution. Two additional native
targets, `x509_internal_test` and `x509_req_test`, build against the same static
libraries; actual ELF dependencies confirm ASan/UBSan and no shared libcrypto.
The existing local `apps/openssl` handles the CLI fixtures. Generated test
wrappers/configuration are already verified in iteration 281.

- Focused internal X.509: **1 recipe / 1 top-level recipe test**, pass.
- Selected `test_internal_x509`, `test_verify`, `test_verify_store` and
  `test_x509_req`: **4 recipes / 220 top-level recipe tests**, pass in 26 seconds.
  Nested native TAP checks also execute; they are distinct from the harness
  count. FIPS-only preparation remains an explicit non-FIPS skip.
- The 208-case verify recipe checks expected success/refusal for trust roots,
  CA/purpose/EKU, critical extensions, expiry, partial chains, name constraints,
  policy and strict-mode variants. Its original helper explicitly uses
  `-auth_level 1`; permissive/strict variants are deliberate upstream cases.
  This does not change the bridge's TLS policy or establish its host/name checks.
- The 10-case store recipe uses only pinned test keys and locally produced
  CSR/certificate files; no external CA, persistent trust change or session
  credential is involved. CSR tests also check invalid versions/extensions.
- Successful output contains no ASan/LSan/UBSan diagnostic. Expected-negative
  CLI tests could redirect stderr, so **15 retained result files** are also
  scanned with finite file/count/aggregate bounds; no diagnostic marker occurs.

Both static archive hashes remain exactly as recorded in iteration 281.
`apps/openssl` SHA-256 stays
`dc924192a6b7a8636c4db36d8b2ae0780e15b2424602843abd0751f1e132fb66`.
All active source files still equal the independently patched reference.
No source/test correction or sanitizer suppression is necessary.

## Evidence and limits

The same restricted UID1000/read-only/no-network/no-new-privileges fixture is
used, with 300-second recipe-group deadlines. Host `build/` retains
`iteration-282-verify.log`, exported focused/selected text results and
`iteration-282-receipt.json`. Local runner `build/iteration-282-verify.py`
SHA-256:
`a04843108254e262c60914b847c277aa25afbf10fb8dcb99f753892de320cf7b`.

This adds local certificate/data-helper acceptance. It is not actual RDP/TLS
transport, shared-library selection, all OpenSSL algorithms/tests, assembly,
fuzz/platform/CI or complete Stage 0 acceptance. Bridge native/Node code and
loader remain unchanged; the iteration 280 checks remain separate evidence.
All earlier failure/diagnostic reports are preserved.

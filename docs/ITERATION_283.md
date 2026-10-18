# Iteration 283 — local SSL contexts and memory BIO buffers

2026-10-18. Continues Stage 0 / SPECIFICATION §2.2 and §3 after the local
[X.509 cases](ITERATION_282.md), commit `57ce0e6`. Reuses the exact pinned
OpenSSL 3.6.5 GCC 12.4 static C-only ASan/UBSan libraries from iteration 281.
No library rebuild, production source, dependency version, Release or shared
bridge loader change. No RDP, external service or device access is used.

## Selected transport and tests

Upstream recipes and helper call paths are inspected before execution.
`sslbuffertest` calls `create_ssl_objects()`, which creates `BIO_s_mem()` pairs,
then performs handshakes and application-data exchanges in the same process.
The separate socket helper `create_ssl_objects2()` is not selected. TLSProxy
version/session/record recipes require socket infrastructure and are not run.

Three additional targets build unchanged upstream code: `ssl_ctx_test`,
`ssl_test_ctx_test` and `sslbuffertest`. All **five additional C commands** have
ASan, UBSan and PEDANTIC flags. Each executable has actual libasan/libubsan ELF
dependencies and no shared libssl/libcrypto dependency.

- Focused `test_ssl_ctx`: **1 recipe / 1 top-level recipe test**, pass.
- Selected `test_ssl_ctx`, `test_ssl_test_ctx`, `test_sslbuffers`:
  **3 recipes / 3 top-level recipe tests**, pass, with native nested TAP cases.
- Buffer tests execute **nine** allocation/free variants and **four** refusal
  cases around partial record/header/body/application reads. All 13 available
  variants pass. The four additional dynamic-engine pipeline variants are not
  in this no-module/static profile and are not claimed as covered.
- Read retries are bounded by the upstream 100-attempt limit; writes allow two
  attempts and each data exchange repeats twice. Source-owned certificate/key
  fixtures are used for the in-memory endpoints, not lab/session credentials.
- Complete captured output has no ASan/LSan/UBSan diagnostic. There are no
  retained side files for these groups; diagnostic output is in their TAP logs.
  The FIPS-only preparation recipe is an explicit non-FIPS skip.
- Both static library hashes and the `apps/openssl` hash remain identical to
  iterations 281/282. Every active source still equals the independently patched
  reference. No source/test correction or sanitizer suppression is needed.

These cases exercise local context/config parsing, handshakes and buffer
ownership. They do not establish the shared OpenSSL bridge runtime, socket/TLS
interop, full algorithms/tests, dynamic engines, assembly, fuzz/platform/CI or
actual RDP acceptance. Stage 0 remains IN PROGRESS.

## Evidence

The same UID1000/read-only/no-network/no-new-privileges restricted fixture is
used. Each recipe group has a 180-second bound. Host `build/` retains
`iteration-283-memory-ssl.log`, exported focused/selected text results and
`iteration-283-receipt.json`. Local runner
`build/iteration-283-memory-ssl.py` SHA-256:
`a8f5917e9ea094a5c48618a33640d15e5275ea57a55fc763f6bdc80b3d0840b4`.
Previous diagnostic/failure reports remain preserved. Bridge native/Node code
and loader are unchanged; iteration 280 remains their separate regression
evidence, not a new test result for this static profile.

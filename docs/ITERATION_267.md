# Iteration 267 — Ubuntu GCC 12 sanitizer worker under full Node regression

2026-10-16. Extends Stage 0/1 standard PIE foundation acceptance to the actual
Node supervisor and worker processes. A new restricted Ubuntu container uses
the complete tracked-source archive of `2885a57` from iteration 264 (SHA-256
`aabca591dd1c0705658dc778f4d6af0ac3a4f4a2f3329d7368fe629b0a14cc09`).
Its new source tree initially has no build, node_modules, .deps, .local-tests
or .git. Prepared public Catch2/compiler tools are reused; no native SDK or
laboratory data is transferred.

The public input bundle contains only Node 24 binary/headers, pnpm and cached
public packages. Bundle SHA-256 is
`c6f64ae9ae68c3c55948ba26d7df808a962d6789c2dc540a6d4e63b4021a1591`;
the Node binary retains SHA-256
`7fde7b8afa198da66257f42ee2001d874c7355631e6d1579a5fb5ef1f246df4c`.
Frozen offline installation with lifecycle scripts disabled installs all 152
packages with no download. Node reports 24.21.0 and pnpm 10.11.0.

The ordinary sanitizers preset explicitly selects Ubuntu g++-12 12.4.0, with
distribution libasan8/libubsan1 14.2. New source compilation, actual C++20 library
probe and native CTest **16/16** pass. Readelf confirms PIE worker/ipc-tests;
ldd confirms the worker's ASan/UBSan runtime dependencies. There are no non-PIE,
ASLR/seccomp, leak-suppression or sanitizer-options workarounds.

Full pnpm check builds all four TypeScript packages, lints/formats and passes
**569 / 146 platform/profile skips / 715**, zero failures. This archive predates
the Windows-only test added in iteration 266. Actual sanitized-worker cases
include 100 sequential HELLO/heartbeat/shutdown lifecycles with zero leaked
resources, parent-death cleanup and paused-output/raw-parent-flood termination.
The parent Node process runs normally, without LD_PRELOAD; ASan/UBSan runs in
the separate worker. BRIDGE_NODE_IPC and FreeRDP remain OFF, so addon/linked RDP
cases skip explicitly. The lockfile remains byte-identical.

Worker SHA-256:
`669234609e6928c37b1b5fe4d0b11317ec7bac15cd3c74a2ae895b84d0359ce7`.
Execution retains UID1000, read-only root, network none, init, dropped
capabilities, no-new-privileges, two CPUs / 4 GiB memory, a bounded executable
3 GiB build tmpfs and noexec 128 MiB /tmp. Docker cp initially refused the
read-only rootfs; bounded stdin streaming writes the same hash-checked archives
into the writable build tmpfs without weakening the container restrictions.
Existing Node module-type/dependency deprecation warnings remain non-failing.

## Separate addon baseline remains open

Before attempting another addon sanitizer run, three controls in the existing
Ubuntu GCC 12 verifier preload its libasan into the same public Node 24 binary:
plain evaluation, crypto and a worker thread. No bridge/addon/FreeRDP is loaded.
With default sanitizer settings all exit **1**: LSan reports 56, 56 and 88 bytes,
with allocation stacks in Node Contextify/OpenSSL. These are failed controls,
not addon sanitizer passes or a diagnosis of production leaks. No suppression
or detect_leaks override is added. A compatible instrumented Node/runtime
baseline and a complete successful addon suite remain required. The historical
addon child timeout from iteration 196 is also still unexplained.

Evidence: `build/iteration-267-ubuntu-node-controls.log`,
`build/iteration-267-input-transfer.log`,
`build/iteration-267-ubuntu-node-full.log`,
`build/iteration-267-ubuntu-receipt.log`.
Bounded local runner `build/iteration-267-ubuntu-node.py` SHA-256:
`9ca946490743ad21f02a99565dfa935c7f33cc6234197b40560512504698ab96`.
The generated container receipt is `/work/build/receipt.json`.

This accepts the named local Ubuntu GNU 12 standard PIE foundation plus full
Node/sanitized-worker lifecycle regression. It does not establish an instrumented
Node addon, upstream FreeRDP/codecs, actual CI or RDP/device/resource acceptance.
The GNU minimum stays 12; Stage 0 and Stage 1 remain IN PROGRESS.

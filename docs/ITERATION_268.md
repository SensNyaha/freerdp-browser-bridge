# Iteration 268 — linked sanitizer run exposes pinned DSP reset leaks

2026-10-16. Continues Stage 0/1 after the passing GCC 12 foundation in iteration
267. A separate Debug consumer in the same restricted Ubuntu fixture compiles
bridge-owned linked C++ with GCC 12.4 ASan/UBSan, standard PIE and default
sanitizer options. The public source archive remains `2885a57`; no native source
changes are overlaid. Node addon is OFF; the external FreeRDP/private codecs are
the previously verified, uninstrumented Release SDK, not an upstream sanitizer
build. No RDP host/device/network is used.

An independently hash-checked SDK/dependency export has SHA-256
`454060c1a9bb65315160701c44ec4d9e90e16ab1b8c4bc1efa7eab2301a96cfc`.
It retains SDK receipt `7e864b343083e7f94ef9e651bc6b6405c56a6473d0404567bff017f683b52455`,
dependency receipt `20783b8d6cc5daf079e2f4ff9bd9a190be69814cb1088eb7afb4fe4ca3c0a32c`
and the clean exact FreeRDP source pin. Configure verifies all three private SDK
CMake origins and private OpenSSL/ZLIB headers/libraries after relocation.
All 398 compile/link steps succeed; worker/probe are actual PIE with ASan/UBSan
and the expected FreeRDP/codec runtime dependencies.

CTest is **30 passed / 1 failed / 31**. AUDIN's 57 cases / 4,244 assertions all
pass, then LeakSanitizer exits 1 with **292,104 bytes / six opus_encoder_create
allocations**. This is a failed sanitizer gate. The runner stops at CTest;
subsequent CLI/runtime-probe/Node checks are not executed or claimed. No leak
suppression, detect_leaks override or test removal is used.

A smaller standalone C++20 ASan/UBSan reproducer uses only public
`freerdp_dsp_context_new/reset/free`, with four PCM resets of each encoder and
decoder context. After normal context destruction it exits 1 with **227,760
bytes / six allocations**: three lost Opus encoders and three decoders. It loads
no AUDIN plugin or Node. The first compile failed at link time because the
standalone command lacked the private dependency rpath-link; the corrected
private-prefix link reproduces the leak.

The pinned `libfreerdp/codec/dsp.c` reset creates and assigns a fresh Opus encoder
or decoder for a supported sample rate without releasing the preceding pointer;
context_free can release only the latest allocation. This also occurs for the
PCM resets used by the AUDIN fixtures. The source input has SHA-256
`5ea78986e26772e7d0ff9bef5087cc7981b61490e3bf7f449b510b481281971a`.
A verified build-copy ownership correction and successful repeat remain required;
the exact source checkout/public headers must remain unchanged.

Evidence: `build/iteration-268-sdk-input.log`,
`build/iteration-268-transfer.log`,
`build/iteration-268-linked-sanitizers.log`,
`build/iteration-268-linked-elf.log`,
`build/iteration-268-dsp-reset-repro.log`,
`build/iteration-268-dsp-reset-repro-repeat.log`.
Bounded runner `build/iteration-268-linked-sanitizers.py` SHA-256:
`c48cd3ddb8a75a04a3aebbc19b5500720f934282600b17233496fa81f8a064aa`.
This failure does not invalidate the separately passing foundation/Release
observations, but linked resource/sanitizer acceptance stays open.

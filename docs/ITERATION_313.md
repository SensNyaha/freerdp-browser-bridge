# Iteration 313 — symmetric Windows SDK/consumer CRT admission

2026-10-19. Completes the reverse configuration case introduced by
[isolated Debug SDK support](ITERATION_312.md), under TODO Stage 0 and the
SPECIFICATION §2.12 resource-test prerequisite. Release compiler settings and
dependency pins remain unchanged. Existing Release artifacts stay protected;
the positive control uses a new source-only output directory.

Receipt-backed Windows consumers now require a matching SDK build type and
dynamic CRT for both Debug and Release. A historical Release receipt can omit
the new build-type field if its actual cache identifies Release and the
corresponding dynamic CRT. Unknown/static/mismatched CRT configurations refuse
before source output preparation. The existing Debug helper delegates to the
same check, preserving its fixed error. No assertion, timeout or runtime policy
is relaxed.

Windows focused profile/SDK/receipt/compiler checks pass **13/13**. An actual
`clean-bundled` invocation with the verified Debug SDK now refuses with the
fixed Release/CRT error; the set of consumer output directories is unchanged.
The positive control rebuilds the current bridge/helper as Release using the
existing verified `freerdp-source-clean-pf2yqW` Release SDK and its unchanged
bound dependency receipt. All native source/pin inputs remain fixed.

The new `build/native-clean-xPANWQ` consumer completes all 403 compile/link
steps. Its actual CMake receipt records Release, Ninja, CMake 3.31.6-msvc6 and
MSVC 19.44.35228.0. All 346 native files / 1,910,427 bytes remain unchanged,
with the same source hash as the Debug control:
`d0069a38cb184fca4baaea2e99c9d2e03bc7ca0d67dbb6bcf3178cf9674a8c39`.
Native CTest passes **31/31** in 26.83 s; actual process/TLS/physical-path
checks pass **27 / 1 skip** in 45.31 s. Existing SDK/dependency receipts remain
bound and unchanged. New artifact hashes are worker
`8a92520b51cd5561a958d6363465d3fb5f02edb1d63b4f0bf382c2ddd21394f8`, helper
`5ab7ea0455bcd64b55d3bbee92612e07e175c63d9a5b7518469d7c9b580f8e56`.

Resource focus passes **27/27** in 91.64 s. Its 40-worker/five-replacement case
observes 873 paired CPU/RSS queries, zero watchdog failures, maximum query
2,704 ms and joined empty runtime/admission. Sampled worker peak RSS is
17,768,448 bytes; this is unconnected lifecycle evidence, not a connected or
total-session budget. The runtime probe passes codec roundtrips and five local
symbol origins. All eleven copied SDK DLLs and two selected dependency DLLs
match their source bytes. Seven protected pre-existing Release/pin inputs
retain their earlier hashes.

Full Linux `pnpm check` passes build/lint/format and **644 passed / 151
platform/profile skips / 795 total / zero failures**, Node duration 130.21 s.
Its common profile group passes **12 / 1 Windows-only skip** and existing
foundation CTest **17/17**. No new Linux linked/native source build is claimed.
Full Windows `pnpm check` using the new Release consumer also passes
build/lint/format and **741 passed / 51 platform/profile skips / 792 total /
zero failures**, Node duration 545.40 s. The capacity and native crash controls
pass inside that full run. Final protected-input/origin audit, local document
links and `git diff --check` pass. This accepts symmetric receipt-backed CRT
admission and the named new local source-consumer profile only.
Evidence is in `build/iteration-313-{profile,reverse-refusal,windows-release-native,windows-resource-focus,module-probe,inputs-origins,windows-full,linux-full}.log`
and the exact receipt/transfer/audit/run scripts.
Connected RDP/resource, production package/helper adoption,
private dependency/Debug CRT distribution, broader platform/CI and complete
resource/soak gates remain open.

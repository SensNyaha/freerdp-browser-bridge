# Iteration 269 — pinned DSP reset ownership correction

2026-10-16. Implements SPECIFICATION §2.6 audio and §3 resource cleanup, with
Stage 0 reproducible SDK identity. The original failed linked sanitizer run and
independent public reproducer remain in [iteration 268](ITERATION_268.md).

## Implementation and identity

The exact FreeRDP/WinPR 3.32.1 checkout at
`bf217a504e54cc719880c228e82353382cd7d4fa` stays clean. The build generates one
corrected copy of `libfreerdp/codec/dsp.c` and replaces only that source in the
actual `freerdp-codecs` target. It destroys/nulls preceding Opus encoder/decoder
state before reset assigns its next format. Public headers/ABI stay unchanged.
[Bounded source and SDK admission contract](FREERDP_OVERRIDES.md).

Canonical LF input SHA-256:
`40715894dc14e2869c64bbf3ebfcf209fe12483890ffb709133d7034f32ad10f`.
Generated LF C source:
`f1da137622368914628be9ef79888186bb6a9a1dc7e5fa77771535c061dae35a`.
Canonical recipe:
`6e0d1b10ae4e85effeaf4f2e91b15a140028d4bc7c6f46fb6f4ab5c6923847dd`.

The SDK receipt includes `sourceOverrides`; linked configure refuses missing,
stale, malformed or oversized override metadata. Two portable tests exercise
source and metadata refusal without replacing an existing output. The SDK and
native install retain the JSON metadata, recipe and original license. Existing
SDKs must be rebuilt before their consumers. The release 223 cohort is unchanged.

## Failing before / passing after

The new public DSP regression resets encoder and decoder contexts through five
PCM formats, including supported and unsupported Opus rates. Before the fix its
12 assertions pass but LSan reports 176,192 lost bytes / six allocations and
exits 1. With the rebuilt SDK it passes and exits 0. The independent smaller
public new/reset/free reproducer also changes from exit 1 / 227,760 lost bytes
to exit 0 with no sanitizer diagnostics. No suppression or sanitizer override is
used. External SDK/private codecs are uninstrumented Release binaries; this does
not claim full upstream sanitizer coverage.

## Platform verification

| Profile | Native CTest | Full pnpm check |
| --- | --- | --- |
| Windows x64 MSVC, rebuilt SDK and source-only consumer | 30/30 | 666 passed, 49 skips, 715 total, zero failures |
| Linux amd64 GCC 12.2 Release, rebuilt SDK and source-only consumer | 31/31 | 659 passed, 59 skips, 718 total, zero failures |
| Ubuntu GCC 12.4 standard PIE ASan/UBSan bridge-owned linked code | 31/31 | 633 passed, 84 skips, 717 total, zero failures |

Windows SDK build/install has 388 steps, exact SDK identity and 20 channels;
Linux has 399 steps, exact identity and 22 channels. Both SDK probe CTests pass.
New consumers export 332 source files with content identity
`c7e8f823c7573bceb1d8d16fec6bed6c231ee9b0e557c21e6c5ce047c02516b8`.
Focused process/TLS checks pass Windows 27 / one platform skip and Linux 40/40.

SDK receipts: Windows
`d9ceba7800de96001fe93ae7b431db635c35198b12d6ed28e182f701cf0190cd`,
Linux `7b23bba9273511bd9b8275e296b0e1a88644927e98beb5d8a53b967023fb40e5`.
Workers: Windows
`2f4fa75686d1e7df2121bca0408ea5d70a99ccfc82859efbc479c92a5000d49f`,
Linux Release `bbe379c65e0830afd26ba6928a446cf93d7e55f1bcb3dda0395c4a4cf7c4233c`,
Ubuntu sanitized `31acd6d1b34afb69014f9726157eeebba7a6f9b4ebff47a2bdaad84125cc2227`.

Ubuntu starts from archive `2885a57` with explicit current correction/test
overlays, not a fresh archive of the final commit. It predates one Windows-only
test added in iteration 266, explaining its one fewer total case. The addon is
OFF; ordinary parent Node runs without preload. UID1000, read-only root, no
network, init, dropped capabilities, no-new-privileges and bounded executable
build tmpfs remain in effect. Actual native worker lifecycle and strict local
TLS cases execute. The linked runtime probe verifies private modules and codec /
libudev roundtrips. No lab connection, physical capture or credentials are used.

Windows/Linux installed copies both pass independent relocation 1/1. Installed
override metadata equals its SDK input byte for byte, and the packaged recipe
matches the canonical hash. These are install-stage checks; no new ZIP/TGZ,
application/image SBOM or licensing clearance is claimed by this iteration.

## Retained preparation failures

- Initial override generation exposed Windows CRLF output differences. Final
  generation uses explicit LF and checks exact output bytes; both SDKs agree.
  Initial shell invocation also lost a CMake argument extension; structured /
  quoted arguments are used for successful runs.
- The first Ubuntu full Node check fails 61 TLS cases because the minimal image
  lacks the OpenSSL CLI. A bounded public CLI and matching libraries are added
  only to writable fixture tools. Their tar SHA-256 is
  `28fe84209015b28d2618189502f8e4a3f70274b94f63023b3b701f2ba62c4e57`.
  The child wrapper selects its own matching libraries/config; no worker preload
  or TLS bypass is used. Narrow TLS repeat passes 7/7. The Docker recipe now
  lists the CLI prerequisite but the updated image was not built in this block.
- The next full run fails ten Linux media tests because they incorrectly expect
  primary seqpacket even when no addon/manifest is installed. Fixtures now assert
  automatic primary for a paired worker and the documented framed fallback for
  an unpaired worker. The narrow input/output/carrier repeat passes 20/20, then
  the final full run passes. No actual cases are skipped to hide failures.

Evidence under ignored build/: `iteration-269-dsp-before.log`,
`iteration-269-dsp-after.log`, `iteration-269-windows-sdk.log`,
`iteration-269-windows-consumer.log`, `iteration-269-windows-full-check.log`,
`iteration-269-linux-sdk.log` (initial failure),
`iteration-269-linux-sdk-repeat.log`, `iteration-269-linux-consumer.log`,
`iteration-269-linux-full-check.log`, `iteration-269-linked-after.log`,
`iteration-269-linked-full-repeat.log`, `iteration-269-linked-profile-tests.log`,
`iteration-269-linked-full-final.log`, `iteration-269-windows-relocation.log`,
`iteration-269-linux-install-relocation.log`. Portable guard tests, formatting /
lint and git whitespace checks also pass.

This accepts the named reset correction and local linked bridge sanitizer slice.
Stages 0/1/6 remain IN PROGRESS. Complete upstream/addon sanitizer, connected
audio/device/platform/resource/CI and release review gates remain open.

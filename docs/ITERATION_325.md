# Iteration 325 — capability-gated IP-family selection

Requirement: SPECIFICATION §2.1/2.10, existing CONFIG_SCHEMA target fields and
TODO Stage 9. [Contract and exact compatibility](IP_SETTINGS.md).

The Node/public configuration now projects optional preferIPv6 and forced
4/6/null through additive ipSettings capability and schema-12 canonical bytes.
Any explicit false/null still requires capability before CONFIGURE/SECRET;
omission preserves old message layouts and SDK defaults. Preference false means
OS resolver order, true moves IPv6 first with fallback; forcing filters candidates.
Only checked public pinned FreeRDP settings are used, independently preserving
unselected values. No schema field, secret class, resolver/cache, queue, arbitrary
argv, dependency version, SDK override or Release compiler flag is added/changed.

## Current verified evidence

Portable wire/profile checks pass **17/17**, including independent schema-12
golden bytes, composition with appearance/clipboard, twelve canonical selections,
invalid scalar/mask/unknown-bit/prerequisite refusals and unchanged legacy bytes.
Synthetic IPC passes **5/5**, separating old/missing capability, false/null early
refusal, all twelve optional preference/family combinations and appearance
composition. These peers do not run FreeRDP or connect to RDP.

The new isolated Windows source consumer `build/native-clean-7dEHpn` builds all
**407** steps with unchanged verified pinned SDK/dependency receipts, MSVC
19.44.35228.0 / Ninja / CMake 3.31.6-msvc6 and matched Release CRT. CTest passes
**33/33**, lifecycle/process/TLS **27 / 1 profile skip**. Public IP setter tests
pass **2 cases / 322 assertions**; native v12 parsing passes **1 / 929**, including
all truncated prefixes, prior-schema refusal and selected-byte boundary checks.
Fresh actual private module/codec probe passes; prior artifacts remain separate.

Windows actual FreeRDP / synthetic loopback TLS passes **7/7**: fixture host
refusal, IPv4, forced IPv4 with prefer-6, prefer-6 on an IPv4 literal, actual ::1
IPv6, and both opposite-family refusals. Allowed cases reach the certificate
prompt and deny it; opposite-family cases accept zero sockets. All send zero
TLS application bytes and preserve heartbeat / joined PID/runtime cleanup.
This is native transport integration, not IPv6 RDP desktop acceptance.

The new Linux GCC 13.3.0 Debug foundation `build/native-clean-Lw4Jdy` builds
264 steps, passes CTest **17/17** and lifecycle **15 / 1 absent-primary skip**.
It has no SDK/RDP/network and does not accept linked Linux IP selection. Both
source copies bind **350 files / 1,924,792 bytes**, remain unchanged and share:
`9ea6f7d12a2d4677f3b1cac101da71c87147cbc93deb030aacd3b7db398c12bd`.

New worker SHA-256:
`c36bb59dca92920ef3441e6912d091595a2d3ce435d0cffcb576200a3c613c2f`.
Colocated helper:
`357f6538a9f34bb41db3334bce9d00e881e9e6c1a722aa2d78a153b61db5a0d0`.

## Authorized Windows RDP

The two fixed actual lab cases pass: prefer false / force 4 and prefer true
with the same authorized IPv4 literal. Each receives 1920×1080 JPEG
(**47,290 / 34,808 bytes**), actual heartbeat and a second ready heartbeat;
joined close leaves an empty runtime and absent PID. Exact approved session-only
fingerprint and ignored credentials stay in their existing contract. No remote
app/input/device/system action or image persistence occurs. An IPv4 literal has
no IPv6 candidate; this is not dual-stack DNS ordering or actual IPv6 RDP evidence.

CLI guards pass **3/3** on Windows, including the new helper. Logs:
`build/iteration-325-{wire-focus,synthetic-focus,native-ip-focus,sdk-ip,
native-wire,windows-native-clean,linux-native,runtime-probe,lab-cli,rdp-ip}.log`.

Linux focused checks pass **26 / 6 absent-FreeRDP skips / 32 total**. Full Linux
`pnpm check` passes build/lint/format and Node **674 passed / 160 skips / 834
total / zero failures** (135.20 s), using the new foundation worker. Linked
Windows remains the only current native IP transport profile. Both source-copy
hashes, five actual private module origins, eleven SDK DLLs, four codec
roundtrips, four preserved old consumer artifacts, seven protected inputs and
both actual lab cleanup triples pass audit. Local documentation links and
`git diff --check` pass.

Full Windows `pnpm check` passes build/lint/format and Node **780 passed /
51 skips / 831 total / zero failures** (577.75 s), using the new linked worker.
Full logs are `build/iteration-325-{windows-full,linux-full}.log`. C++
clang-format dry-run/Werror, post-regression artifact/input audits, local
documentation links and `git diff --check` pass. Neither new source output is
production archive/package adoption.

Manual UI, linked Linux, dual-stack DNS/fallback history, actual IPv6 RDP/server
profiles, resource/latency/soak and all unrelated gates remain open.

# Iteration 193 — bounded Linux primary carrier framing

2026-10-14. Implements the Stage 1 primary SOCK_SEQPACKET framing prerequisite
under PROTOCOL section 6 without changing RWI1. [Carrier contract](LINUX_SEQPACKET.md).

The versioned 16-byte RWS1 prefix bounds datagrams to 16,400 bytes and validates
the first RWI1 header before exposing any declared body. Fixed scalar progression
admits only one exact ordered record; refusal is terminal and partial EOF remains
observable. No worker/socket/supervisor activation is claimed by this block.

Verification:

- Portable codec **5 cases / 2,242 assertions**: independent HELLO vector,
  truncations, malformed inner/outer claims, a maximum JPEG across 513 chunks,
  borrowed storage, partial EOF and interleaving/restart/replay refusal.
- Clang 14 libFuzzer with ASan/UBSan: **3,628,874 executions in 21 seconds**,
  zero reported errors. Whole datagrams and size-prefixed chunk sequences are
  seeded; a 20-second CI command is prepared, actual CI remains unrun.
- Windows foundation CTest **11/11**, linked CTest **23/23**, Node **528/528**.
- Linux linked CTest **22/22**, portable ASan/UBSan CTest **10/10** with the
  previously documented local non-PIE workaround; Node **453 passed / 75 skipped /
  zero failures**, 528 cases.

The SDK container's Clang executable initially lacked compiler-rt archives;
the first fuzz link failed. The matching Clang 14 runtime was copied from the
project's already verified local fuzz image into the builder, then the same
target passed. Compiler runtime is not included in the native package; no
production warning/sanitizer flags or host protection settings were disabled.
Local evidence: `build/iteration-193-*`.

Next required block is actual AF_UNIX packet transport ownership/read/write
verification, followed by inherited descriptor and Node supervisor activation.
Current production transport remains the bounded stream fallback from iteration
192. Linux connected RDP/audio/release and platform/resource/soak gates remain.

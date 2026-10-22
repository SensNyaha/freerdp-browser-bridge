# Iteration 408 — Astra ISO kernel foundation execution

Date: 2026-10-22. Compiler feature branch `feature/astra17-gcc83`, foundation
checkpoint `f9758b5`, documentation checkpoint `ec8f6fc`. No production code
changes or shared-branch merge in this block. The stable `v0.1.0` tag stays put.

## Requirement and fixture

The user requires GCC 8.3.0/Astra Linux 1.7.5 and mandatory RED OS 7.3/GCC 11.
They supplied the installation ISO because no installed Astra host is available.
[Iteration 407](ITERATION_407.md) already verifies compiler foundation, actual
RED OS, Windows full foundation regression and the ISO library runtime.

An additional QEMU TCG guest boots the **actual ISO kernel**, not the Docker
host kernel. The image identifies itself in the serial log as:

```
Linux 6.1.50-1-generic #astra4+ci68
gcc-8 (AstraLinuxSE 8.3.0-6) 8.3.0
```

The guest root is a bounded custom initramfs of the checked ISO runtime packages,
ISO BusyBox, the exact GCC 8.3 foundation worker/tests/IPC-only addon, prepared
CMake and official Node 24.21.0. There is no guest disk, network or installed
system. PID 1 mounts guest proc/sys/dev, runs unchanged tests, records the result
and powers off. It does not change a host hypervisor or existing VM.

QEMU is 7.2.22 from signed Debian Bookworm packages in a separate owned tool
image. Runtime has no network, all capabilities dropped, no-new-privileges,
2 host CPUs / 3 GiB / 128 PIDs. QEMU uses q35/TCG, CPU max, 2 guest CPUs,
1,536 MiB RAM, no default devices/display/monitor/NIC, serial output and the
explicit ISO kernel/custom initramfs. The outer execution deadline is 240 s;
CTest retains its existing 30 s maximum and the compatibility tests retain 15 s.

## Results

- Foundation CTest: **20/20**, zero failures, 84.58 s under TCG.
- Actual Node 24 IPC-only addon socket/lifecycle suite: **14/14**, zero skips
  or failures, 18.12 s. This repeats inherited descriptor handshake, malformed
  records, bounded queues, original deadlines, readiness, transferred buffers,
  Worker environment cleanup and joined descriptor/runtime retirement.
- Serial markers `ASTRA_GUEST_ACCEPTED` and `ASTRA_GUEST_EXIT=0` are present.
  The guest performs ACPI poweroff after 127.87 guest seconds; the owned outer
  container exits 0. No test deadline or bridge warning policy was relaxed.

The exact input hashes are:

| Input | SHA-256 |
| --- | --- |
| Original 5,117,478,912-byte ISO | `91236b4f3373773681da7d89982053ee76bcaba41467178f26a7678c0abaf7ed` |
| `install.amd/vmlinuz` | `1d5f6de0aef7bc85d5a08a7518fba420c2286c58f1d639c0cbd698e95b24a526` |
| ISO BusyBox udeb 1:1.30.1-4+ci202306061526+astra4 | `97035532475e7e6919f9a1218968de475f1de2198d8b747409ddb891c59f6c16` |
| Custom initramfs, 199,874,552 compressed bytes | `b503386e061e7a6d1c92c7d96e3a4db7306ed34d6987e1a79f9c9c21f108c6e1` |

BusyBox's 162,436-byte size and SHA-256 match the ISO installer package index.
The 17 runtime packages retain iteration 407's index checks. Initramfs generation
limits individual regular-file data to 128 MiB, total data to 1 GiB and entries
to 40,000; actual input is 617,362,339 data bytes / 11,254 entries. Device nodes
are encoded as cpio metadata rather than created on the host filesystem.

Retained local evidence: ignored `build/iteration-407-astra-kernel-check.log`,
`iteration-407-astra-initramfs.log`, `iteration-407-astra-qemu-image.log` and
the kernel/runtime package receipts and fixture scripts from iteration 407.

## Dependency build and remaining gates

The separate GCC 8.3, network-disabled, binary-cache-disabled source rebuild
passes Zlib, OpenSSL 3.6.5, ICU 78.3 host and target libraries, and CUPS 2.4.20.
krb5 first refuses the missing `autoconf-archive` prerequisite. Its architecture
independent m4 macros are copied from the prepared SDK (Debian package
20220903-3), archive SHA-256
`1ca23e65080c3d54848168fd41287ed1d7504b6245931fe34f3e3fc6dbf48078`.
The next source attempt compiles krb5 and stops at absent `yacc` while generating
`getdate.c`; its warnings/errors and partial-source build are retained.
The source-build resume uses its own vcpkg transaction updates and outputs,
preserves no-download/binary-cache-clear flags, and marks the receipt as resumed.
It does not substitute prepared third-party library binaries.

NASM 3.01, requested by pinned vcpkg, is independently source-built with GCC 8.3
from the [official NASM release](https://www.nasm.us/pub/nasm/releasebuilds/3.01/).
It installs only in the owned container's tool prefix; OpenH264 assembly flags
are unchanged. GNU Bison 3.8.2 also source-builds and installs as the missing yacc
tool; source SHA-512 is
`d4d23af6671406e97257892f90651b67f2ab95219831372be032190b7156c10a3435d457857e677445df8b2327aacccc15344acbbc3808a6f332a93cce23b444`.
The dependency source build resumes with both tools present.
No additional dependency or FreeRDP acceptance is claimed before completion.

This guest is **kernel + unpacked runtime foundation evidence**, not acceptance
of a complete installed Astra OS, its selected security level, mandatory access
control, installer, packaging or actual RDP/device features. Other ISO kernels
are not tested. Full private dependency/FreeRDP closure, the linked worker,
runtime origins/symbol floor, installed-Astra and RED OS product tests and real
RDP regression remain open. No platform or Stage 0 checkbox is marked complete.

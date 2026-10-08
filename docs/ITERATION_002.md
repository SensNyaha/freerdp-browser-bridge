# Iteration 2: private native dependencies and relocatable runtime

Date: 2026-10-08. Required by ADR-009, user instruction to ship local dependencies, and ADR-010.

Implementation commits: 7757d44 (native dependencies/bundle), b1c779d (build diagnostics API),
55e22cc (secure interactive lab helper). Full checks ran against this implementation before commits.

Implemented and verified on Windows x64/MSVC 19.44:

- Pinned vcpkg registry commit 2750401336fb7c95f6619657a46a7e798661341c; manifest release shared
  ZLIB 1.3.2 (port 2), OpenSSL 3.6.5 (port 1), libusb 1.0.30. No global integration/system install.
- Exact FreeRDP/WinPR 3.32.1 source bf217a504e54cc719880c228e82353382cd7d4fa built from clean
  pinned checkout with private dependency include/library paths and relative plugin paths.
- Worker now creates/frees a public FreeRDP client context with RAII. Version mismatch remains
  fatal; lifecycle=true and rdp=false. No server authentication or RDP/media/device support claimed.
- --build-features and /v1/build report compiled channel inventory and dependency versions;
  channels are verified against the actual FreeRDP static addin list after relocation.
- Common CPack native install layout includes release DLLs/CRT, licenses and pinned metadata;
  ZIP built, with no PDBs/import libraries/tools/sources/local lab files. SHA-256 sidecars generated.
- MSVC /W4 /WX and /analyze remain enabled for bridge code; SDK/dependency headers are external.
- Manual Windows/Linux bundled workflow added; not submitted or counted as passing CI.

Verification:

- Full pnpm check against build/bundled: TypeScript, ESLint, Prettier, 16/16 Node tests.
- 100 sequential linked FreeRDP workers: HELLO/heartbeat/shutdown, no leaked PIDs/directories.
- Actual worker crash isolation and parent-death cleanup; adversarial fake-worker deadline tests.
- CTest/Catch2 passes for both foundation and bundled profiles: 4 cases / 43 assertions each.
- Bundle relocation passes without dependency PATH: actual ZLIB compression roundtrip/runtime
  version, loaded ZLIB and FreeRDP DLL paths inside relocated bundle, exact FreeRDP version,
  matching static channels, all dependency license files, worker lifecycle and empty runtime root.
- Native-only ZIP approximately 4.7 MiB; installed payload approximately 11.5 MiB (25 files).
  This is a lifecycle development bundle, excluding Node.js, TypeScript API and future encoders.

The previous missing-ZLIB blocker is resolved. Windows serial and parallel clients are explicitly
OFF because pinned upstream does not implement these POSIX clients on Windows. FFmpeg/OpenH264
media providers and audio backends await their documented stages; codecProviders remains empty.
Linux builds/runtime, SOCK_SEQPACKET, sanitizer/fuzz CI, clean-machine acceptance and complete
MSI/EXE/DEB/RPM installers remain unverified. Stage 0/1 overall gates remain open.

A user-authorized XRDP lab is now TCP/3389 reachable. Non-secret endpoint details stay in ignored
.local-tests. Password persistence requires secure interactive entry through the DPAPI helper;
automatic storage embedding plaintext in a process command line was rejected. No login or
certificate bypass was attempted. Windows RDP lab acceptance remains outstanding.

Commands: docs/DEVELOPMENT.md. Tests: tests/integration/worker.test.mjs and
tests/packaging/relocate.test.mjs. Wire framing/HELLO_ACK are unchanged.

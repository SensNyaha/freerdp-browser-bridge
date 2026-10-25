# Current npm package footprint

Measured locally on 2026-10-16 with Node 24.21.0 and pnpm 10.11.0, using the
existing built packages after `582c982`. These are local `pnpm pack` results;
nothing was published. The native runtime is not embedded in these tarballs.

| Package | Compressed bytes | Unpacked file bytes | Files |
| --- | ---: | ---: | ---: |
| @freerdp-bridge/node 0.1.0 | 82,710 | 452,221 | 46 |
| @freerdp-bridge/protocol 0.1.0 | 36,413 | 189,112 | 40 |
| @freerdp-bridge/config 0.1.0 | 6,661 | 36,454 | 4 |
| Total own JS packages | 125,784 | 677,787 | 90 |

The packages include compiled JS, declarations, source maps and package metadata.
External npm dependencies are additional: config currently depends on
`@sinclair/typebox` 0.34.41. The complete production Node service archive measured
in [Iteration 223](history/iterations/201-250.md#iteration-223) is 3,369,644 bytes; it includes a broader
service/dependency payload and is not the library's npm tarball.

The historical native runtime archives measured in the same cohort are
6,299,411 bytes for Windows x64 and 24,836,026 bytes for Linux x64. Combining
those with the current own JS tarballs gives approximately 6.5 MB and 25 MB
respectively before external npm dependencies. These are estimates combining
separately measured cohorts, not tested final npm release bundles. Install-time
platform selection, final package layout and remaining features/installers are
still open; the final release size is not yet fixed.

Reproduce from the project root after the ordinary Node build:

```sh
pnpm --dir packages/node-bridge pack --pack-destination ../../build/npm-size-247
pnpm --dir packages/protocol pack --pack-destination ../../build/npm-size-247
pnpm --dir packages/config pack --pack-destination ../../build/npm-size-247
```

The measured tarballs and per-file byte/hash receipt remain in the ignored
`build/npm-size-247` directory. No source tree, development dependencies, lab
files, browser binary or Node distribution is included in these three packs.

An additional local snapshot of the already installed pinned TypeBox package
was packed on Linux: 292,802 compressed bytes, 1,905,051 unpacked file bytes /
1,070 files, SHA-256
`5c87beea457ee3922a446f8fe7c6a2e81809ee5344983335881d5e804d7baa9a`.
This is a repacked cached dependency, not a measurement of an independently
downloaded registry tarball. The complete local JS input set therefore totals
418,586 compressed bytes and 2,582,838 unpacked file bytes. Combined with the
historical native archives above, estimates become approximately 6.7 MB on
Windows and 25.3 MB on Linux, excluding Node/browser binaries and future work.

The three measured own tarballs plus that explicit TypeBox input pass a separate
offline production installation in `/work/build/npm-consumer-9SnFMb` in the
network-disabled Linux verification container. Local tarball overrides stand in
for unpublished workspace packages; all three public imports resolve canonically
inside the new consumer and expose the Node WorkerProcess/SessionManager owners.
No source workspace link, native SDK or RDP/device execution is used by this
import smoke. Lifecycle scripts are disabled and development dependencies omitted.

The first offline attempt lacked registry metadata for TypeBox and failed before
installation. Its log is retained in `build/iteration-251-npm-consumer.log`.
The explicit cached dependency pack makes the repeat independent of registry
metadata; its success is in `build/iteration-251-npm-consumer-repeat.log`.
This does not establish publication, ordinary registry resolution, final npm
metadata/licensing or installed native runtime acceptance.

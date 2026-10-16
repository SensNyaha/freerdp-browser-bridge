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
in [Iteration 223](ITERATION_223.md) is 3,369,644 bytes; it includes a broader
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

# Iteration 213 — clean source-only Node build and deployment

2026-10-15. Verifies the Stage 0/10 Node build slice after `ab123c0`, independently
of existing compiled output. The helper creates a new build directory containing
only four package manifests, TypeScript sources/configuration and root workspace /
lock/build configuration. No dist, node_modules, native build, SDK, Git directory
or lab file is copied into the fixture.

In the network-disabled Linux SDK it performs offline frozen pnpm installation,
dependency-ordered builds with injected-output synchronization, and a fresh
production deployment. All four packages produce compiled entry points. Source /
TypeScript/ESLint absence is checked in deployment, then a separate Node 24
process imports the deployed API. Original/fixture lockfiles agree byte for byte.
The generated fixture remains under ignored build for inspection. No production
code/queue, RDP connection or physical capture is introduced.

Both the initial source-only build and extended deployment/import checks pass.
The final receipt reports cleanWorkspace=true, packages=4, prebuiltOutput=false,
lockfileUnchanged=true, offline=true, productionDeploy=true and
deployedApiImport=true. Installation reuses exact cached packages with zero
download; production deployment reuses all 57 packages. Cache was seeded from
the existing frozen dependencies through normal host TLS; the actual isolated
check has no network. pnpm's DEP0169 warning is retained. Logs:
`build/iteration-213-*`.

Changed helper lint/format passes. Preceding full Linux pnpm check passes
540/54 skips, 594 cases, zero failures; Windows full baseline is 547/46
(593 cases), plus the capacity case independently verified as a Linux-only skip.
No native code changed; CTest/relocation/service runtime receipts retain their
scope. The manual bundled workflow includes this clean build; actual GitHub CI
is not claimed.

The named Node source-only build/deployment slice is complete on this Bookworm /
Node24/pnpm10.11 environment. Native/FreeRDP fresh-checkout builds, other distros,
dependency rebuild/SBOM, installers and remote/device/resource/soak gates remain.

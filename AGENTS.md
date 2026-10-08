# Development rules

Read CODEX_INSTRUCTIONS.md and the relevant normative documents before changing code.
Priority: explicit user instructions, SPECIFICATION.md, accepted ADRs, architecture/protocol, TODO.md.
Preserve the original documentation. Record gaps and blockers; never silently reduce requirements.
One C++20 worker per session. FreeRDP must not run inside Node; no GUI capture or arbitrary FreeRDP argv.
Pin FreeRDP 3.32.1 to the commit in native/dependencies.json. Use its public headers as authority.
Node.js 24, pnpm, strict TypeScript; CMake/Ninja, C++20, RAII, warnings as errors.
Use bounded queues and parser limits before allocation. No secrets in argv, env, files, logs, errors or metrics.
Certificate verification is strict by default. Device access is policy controlled and capability gated.
Tests must distinguish native lifecycle integration, fake-worker tests and actual RDP/device integration.
Check TODO items only after their acceptance conditions pass. Record test evidence and commit references.
Make focused commits after verified working blocks. Do not claim unsupported or untested capabilities.
Run pnpm check and native CTest for touched foundation code. Update docs when wire contracts change.

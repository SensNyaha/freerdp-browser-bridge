# Iteration 337 — native state-to-failure adapter composition

2026-10-20. Adds adapter-level regression coverage for the selected FreeRDP
failure mappings from [iteration 332](ITERATION_332.md),
[333](ITERATION_333.md) and [334](ITERATION_334.md). A test `EventEmitter` sends
terminal native state records through `NativeSessionWorker` and observes its
public `onFailure` contract. Timeout, logoff, server refusal and credential
failures reach their stable codes; transport and protocol controls preserve
their original classification. No remote session or synthetic desktop is
claimed by this adapter fixture.

The focused classifier/composition suite passes **3/3**, and the node package
TypeScript build, focused ESLint, Prettier and `git diff --check` pass. The
available runtime remains Node 22.22.0; full Node 24 acceptance is open as
documented in [iteration 332](ITERATION_332.md). No C++/native test target or
wire schema changed.

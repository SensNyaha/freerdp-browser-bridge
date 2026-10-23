# Iteration 378 — capability-gated Windows resource query batching

2026-10-21. Implements TODO Stage 10 sampled-resource launch-volume follow-up,
preserving SPECIFICATION §3.1 lifecycle ownership and PERFORMANCE §14's
measurement requirement. The prepared helper from [377](ITERATION_377.md)
now has a Node owner and native support flag. No RDP connection, device access,
source launch or new security investigation occurs. Release inputs, dependency
pins, polling/admission/execution/policy limits stay unchanged.

The original global sixteen-active / 128-waiting query gate now lends an
internal one-use invocation permit. Ordinary zero-argument callbacks retain
their API. Logical batch members consume the same permits as scalar queries;
there is no second budget. A permit cannot escape its logical lifetime or
launch twice, and delegated running work is joined before release even if its
logical callback fails early. Physical launch still yields across the existing
invocation chain. Fresh deadline checks include collection/staging. A retained
failing-before test exposed cached `ready` admission after time advanced; the
owner now rechecks ready decisions while cancellation/expiry remain terminal.
Original evidence: `build/iteration-378-redispatch-before.log`.

The batch owner groups matching resolved helper paths for five milliseconds,
with storage bounded by the sixteen admitted members. It validates the whole
positional receipt before publishing any member. Per-PID errors remain local;
malformed/shared-helper failure refuses the participating group with fixed
errors. Cancellation before dispatch excludes that PID; a cancelled dispatched
member joins the helper without cancelling healthy siblings. All-member
cancellation aborts and joins the child; a fresh group is independent. Every
result is checked again after close. There is no retry, idle poller, completed
sample cache, PID/path history or secret-bearing diagnostic.

New Windows workers advertise schema-1 HELLO extension bit 128 and CLI
`processResourceBatch: true`, including foundation builds without FreeRDP.
The decoder refuses this bit on other OS values and keeps unknown-bit refusal
at 256 and above. Legacy peers omit the optional property, preserving their
CLI/HELLO shape and scalar sampling. Worker policies use batching only with
the flag; standalone scalar readers stay unchanged. Equal-interval CPU/RSS
policies still share one logical flight and conservative clock bracket.
Single/different-interval policies can share physical launches across workers.
[Command, admission and retirement contract](PROCESS_RESOURCE_BATCH.md).

Narrow verification passes 43/43: original query gate/turn cases, five new permit
cases, eleven synthetic group/lifetime/fault cases, codec, capability and
existing IP/performance guards. Strict TypeScript build, ESLint, C++ formatting
and initial diff whitespace checks pass. Legacy Debug output separately passes
the actual RSS breach/healthy and CLI/HELLO control 3/3. A shared-flight legacy
fixture also passes. Logs: `build/iteration-378-focus.log`, `iteration-378-lint.log`,
`iteration-378-legacy-policy.log`, `iteration-378-legacy.log`.

A new source-only linked MSVC 19.44 Debug consumer reuses the unchanged pinned
SDK/dependency receipts, offline tools and Catch2. CMake 3.31.6-msvc6 / Ninja
builds and native CTest 34/34 pass in 29.40 s. Standard process/TLS/lifecycle
checks pass 27 / one platform skip in 39.56 s. No project objects or Release
output are reused/replaced. `build/iteration-378-native-build.log` and
`build/native-clean-4ZhORq/receipt.json` bind 353 files / 1,938,082 bytes,
source SHA-256 `767b9ddd7bd3089e3c6ec04543267b6210077e4b29f90feef8ea829a16cf0897`.
Worker SHA-256 is `6a9d773f6df521320821fa46333b2b75270e063767dcdc5b8e4ca0880c689c54`;
helper is `c61ad2544fac2133bb14ec7a7c710ccf28ed1b946ef0c1a392d84df1d573eecf`.
The source/artifact audit matches every input, both artifacts and all seven
protected files (`build/iteration-378-audit.cjs`).

Actual prepared-helper/owner/capacity checks pass 8/8 in 18.54 s. A fixed
forty-call comparison returns all scalar samples in 1,789 ms and all batch
samples in 385 ms through three launches; no refusals or deadline adjustment.
An earlier actual owner control was 2,693 versus 509 ms, also three launches.
Mixed healthy/error/healthy native samples preserve healthy values; eight
pre-dispatch cancellations start no helper and preserve a subsequent query.
Logs: `build/iteration-378-native-owner.log`, `iteration-378-capacity.log`.

The original forty-worker / five-replacement fixture passes without worker
failures at ordinary one-second polls. It records 317 paired logical samples,
323 dispatched items / 96 helper launches, maximum batch eight, active query
550 ms and retiring query 204 ms. Query-owner maxima are 286 ms admission,
73 ms synchronous invocation and 434 ms admitted task; event-loop maximum is
228 ms. Five query task failures accompany retiring cancelled members; there
are zero admission expiries and zero worker failures. Every query/batch owner,
PID/runtime directory and manager slot retires. These independent maxima are
not one causal timeline, and the variable-duration fixture is not a throughput
comparison. The preceding scalar full-run failures remain retained in 377.

Full Windows `pnpm check` passes strict builds, lint, formatting and
854 tests / 51 profile/platform skips / 905 total, zero failures, in 537.24 s.
The explicit helper profile is enabled on the same source-only Debug output.
Its capacity repeat has zero worker failures, 363 dispatched items through
98 helper launches, maximum batch eleven, active query maximum 664 ms and
event-loop maximum 271 ms. Query admission has zero expiries; all query/batch
owners are empty. The forty-call comparison is 2,333 versus 456 ms, again three
batch launches and zero refused scalar reads. Log: `build/iteration-378-check.log`.
Post-run source/artifact and seven-protected-input audit passes. Explicit
Markdown formatting on the new report/batch contract and `git diff --check`
pass before commit; surrounding historical Markdown layout is preserved.
An optional WMI process inventory is refused by the environment; no permission
or system setting is changed. Ordinary process enumeration finds no remaining
worker/helper, alongside the tests' owned-PID/runtime assertions. The original
Release worker remains `2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.

The named local unconnected capacity slice does not accept exhaustive shared
OS/transport failures, connected RDP resource limits, sustained load, production
Release packaging, other-platform batching or total-session CPU/RSS budgets.

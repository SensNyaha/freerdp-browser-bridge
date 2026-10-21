# Windows host resource batch

The private Windows `rdp-runtime-directory` helper accepts
`--process-resources-batch <pid-list>` in new source builds. This is a private
OS-query component, separate from RDP, device access and public session settings.
The existing scalar CPU/RSS commands keep
their grammar, output and exit conventions. Existing Release artifacts and
dependency versions are unchanged.

The single PID-list argument contains 1..16 comma-separated unsigned decimal
Windows PIDs, each 1..4,294,967,295 with at most ten ASCII digits. Leading
zeros retain the existing scalar parser's grammar. Order and duplicate PIDs
are preserved. The entire input is limited to 175 UTF-16 code units and is
validated into a fixed sixteen-element array before any OS query. Empty
elements, signs, whitespace, non-ASCII digits, overflow, trailing separators,
extra arguments and excess count/length refuse without a receipt (exit 2).
No session data, file content, device identifier or command string is accepted.

Each PID uses the existing limited-query process handle and working-set /
cumulative CPU APIs. Every query scope attempts handle close before output;
only successful items imply successful explicit close. Close failure is an
errored item, and the caller must join helper exit/streams for the outer
retirement boundary rather than treating received bytes as retirement.
CPU microseconds
use the existing checked kernel+user 100 ns conversion. Invalid/overflowing
values or handle/query/close failure produce a numeric per-item error and
zero both measured scalars. A zero resident sample is invalid for the batch.
One target's refusal does not suppress sibling results.

The canonical schema-1 response is one ASCII JSON line, bounded to 2048 bytes
including LF or CRLF:

```text
{"v":1,"items":[{"bytes":123456,"micros":10,"error":0},{"bytes":0,"micros":0,"error":87}]}
```

The item count exactly matches the request, and positional order is the only
correlation; no PIDs or OS error text are echoed. A successful item has positive
exact bytes, nonnegative exact microseconds and error zero. An errored item has
both scalars zero and a positive unsigned 32-bit error. Measured scalars cannot
exceed 9,007,199,254,740,991. Well-formed completed batches exit 0 even when an
individual target is refused; output/flush failure exits 3. Exit zero is not
equivalent to every target succeeding. Existing scalar commands still exit 1
on a target error.

The prepared TypeScript codec admits only this canonical helper layout with
the exact header/key order and ordinary integer notation. It accepts one
optional final LF/CRLF, not arbitrary whitespace, escaped/duplicate/foreign
keys, exponent notation, extra records or trailing bytes. The caller supplies
the expected 1..16 item count. Byte/count admission precedes record allocation;
the returned array contains only validated numeric scalars. Invalid complete
receipts throw fixed `PROCESS_SAMPLE_INVALID`, without raw input or cause.
Valid target errors remain separate per-item values for the Node owner.

The internal Node owner uses the existing shared sixteen
active logical owners / 128 waiting callers across scalar and batch queries.
After admission, requests for the same resolved helper path collect for five
milliseconds. Group/path/item storage is bounded by the admitted owners, with
at most sixteen items overall, and is removed after dispatch/retirement. There
is no second admission budget, retry, idle poller or completed-sample cache.
The physical launch crosses the same bounded invocation owner and yields to
the event loop. Unrelated helper paths never share a group.

The original entry deadline includes permit wait, collection and launch
staging, with a fresh check immediately before dispatch. Cancelled/expired
unsent members do not query a PID. Once dispatched,
one member's cancellation discards its result and joins the shared child
without cancelling healthy sibling requests. If all dispatched members cancel,
the owner aborts the child and joins close/streams for every member before
releasing its permit. A fresh group can follow an entirely cancelled collecting
group. Every member is checked again after child close; worker policies also
check their original three-second deadline and ready-child identity. CPU
observation brackets include admission through joined child completion,
matching the existing sampled policy. The two-second helper execution timeout,
three-second admission and three-second total worker query deadline are unchanged.

Valid per-PID errors affect only their corresponding member. Malformed
complete output or a failed shared helper/transport fail its participating
members with fixed unavailable errors; unrelated groups must remain independent.
The complete result is validated before any member is published. Cancelled
members receive only the fixed cancellation error; raw output/reasons are never
attached. Synthetic fault/lifetime tests are distinct from actual healthy and
per-PID-error helper tests; exhaustive OS-failure isolation is still open.
Controlled actual child timeout, partial/all-member cancellation and missing
executable tests now also pass with an existing hanging native fixture. They
use real child execution/close and preserve an unrelated real-helper path;
they do not simulate failures inside Windows process-query APIs.
[Fault-control scope and evidence](ITERATION_379.md).

New Windows workers advertise HELLO extension bit 128 and CLI
`processResourceBatch: true`. Only that support enables automatic batching in
trusted-host CPU/RSS policies. Missing/legacy support keeps the scalar commands;
it never probes an unknown batch command. Equal-interval policies still share
one logical sample per worker. Separate intervals and single policies may
coalesce across workers too. Public standalone scalar readers keep their APIs
and original command paths. Policies remain off by default.

The internal snapshot contains only scalar counters: collecting/staging-running
group counts, active logical items, physical launch attempts, dispatched items
and maximum batch count. Attempts count executor calls, not proof of successful
process startup. They are distinct from logical watchdog queries; final zero
owners prove joined retirement for the tested cases. No PID/path/sample history
is retained. [Integration evidence](ITERATION_378.md).

For the explicit prepared-helper test profile, use a newly built output:

```powershell
$env:BRIDGE_TEST_BINARY_DIR = 'build/native-clean-ACTUAL/out'
$env:BRIDGE_TEST_RESOURCE_BATCH_HELPER = '1'
node --test --test-concurrency=1 tests/integration/process-resource-batch-*.test.mjs
```

The opt-in selects tests, not production behavior. Other/older native profiles
skip these new command cases; opting in requires them to pass and never treats
an unknown command as success. Portable parser CTest and codec unit tests do
not depend on this flag. The selected set covers the command, real owner and
controlled query-child faults. [Command evidence](ITERATION_377.md),
[owner adoption](ITERATION_378.md), [fault controls](ITERATION_379.md).

# Prepared Windows host resource batch

The private Windows `rdp-runtime-directory` helper accepts
`--process-resources-batch <pid-list>` in new source builds. This is a prepared
OS-query component, separate from RDP, device access, public session settings
and current watchdog activation. The existing scalar CPU/RSS commands keep
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
Valid target errors remain separate per-item values for the future owner.

The current Node sampler does not call this command. Automatic coalescing,
per-owner cancellation, shared child retirement, admission accounting and
capability-gated adoption require separate integration. Existing 16 active /
128 waiting admission caps and two-/three-second execution/policy bounds are
not changed by this prepared command. No resource-capacity or production
adoption gate is closed by its presence alone.

Pending Node-owner integration must preserve the existing shared sixteen
active logical owners / 128 waiting callers across scalar and batch queries.
Coalescing may register cheap logical requests together; actual process launch
must still cross the bounded invocation owner. There must be no second,
independent caller-admission budget or retained path/sample cache. Group/path
storage must be bounded by admitted owners and removed after dispatch/retirement.
Only matching helper paths may share a group.

The original entry deadline must include permit wait, collection and launch
staging. Cancelled/expired unsent members must not query a PID. Once dispatched,
one member's cancellation must discard its result and join the shared child
without cancelling healthy sibling requests. If all dispatched members cancel,
abort the child and join close/streams for every member before releasing its
permit. A member must be checked again after child close; late completion
cannot revive an expired/closed worker. There must be no retry or completed
sample reuse. CPU observation brackets must conservatively include admission
through joined child completion, matching the existing sampled policy.

Valid per-PID errors must affect only their corresponding member. Malformed
complete output or a failed shared helper/transport must fail its participating
members with fixed unavailable errors; unrelated groups must remain independent.
Such shared OS/transport faults and complete isolation still require explicit
tests rather than being accepted from a healthy batch. Adoption must be gated
by verified native support, while legacy workers retain the scalar path.
Physical launch attempts, dispatched item counts and empty owners must be
measured independently of logical sampler calls before accepting a capacity
improvement. These ownership/adoption requirements are not implemented by
the prepared command/codec above.

For the explicit prepared-helper test profile, use a newly built output:

```powershell
$env:BRIDGE_TEST_BINARY_DIR = 'build/native-clean-ACTUAL/out'
$env:BRIDGE_TEST_RESOURCE_BATCH_HELPER = '1'
node --test --test-concurrency=1 tests/integration/process-resource-batch-helper.test.mjs
```

The opt-in selects tests, not production behavior. Other/older native profiles
skip these new command cases; opting in requires them to pass and never treats
an unknown command as success. Portable parser CTest and codec unit tests do
not depend on this flag. [Current evidence](ITERATION_377.md).

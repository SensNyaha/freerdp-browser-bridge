# Iteration 216 — credential diagnostic snapshots and child logger redaction

2026-10-15. Implements SECURITY section 3 / Stage 10 log snapshot tests for the
current API. A random synthetic canary reproduces a real omission: Pino's child
bindings bypass the existing object formatter. Adding a bindings formatter is
insufficient because this pinned Pino resets that formatter in child(). The
final correction uses the public streamWrite hook on completed JSON records,
retaining the existing early object redaction and req/res/err serializers.
Child, grandchild and setBindings values now pass the same recursive policy.

The public logMethod hook also prevents Error-only / implicit err.message calls
from substituting untrusted error text as the log message before serialization.
Malformed or over-64-KiB serialized output is replaced by one fixed event, with
no source text. The size guard precedes JSON parsing by this hook; it does not
bound earlier Pino formatting allocation. No new queue or media path is added.
Explicit application log messages remain trusted constant text; this is not
content detection for arbitrary strings containing unknown secrets.

Synthetic HTTP/fake-RDP regression covers invalid config/JSON, unsupported MIME,
oversized body, wrong bearer, unknown credential-bearing URL, backend failure,
stable public failure and protected metric privacy. Normalized rejection records
have only expected fixed code/message values. Generated credentials/attach
tokens stay out of error responses, logs and metrics. This is actual API/logging
execution with fake RDP, not remote or device integration. No lab secrets are
used in these cases.

The focused two cases pass after correction. The first failing child-binding
case and final receipt are retained in build/iteration-216-security-*.log. The
initial failure fixture expected retryable=false for WORKER_FAILED; it is
corrected to the existing retryable=true contract without changing production
error semantics. Full Windows bundled and Linux checks are recorded under
build/iteration-216-*.
Full results are Windows bundled 557 pass / 47 platform skips and Linux 550
pass / 54 skips, 604 cases on each platform and zero failures.
Native code/protocol remain unchanged; current native
CTest baseline is Linux 24/24, Windows 23/23 and foundation 11/11. Release artifact
secret scanning is the following separate block; no repository-wide scanner or
production-secret persistence is introduced here.

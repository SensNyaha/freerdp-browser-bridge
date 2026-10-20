# Iteration 345 — explicit NLA-required connection failure

2026-10-20. The pinned FreeRDP 3.32.1 header defines
`ERRCONNECT_HYBRID_REQUIRED_BY_SERVER` as CONNECT code `0x1e`. When the native
connection event remains `RDP_CONNECT_FAILED`, the Node adapter now maps this
specific code to fixed non-retryable `RDP_SECURITY_MODE_REQUIRED` rather than a
generic network failure or credential error. The public message requests a
different security mode without exposing the native numeric value. Unknown
codes and other native error classes retain their existing mapping.

The Node package build passes; the native classifier/adapter suite passes
**3/3**, and the public error contract passes **1/1**. Focused ESLint, Prettier
and `git diff --check` pass with Node 22.22.0. Node 24 full-suite acceptance
remains open. The current lab retry stops at strict certificate refusal, so no
remote HYBRID_REQUIRED emission is claimed. No C++ code, Release setting or
dependency pin changed.

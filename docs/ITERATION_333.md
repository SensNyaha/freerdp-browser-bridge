# Iteration 333 — selected FreeRDP connection authentication failures

2026-10-20. Extends the Stage 3 stable failure mapping using FreeRDP 3.32.1's
public `freerdp/error.h` codes. A bounded Node adapter whitelist recognizes the
CONNECT codes for insufficient privileges, password expired/must change,
client revoked, account disabled/expired/locked, logon failure, wrong password,
access denied, account restrictions, logon-type refusal and missing
credentials. These become the existing fixed `RDP_AUTHENTICATION_FAILED`
failure. Native error numbers stay internal. Transport/TLS, KDC-unreachable,
unknown codes and non-connect failures retain their existing classification.
The private IPC layout and FreeRDP settings are unchanged.

The shared classifier test passes **2/2**: thirteen documented credential/account
codes map to authentication; TLS transport and unrelated connect codes remain
connection failures; an injected protocol failure cannot be reclassified. The
node package TypeScript build, focused ESLint, Prettier and `git diff --check`
pass under the locally available Node 22.22.0. The full workspace Node 24 check
is still unavailable in this environment; see [iteration 332](ITERATION_332.md)
for the two explicit child-process Node-version admission failures. No native
code changed, so CTest was not rerun.

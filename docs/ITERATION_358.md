# Iteration 358 — missing Connection Broker destination

2026-10-20. The pinned FreeRDP `ERRINFO_CB_DESTINATION_NOT_FOUND` now maps to
the fixed public `RDP_SERVER_REJECTED` failure. The corresponding upstream
description identifies a broker routing rejection because the target endpoint
could not be found. Other broker destination and pool reasons remain generic
until classified individually.

Native-adapter classification, fixed failure publication and the existing
manager/API `RDP_SERVER_REJECTED` contract pass in focused tests. The full suite
for the prior error-classification block is recorded in
[iteration 355](ITERATION_355.md). Actual Connection Broker emission remains
unverified; no wire, Release or dependency change was made.

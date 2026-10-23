# Iteration 154 — accepted DVC callback handoff and alias protection

Date: 2026-10-12. Implements SPECIFICATION §3.1 / ARCHITECTURE §12 after manager
normalization `4a396a4`. Accepted live callbacks transfer into registry proxies;
rejected new targets close once with explicit cleanup status, while existing owned
aliases remain with their original owner. Missing/uncertain close is not hidden.
Production listener/provider integration remains open.

Five fixture cases and two actual drdynvc/fake-SVC cases pass: linked **74 cases /
6,461 assertions**, bundled CTest **18/18**, foundation **7/7**, /analyze /W4 /WX.
The initial actual-host refusal expectation was corrected: negative CREATE response
can leave SDK global channel error zero, requiring explicit registry fault polling.
No warning suppression, dependency source/pin/ABI/wire/capability changes. No actual
remote resource/device/application acceptance is claimed.
[Contract and retained handoff gates](DVC_CHANNEL_HANDOFF.md).

Full bundled `pnpm check` passes **498/498**, zero failures/cancellations.

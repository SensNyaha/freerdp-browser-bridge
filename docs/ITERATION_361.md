# Iteration 361 — selected Connection Broker failure reasons

2026-10-20. The native-session adapter now classifies the remaining selected
FreeRDP Connection Broker ERRINFO values by their pinned descriptions:
destination loading/redirection, VM wake/boot/DNS, unavailable endpoint pool
and session-monitor failure become `RDP_SERVER_FAILURE`; invalid routing
settings become `RDP_SERVER_REJECTED`. The previously covered destination-not-
found, connection-cancelled and VM-boot-timeout reasons retain their distinct
fixed categories. Unknown broker values remain `RDP_DISCONNECTED`.

All eight newly classified values pass the native failure classifier tests,
including the unaffected generic fallback control. Manager/API tests continue
to assert the fixed categories and do not expose numeric FreeRDP diagnostics.
Actual broker emission remains unverified. No wire, Release or dependency
change was made.

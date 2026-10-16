# Iteration 242 — finite fixture waits and browser listen failures

2026-10-16. Supports SPECIFICATION §3 lifecycle/regression evidence and Stage 0
local foundation verification. Production deadlines, input/clipboard admission,
certificate policy and protocol bytes are unchanged.

The shared `eventually` fixture silently ignored its second argument. Several
native TLS callers requested 6,000 ms but actually received the fixed 3,000 ms
window. A separate failing-before regression requests 20 ms and observes the old
helper succeed after 150 ms instead of timing out. Another fails because invalid
timeouts reach the predicate. The corrected helper validates integer 1..60,000 ms,
keeps the default at 3,000 ms and uses a monotonic clock. Regression covers a
requested deadline with a fixed/regressed wall clock, invalid values, predicate
fault identity, immediate success and a delayed success after the default window.
Audio, microphone and clipboard manager TLS fixtures now explicitly allow
6,000 ms around their existing 5,000 ms connection profile. They still require
exact `RDP_CERTIFICATE_REJECTED`, zero TLS application bytes and joined cleanup.
This does not prove the unverified original Iteration 237 failure's exact cause.

Browser loopback fixtures retain eight high dynamic-port attempts. On Windows,
`EACCES` now selects another candidate, like `EADDRINUSE`; it does not change OS
reservations/firewall/browser policy or gain privilege. Other errors immediately
retain their identity; non-Windows `EACCES` remains immediate. Exhaustion includes
the exact last OS error as `cause`. Separate synthetic checks fail before this
change for Windows denial and missing exhaustion cause, then pass afterward.
Existing real occupied-server/listener cleanup checks remain. Input browser
fixtures now use the same helper instead of a separate 16-attempt port loop.
This does not identify the original Iteration 236 port refusal's cause.

The eight narrow helper cases pass. Bundled focused checks pass Windows 34/34
(input/Edge, audio, clipboard and microphone TLS) and Linux 35/35 (helper and
audio/clipboard/microphone TLS). No hardware capture or actual remote input is
performed by these cases.

Local foundation executables are refreshed before Node verification. Windows
CMake/MSVC/CTest passes 14/14. The first Linux configure tries to download Catch2
inside the network-none SDK container and fails before compilation; its log is
retained. Reconfiguration explicitly uses the pre-existing `/catch2-src` source
and GCC build/CTest passes 15/15. These are existing local sources/build trees,
not a fresh-checkout/distro/CI acceptance pass. No C++ code changed.

Separate current-foundation clipboard-envelope and worker lifecycle checks pass
15 with one absent-primary/platform skip / 16 cases on each platform. This
includes full 16 MiB framed command delivery, HELLO/CLI agreement, heartbeat,
100 sequential workers, parent death and paused-parent bounded cleanup. It
resolves the stale-executable selection used in Iteration 241's invalid first
Linux command without relabeling that failure as a pass. Prepared GitHub CI and
the remaining Stage 0 matrix are still open. Full bundled Linux Node check
passes 651 with 57 platform skips / 708 cases and zero failures. Windows bundled
full Node check passes 656 with 49 skips / 705 cases and zero failures. Logs are
`build/iteration-242-{linux,windows}-bundled-check.log`. Narrow failing-before
wait/port cases remain in `build/iteration-242-*-before.log`; passing helper and
native/focused/foundation results retain separate logs.

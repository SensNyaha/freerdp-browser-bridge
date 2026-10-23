# ADR-011: One monitor at 100% scale

Status: Accepted — explicit user decision, 2026-10-09.

## Decision

The current product/release requires one primary monitor at (0,0), desktop and
device scale 100%, with the existing orientation 0. The implemented layout is
sufficient. Multimonitor and other RDP scale/layout profiles are outside the
current required scope and are not release acceptance blockers or pending work.

Initial size and confirmed dynamic width/height changes remain required within
the supported provider/server bounds. Browser CSS presentation and coordinate /
cursor mapping remain independent of the fixed RDP scale. This decision does not
remove keyboard/IME, audio, clipboard, devices, platforms, resource limits,
Windows-server verification or soak acceptance.

## Contract precedence

This records the user's instruction: “больше чем один монитор не требуется,
достаточно одного при масштабе 100% как есть сейчас”. It supersedes broader
display-layout requirements in SPECIFICATION §2.10, CONFIG_SCHEMA display fields
and the related TODO entries for this release. Original blueprint text and older
iteration evidence remain preserved as historical context. Unsupported layouts
continue receiving explicit errors; no unsupported capability is advertised.

## Consequences

The bounded single-primary Display Control implementation and its 100% metadata
remain the supported profile. Wider layout support would require a new explicit
scope decision and corresponding implementation/tests, rather than silently
reappearing on the critical path.

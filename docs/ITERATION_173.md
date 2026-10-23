# Iteration 173 — component and stage acceptance status

2026-10-13. Implements CODEX_INSTRUCTIONS §5 and the user's request to distinguish
completed work from unfinished acceptance. No specification, ADR, product code,
public protocol or release gate is changed by this documentation block.

TODO now defines scoped component DONE separately from complete stage DONE and
summarizes why each required stage remains open. Stage 2 keeps its already
accepted Windows fake-backend gate; other platform/real RDP requirements remain
in their corresponding stages.

Stage 6 lists thirteen accepted components with exact profile/platform/test
scope and groups outstanding implementation and real-source acceptance. The
previous detailed records are preserved in STAGE_6_HISTORY.md with only relative
document-link paths adjusted for their new location. Byte-for-byte comparison
after that link adjustment confirms no historical record was lost; 333 local
links across the changed current/history/startup reports resolve.

Actual XRDP waiting state does not establish audible playback, ready AUDIN,
physical capture/recording or the <150 ms LAN queue gate. Native/browser resource,
compatibility, reconnect, Windows-server, Linux, sanitizer/fuzz and soak gaps
remain open. Synthetic/SDK fixture acceptance is labeled explicitly.

Native atomic directory creation and packaged helper are also marked DONE only
as the verified Windows components from iterations 170/171. The broader runtime
isolation requirement remains IN PROGRESS, with uncertainty/root/multi-user
acceptance retained. Current startup ownership is described by iteration 172.

The accompanying implementation block passes full `pnpm check` 507/507,
foundation CTest 10/10, bundled CTest 22/22 and relocation 1/1. These results
do not replace any of the retained remote/device/platform acceptance gates.

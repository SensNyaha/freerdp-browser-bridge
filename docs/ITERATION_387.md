# Iteration 387 — actual corrected-worker audio and manual source preparation

2026-10-21. Continues the P0 MVP audio criterion using the existing diagnostics
and the linked Debug worker from [378](ITERATION_378.md), including the deadline
correction [371](ITERATION_371.md). Worker/native/Release bytes, dependency pins,
codec/buffer policies and protocol deadlines are unchanged.

The first authorized three-minute source scenario exits 0 with empty runtime,
but receives no RDPSND Formats or packets. The user observes that the command
went into Notepad, not PowerShell. Source dispatch was not execution proof;
this invocation is not an audio-quality pass. It renders 148 H.264 1080p frames.
Evidence: `build/iteration-387-audio.log`.

After the user opens PowerShell and instructs continuation, the helper's new
three-minute mode uses a prepared console: fixed source text and Enter only,
without Run, launch or selection keys. A separate control verifies exactly
those events and refusal of invalid mode values before input. The actual repeat
again receives no audio; the user reports that the text did not appear in the
console. It renders 63 frames, exits 0 and empties runtime. Unicode delivery to
this console is unproven; no console/root-cause diagnosis is claimed. Evidence:
`build/iteration-387-prepared-audio.log`.
That unproven prepared-console dispatch branch is removed from the final helper.
The new long-tone flag aliases the manual-source mode below, with no automatic
source command or application launch.

The user then requests manual command paste and sound assessment. The new
explicit `--audio-opus-compat-source-listen` opens a five-minute headed preview
with existing Opus/200 ms and browser-to-server-only text Clipboard. Its native
reservation and config both use 2,048 bytes, admitting the 701-character fixed
command's terminated UTF-16 representation. The command is filled locally;
Send, console paste and Enter are separate user actions. No source command,
application launch or Clipboard API action is automated in this mode. Other
modes retain their clipboard-off/refusal-mock behavior. The user confirms that
the text pastes into Notepad, then succeeds using the console's own paste menu.

The actual manual-source run exits 0 and reports:

- 352 H.264 frames at 1920×1080, ready Opus revision 3 / epoch 1;
- 1,185 audio records, 1,181 decoded/Worklet packets and one configuration;
- 1,128,960 played frames: **23.52 seconds of actual rendered samples**, not
  three minutes. Source preparation occupied most of the observation window;
- Worklet underflow frames/events 0/0, reset discards/invalid calls 0/0,
  overflow-skipped frames 960, high-water 5,760 and queued frames 3,840;
- server/client Formats 1/1, Training 1, Waves 130, writes/completions 263/263,
  cancellations/failures 0/0;
- native chunks 130, ordinary overflow resets 0, skipped PCM frames 12,954,
  **late publication intervals 0**, revisions 7, lifetime resets 4, packets 1,200;
  Node recovery requests 0. Startup/retirement totals are not all active-stream
  discontinuities; the browser sees one configuration/epoch;
- joined runtime cleanup succeeds. No retained worker is claimed from an
  unsubscribed final state value; PID inventory is checked separately.

The user reports that sound is steady, almost never breaks and fully satisfies
them. This accepts their listening assessment of this named short active slice.
It does not prove three-minute continuity, zero drop, measured LAN latency,
PCM/120 ms, recovery, other platforms or all Stage 6. Compared with [370](ITERATION_370.md),
the short corrected-worker slice has no observed publication skips or underflow,
but different duration/workload prevents a complete causal performance claim.
Evidence: `build/iteration-387-manual-audio.log`. The automated report retains
`audibleAcceptance:false`: it cannot assert a human assessment; this paragraph
records the user's separate observation.

Final focused source/options tests pass 10/10 in 1.15 s, including fixed-duration
admission, both manual-mode aliases with no automatic tone selection,
UTF-16 quota and PowerShell parse-only checks. Evidence:
`build/iteration-387-final-focus.log`. Current linked native CTest passes 34/34
in 24.28 s; the temporary ASCII workspace alias is removed. Full current Windows
linked `pnpm check` passes build/lint/format and 890 / 51 profile/platform skips /
941 total, zero failures, in 533.57 s. Evidence:
`build/iteration-387-linked-ctest.log`, `build/iteration-387-linked-check.log`.
Final focused ESLint/format/diff checks pass. Source/artifact audit matches all
353 native inputs, both linked Debug outputs and seven protected files.
No new diagnostics,
security research or source-loop/screenshot automation is introduced.

Current Linux execution remains blocked by local runtime availability/access.
The ordinary WSL inventory additionally refuses with
`Wsl/EnumerateDistros/Service/E_ACCESSDENIED`. No alternate credentials,
configuration/permission changes or security-mechanism bypass is attempted.

# Iteration 305 — Windows PCM/Opus source activation observation

2026-10-19. Continues SPECIFICATION §2.6 / TODO Stage 6 on the restored,
user-confirmed Windows lab. The idle inventories in iterations 297/302 remain
historical evidence; an idle observation alone did not exercise an application
sound source. The unchanged bundled worker and exact approved session-only
fingerprint are reused. No Release setting or dependency version changes.

An operator-assisted local probe connects with PCM/200 ms, then separately
Opus/200 ms. Native JPEG snapshots confirm the desktop and Windows Run dialog
before entering one fixed command. It starts ordinary Windows PowerShell with
`-NoProfile` and plays `System.Media.SystemSounds.Asterisk` three times, with
800 ms waits. No ExecutionPolicy bypass, remote file, network media source,
audio/service/policy change or physical microphone capture is used. The command
exits automatically; fresh native images show the desktop again. The agent
does not claim to have heard the sound or verified its identity at a speaker.

| Observation | PCM/200 ms | Opus/200 ms |
| --- | --- | --- |
| Source command submitted | yes | yes |
| Source becomes ready | yes | yes |
| Server/client formats | 1 / 1 | 1 / 1 |
| Training / Waves | 3 / 17 | 3 / 18 |
| Config records / packet records | 386 / 1,053 | 551 / 1,151 |
| Reported source frames | 129,060 | 148,131 |
| Nonzero PCM bytes | yes | not a decoded-Opus check |
| Native writes / completions / failures | 43 / 43 / 0 | 45 / 45 / 0 |
| Heartbeat / joined empty-runtime cleanup | pass / pass | pass / pass |

These counts span each interactive connection, not only the command's playback
duration. State history is bounded to the first 64 records and reaches ready
epoch 62 in both profiles; config counts reveal substantial further churn.
This verifies active private Node/native audio delivery, not uninterrupted
quality, browser decode/Worklet rendering, audible output, ready reset, measured
LAN latency or sustained resource acceptance. No root cause is assigned to the
earlier idle result or current epoch churn.

Afterward, existing PCM/Opus AUDIN inventories with output off still observe
waiting epoch 0, zero channel/version/format/Open/recording counters and zero
sample submissions. Both preserve heartbeat, 1920×1080 capture and empty-runtime
close. Recording and ready input remain open; active output does not establish
microphone support on this lab.

The first interactive launch fails before any source command; the following
noninteractive launch receives stdin EOF and likewise performs no remote input.
The successful interactive launches use newline-terminated phase commands.
Both earlier failures clean their native runtime and are retained in the tool
history rather than represented as RDP audio failures.

Scalar reports are preserved verbatim in ignored
`build/iteration-305-{pcm,opus}-observed.json`; microphone logs are
`build/iteration-305-microphone-{pcm,opus}.log`. The experimental probe is
archived only in ignored `build/iteration-305-source-probe.mjs`, SHA-256
`b788a1548cdfad6f04675b552a177ad21d6315481aa175296ac9969ab3261b47`.
It is not a new supported UI automation workflow. The user subsequently asks
that future application launches on the RDP host be delegated to them instead
of repeated agent screenshot interaction. No further remote actions follow
that instruction in this block.

The bundled worker SHA-256 remains
`2796d5f0bb615d9576195396cd4215c0754be2376822464935027575c00bca68`.
This committed block changes documentation only. `git diff --check` and local
documentation links pass; complete Node/native regression is the just-completed
iteration 304 baseline, not a new repeated suite claim. Future live source
generation should be requested from the user while local development continues.

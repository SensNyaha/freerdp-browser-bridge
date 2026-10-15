# Iteration 220 — actual Linux 30-minute browser observation

2026-10-15. Implements the Linux single-viewer Stage 4 / PERFORMANCE observation
slice. The existing actual XRDP/Linux producer/Edge helper now accepts an explicit
--soak-test profile. Private bounded bootstrap selects a 30-minute window with
finite server/client cleanup deadlines; ordinary smoke deadlines are unchanged.
The lab server keeps one native owner and exposes only bearer-protected scalar
worker/Node RSS. It rechecks connected state and process identity after reading;
PID sampling is not itself a liveness or OS process-identity guarantee.

Linux /proc status input is read into a fixed 16,385-byte buffer, rejects over
16 KiB, parses one positive KiB VmRSS scalar with safe integer conversion and
closes its descriptor on every path. Errors are fixed and raw status text is not
forwarded. Tests cover malformed/duplicate/oversized/unit/identity refusal and
actual Linux current-process sampling repeated 32 times with unchanged FD count.
The actual resource endpoint returns 401/empty without a bearer. Viewer HTTP
responses are bounded at 128 KiB. Existing ViewerSoak owns at most 64 samples as
fixed cumulative maxima plus one previous observation, without a sample history.

Actual Linux worker uses primary unix-seqpacket-rws1, one 1920x1080 desktop and
the user-approved session-only fingerprint. The Edge form supplies credentials
and certificate decision through the existing private paths. No microphone,
audio, remote keyboard or operational remote-input command is activated.
Final successful receipt has 61 observations over 1,800,017 ms:

- 5,163 frames / 77,600,467 encoded bytes;
- maximum queued frames 1 / queued bytes 781, decoder queue 0, browser outbound
  buffered bytes 0; sampled render credit stays within one;
- maximum worker RSS 229,117,952 bytes (about 219 MiB), below the existing
  256 MiB per-worker check; maximum Node RSS 116,744,192 bytes;
- maximum observed rolling decode p95 39.9 ms;
- after observation, actual resize 1920x1080→1280x720→1920x1080 has fresh
  configs/IDRs, fresh-token reattachment renders again and all cleanup passes.

The helper exits 0 and closes its browser, host and private runtime. Logs:
build/iteration-220-linux-soak.log, iteration-220-resource-auth.log and focused
resident tests. Full combined Windows/Linux checks with this helper pass in
Iterations 221/222 (615 cases). Native code is unchanged by this block.

This accepts the named automated single-viewer duration/queue/worker-RSS gate.
It does not establish total per-session memory cost, absence of every leak,
controlled bridge-added/LAN latency, sustained interactive keyboard/device use,
multi-session load, Linux local browser, uninterrupted audio or Windows-server
coverage. In particular the recorded decode statistic does not meet the separate
30 ms target; this observation is not declared a full performance pass. Earlier
Windows soak failures remain recorded and are not superseded by this Linux run.

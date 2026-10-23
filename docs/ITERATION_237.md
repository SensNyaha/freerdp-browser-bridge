# Iteration 237 — reserved native clipboard session activation

2026-10-15. Implements the native-adapter portion of SPECIFICATION §2.7 over
the controller ownership and RWC1 server transport accepted in `418c92a`.

`NativeSessionWorker` retains the validated numeric item maximum, and accepts
explicit text direction policy only when it matches that reservation. Missing /
mismatched limits and unsupported formats refuse before child startup. Default
off selection still uses the original budget. After HELLO, both clipboardText
and clipboardRevoke must be present before CONFIGURE/SECRET/connect. Read/set-only
and legacy peers cannot create an ownership grant that lacks native revocation.
The public factory receives numeric limits only; no credentials enter factory
options, argv or environment. Existing finite controller retirement remains.

The full valid 16 MiB synthetic child fixture now starts through the actual
native adapter, writes and revokes through its forwarding methods, preserves
heartbeat and joins empty-runtime cleanup. Separate synthetic legacy/read-set
peers refuse before connect is invoked and close cleanly. Actual linked native
worker sessions exercise all three directions against the local untrusted TLS
fixture, retaining exact certificate rejection, zero application bytes and
joined cleanup. These are TLS/lifecycle tests, not remote clipboard transfer.

Focused Windows checks pass 16/16. Full Linux check passes 632 with 54 skips /
686 cases. Windows has 633 passes, 49 skips and one failure / 683 cases: the
existing PCM-microphone/Opus-output TLS fixture exceeds its three-second manager
poll deadline. Its unchanged individual repeat passes in 479 ms; the first cause
is unverified and a complete Windows regression pass remains required. Logs are
retained in `build/iteration-237-*`. Native CTest passes Windows 29/29 and Linux
30/30. A direct Windows CTest invocation could not create its cached R: log path;
the standard build helper restores the alias and passes. No C++ parser or channel
changes; earlier sanitizer/fuzzer evidence keeps its original scope.

Reference browser transfer/permission/UI, actual remote data/revoke, total RSS /
CPU, network and full Stage 7/managed-drive acceptance remain open. No OS
clipboard is accessed and the consumed one-test XRDP mutation permission is not
reused.
